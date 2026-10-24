from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import (
    PO_CANCELLED,
    PO_CLOSED,
    PO_RECEIVED,
    PR_APPROVED,
    PR_CANCELLED,
    PR_CLOSED,
    PR_DRAFT,
    PR_REJECTED,
    PR_SUBMITTED,
    STEP_PENDING,
    STEP_SKIPPED,
    Budget,
    Item,
    PurchaseRequest,
    PurchaseRequestItem,
)
from ..services import approval, audit, notifications
from ..services import budget as budget_service
from ..services.state_machine import assert_transition
from ..utils import money, parse_date, required, utcnow
from ._helpers import (
    ApiError,
    ensure_pr_visible,
    page_payload,
    pagination,
    payload,
    roles,
    visible_pr_query,
)

bp = Blueprint("prs", __name__, url_prefix="/prs")


@bp.get("")
@login_required
def list_prs():
    query = visible_pr_query()
    status = request.args.get("status")
    if status:
        query = query.filter(PurchaseRequest.status == status)
    search = (request.args.get("q") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(
            db.or_(
                PurchaseRequest.title.ilike(like),
                PurchaseRequest.number.ilike(like),
            )
        )
    page, per_page = pagination()
    result = query.order_by(PurchaseRequest.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify(
        page_payload([pr.to_dict() for pr in result.items], result.total, page, per_page)
    )


@bp.get("/<int:pr_id>")
@login_required
def get_pr(pr_id: int):
    pr = db.session.get(PurchaseRequest, pr_id)
    ensure_pr_visible(pr)
    return jsonify(
        {
            "pr": pr.to_dict(detail=True),
            "approvals": [step.to_dict() for step in approval.steps_for("PR", pr.id)],
            "timeline": audit.timeline("PR", pr.id),
            "rfqs": [rfq.to_dict() for rfq in pr.rfqs],
            "purchase_orders": [po.to_dict() for po in pr.purchase_orders],
        }
    )


@bp.post("")
@roles("Requester")
def create_pr():
    data = payload()
    required(data, ["title", "budget_id", "items"])
    budget = db.session.get(Budget, int(data["budget_id"]))
    if budget is None:
        raise ApiError("Budget tidak ditemukan", 404)
    if budget.department_id != current_user.department_id:
        raise ApiError("Budget bukan milik departemen Anda", 403)

    pr = PurchaseRequest(
        number=__number(),
        title=str(data["title"]).strip(),
        department_id=budget.department_id,
        requester_id=current_user.id,
        budget_id=budget.id,
        status=PR_DRAFT,
        needed_date=parse_date(data.get("needed_date")),
        justification=data.get("justification"),
    )
    _replace_items(pr, data["items"])
    db.session.add(pr)
    db.session.flush()
    audit.log("PR", pr.id, "CREATE", actor=current_user, to_status=PR_DRAFT)
    db.session.commit()
    return jsonify(pr.to_dict(detail=True)), 201


@bp.put("/<int:pr_id>")
@roles("Requester")
def update_pr(pr_id: int):
    pr = db.session.get(PurchaseRequest, pr_id)
    ensure_pr_visible(pr)
    if pr.requester_id != current_user.id:
        raise ApiError("Hanya pembuat PR yang dapat mengubah", 403)
    if pr.status not in (PR_DRAFT, PR_REJECTED):
        raise ApiError(f"PR berstatus {pr.status} tidak dapat diubah")
    data = payload()
    if pr.status == PR_REJECTED:
        assert_transition("PR", pr.status, PR_DRAFT)
        pr.status = PR_DRAFT
        approval.delete_steps("PR", pr.id)
    if "title" in data:
        pr.title = str(data["title"]).strip()
    if "budget_id" in data:
        budget = db.session.get(Budget, int(data["budget_id"]))
        if budget is None or budget.department_id != current_user.department_id:
            raise ApiError("Budget tidak valid untuk departemen Anda")
        pr.budget_id = budget.id
    if "needed_date" in data:
        pr.needed_date = parse_date(data.get("needed_date"))
    if "justification" in data:
        pr.justification = data.get("justification")
    if "items" in data:
        _replace_items(pr, data["items"])
    audit.log("PR", pr.id, "UPDATE", actor=current_user, to_status=pr.status)
    db.session.commit()
    return jsonify(pr.to_dict(detail=True))


@bp.post("/<int:pr_id>/submit")
@roles("Requester")
def submit_pr(pr_id: int):
    pr = db.session.get(PurchaseRequest, pr_id)
    ensure_pr_visible(pr)
    if pr.requester_id != current_user.id:
        raise ApiError("Hanya pembuat PR yang dapat mengajukan", 403)
    if pr.status != PR_DRAFT:
        raise ApiError(f"PR berstatus {pr.status} tidak dapat diajukan")
    if not pr.items:
        raise ApiError("PR harus memiliki minimal satu item")
    assert_transition("PR", pr.status, PR_SUBMITTED)
    approval.delete_steps("PR", pr.id)
    steps = approval.create_steps("PR", pr.id, pr.total_estimated)
    pr.status = PR_SUBMITTED
    pr.submitted_at = utcnow()
    audit.log(
        "PR",
        pr.id,
        "SUBMIT",
        actor=current_user,
        from_status=PR_DRAFT,
        to_status=PR_SUBMITTED,
        notes=f"Menunggu approval level 1 ({steps[0].role})",
    )
    notifications.notify_roles(
        steps[0].role,
        f"PR {pr.number} menunggu approval",
        f"{pr.requester.name} mengajukan {pr.title} senilai Rp{money(pr.total_estimated):,.0f}",
        link=f"/prs/{pr.id}",
    )
    db.session.commit()
    return jsonify({"pr": pr.to_dict(detail=True), "steps": [s.to_dict() for s in steps]})


@bp.post("/<int:pr_id>/revise")
@roles("Requester")
def revise_pr(pr_id: int):
    pr = db.session.get(PurchaseRequest, pr_id)
    ensure_pr_visible(pr)
    if pr.requester_id != current_user.id:
        raise ApiError("Hanya pembuat PR yang dapat merevisi", 403)
    if pr.status != PR_REJECTED:
        raise ApiError("Hanya PR yang ditolak yang dapat direvisi")
    assert_transition("PR", pr.status, PR_DRAFT)
    old = pr.status
    pr.status = PR_DRAFT
    approval.delete_steps("PR", pr.id)
    audit.log("PR", pr.id, "REVISE", actor=current_user, from_status=old, to_status=PR_DRAFT)
    db.session.commit()
    return jsonify(pr.to_dict(detail=True))


@bp.post("/<int:pr_id>/cancel")
@login_required
def cancel_pr(pr_id: int):
    pr = db.session.get(PurchaseRequest, pr_id)
    ensure_pr_visible(pr)
    if current_user.role not in ("Requester", "Procurement Manager"):
        raise ApiError("Tidak punya akses membatalkan PR", 403)
    if current_user.role == "Requester" and pr.requester_id != current_user.id:
        raise ApiError("Hanya pembuat PR yang dapat membatalkan", 403)
    if pr.status not in (PR_DRAFT, PR_SUBMITTED, PR_APPROVED):
        raise ApiError(f"PR berstatus {pr.status} tidak dapat dibatalkan")
    if any(r.status == "POSTED" for po in pr.purchase_orders for r in po.receipts):
        raise ApiError("PR sudah memiliki penerimaan barang; tidak dapat dibatalkan")
    assert_transition("PR", pr.status, PR_CANCELLED)
    old = pr.status
    if old == PR_APPROVED:
        budget_service.release(pr.budget, pr.total_estimated)
    pr.status = PR_CANCELLED
    for step in approval.steps_for("PR", pr.id):
        if step.status == STEP_PENDING:
            step.status = STEP_SKIPPED
    audit.log(
        "PR",
        pr.id,
        "CANCEL",
        actor=current_user,
        from_status=old,
        to_status=PR_CANCELLED,
        notes="Cancel oleh " + current_user.role,
    )
    notifications.notify_user(
        pr.requester_id,
        f"PR {pr.number} dibatalkan",
        f"Dibatalkan oleh {current_user.name}.",
        link=f"/prs/{pr.id}",
    )
    db.session.commit()
    return jsonify(pr.to_dict())


@bp.post("/<int:pr_id>/close")
@roles("Procurement Manager")
def close_pr(pr_id: int):
    pr = db.session.get(PurchaseRequest, pr_id)
    if pr is None:
        raise ApiError("PR tidak ditemukan", 404)
    if pr.status != PR_APPROVED:
        raise ApiError("Hanya PR approved yang dapat ditutup")
    if not pr.purchase_orders:
        raise ApiError("PR belum memiliki PO")
    if any(po.status not in (PO_CLOSED, PO_CANCELLED, PO_RECEIVED) for po in pr.purchase_orders):
        raise ApiError("Masih ada PO yang berjalan")
    assert_transition("PR", pr.status, PR_CLOSED)
    pr.status = PR_CLOSED
    audit.log(
        "PR", pr.id, "CLOSE", actor=current_user, from_status=PR_APPROVED, to_status=PR_CLOSED
    )
    db.session.commit()
    return jsonify(pr.to_dict())


def _replace_items(pr: PurchaseRequest, raw_items: list) -> None:
    if not isinstance(raw_items, list) or not raw_items:
        raise ApiError("Minimal satu item PR")
    pr.items.clear()
    for raw in raw_items:
        description = (raw.get("description") or "").strip()
        if not description:
            raise ApiError("Deskripsi item wajib diisi")
        try:
            qty = money(raw.get("qty"))
        except ValueError as exc:
            raise ApiError("Qty item tidak valid") from exc
        if qty <= 0:
            raise ApiError("Qty item harus lebih dari 0")
        price = money(raw.get("estimated_price") or 0)
        if price < 0:
            raise ApiError("Estimasi harga tidak boleh negatif")
        item_id = raw.get("item_id")
        if item_id and db.session.get(Item, int(item_id)) is None:
            raise ApiError(f"Item {item_id} tidak ditemukan")
        pr.items.append(
            PurchaseRequestItem(
                item_id=int(item_id) if item_id else None,
                description=description[:240],
                qty=qty,
                uom=(raw.get("uom") or "pcs")[:20],
                estimated_price=price,
                subtotal=money(qty * price),
            )
        )
    pr.recalculate()


def __number() -> str:
    from ..services.numbering import next_number

    return next_number("PR")
