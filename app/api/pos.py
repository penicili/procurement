from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import (
    GRN_POSTED,
    PO_APPROVED,
    PO_CANCELLED,
    PO_CLOSED,
    PO_DRAFT,
    PO_ISSUED,
    PO_PARTIAL,
    PO_PENDING,
    PO_RECEIVED,
    PR_APPROVED,
    PR_CLOSED,
    QT_SELECTED,
    RFQ_AWARDED,
    GoodsReceipt,
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseRequest,
    Quotation,
)
from ..services import approval, audit, matching, notifications
from ..services import budget as budget_service
from ..services.numbering import next_number
from ..services.state_machine import assert_transition
from ..utils import money, parse_date, required, utcnow
from ._helpers import ApiError, page_payload, pagination, payload, roles

bp = Blueprint("pos", __name__, url_prefix="/pos")


@bp.get("")
@login_required
def list_pos():
    query = _visible_query()
    status = request.args.get("status")
    if status:
        query = query.filter(PurchaseOrder.status == status)
    page, per_page = pagination()
    result = query.order_by(PurchaseOrder.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify(
        page_payload([row.to_dict() for row in result.items], result.total, page, per_page)
    )


@bp.get("/<int:po_id>")
@login_required
def get_po(po_id: int):
    po = _load_visible(po_id)
    received_value = matching.received_value(po)
    return jsonify(
        {
            "po": po.to_dict(detail=True),
            "approvals": [step.to_dict() for step in approval.steps_for("PO", po.id)],
            "timeline": audit.timeline("PO", po.id),
            "received_value": float(received_value),
            "receipts": [r.to_dict(detail=True) for r in po.receipts],
            "invoices": [i.to_dict() for i in po.invoices],
        }
    )


@bp.post("")
@roles("Procurement Officer", "Procurement Manager")
def create_po():
    data = payload()
    required(data, ["quotation_id"])
    quotation = db.session.get(Quotation, int(data["quotation_id"]))
    if quotation is None:
        raise ApiError("Quotation tidak ditemukan", 404)
    if quotation.status != QT_SELECTED:
        raise ApiError("Hanya quotation pemenang yang dapat dibuatkan PO")
    if quotation.rfq.status != RFQ_AWARDED:
        raise ApiError("RFQ belum di-award")
    if PurchaseOrder.query.filter_by(quotation_id=quotation.id).first():
        raise ApiError("Quotation ini sudah memiliki PO")
    pr = quotation.rfq.pr
    if pr.status != PR_APPROVED:
        raise ApiError("PR tidak dalam status approved")

    po = PurchaseOrder(
        number=next_number("PO"),
        pr_id=pr.id,
        quotation_id=quotation.id,
        vendor_id=quotation.vendor_id,
        status=PO_DRAFT,
        total=money(quotation.total),
        delivery_date=parse_date(data.get("delivery_date")),
        delivery_address=data.get("delivery_address"),
        terms=data.get("terms"),
        notes=data.get("notes"),
        created_by=current_user.id,
    )
    for q_item in quotation.items:
        po.items.append(
            PurchaseOrderItem(
                pr_item_id=q_item.pr_item_id,
                description=q_item.pr_item.description,
                qty=q_item.qty,
                uom=q_item.pr_item.uom,
                unit_price=q_item.unit_price,
                subtotal=money(q_item.qty) * money(q_item.unit_price),
            )
        )
    db.session.add(po)
    db.session.flush()
    audit.log(
        "PO",
        po.id,
        "CREATE",
        actor=current_user,
        to_status=PO_DRAFT,
        notes=f"Dari quotation {quotation.number} ({quotation.vendor.name})",
    )
    db.session.commit()
    return jsonify(po.to_dict(detail=True)), 201


@bp.post("/<int:po_id>/submit")
@roles("Procurement Officer", "Procurement Manager")
def submit_po(po_id: int):
    po = db.session.get(PurchaseOrder, po_id)
    if po is None:
        raise ApiError("PO tidak ditemukan", 404)
    if po.status != PO_DRAFT:
        raise ApiError(f"PO berstatus {po.status} tidak dapat diajukan")
    assert_transition("PO", po.status, PO_PENDING)
    approval.delete_steps("PO", po.id)
    steps = approval.create_steps("PO", po.id, po.total)
    po.status = PO_PENDING
    audit.log(
        "PO",
        po.id,
        "SUBMIT",
        actor=current_user,
        from_status=PO_DRAFT,
        to_status=PO_PENDING,
        notes=f"Menunggu approval level 1 ({steps[0].role})",
    )
    notifications.notify_roles(
        steps[0].role,
        f"PO {po.number} menunggu approval",
        f"{po.vendor.name} - Rp{money(po.total):,.0f}",
        link=f"/pos/{po.id}",
    )
    db.session.commit()
    return jsonify({"po": po.to_dict(detail=True), "steps": [s.to_dict() for s in steps]})


@bp.post("/<int:po_id>/issue")
@roles("Procurement Officer", "Procurement Manager")
def issue_po(po_id: int):
    po = db.session.get(PurchaseOrder, po_id)
    if po is None:
        raise ApiError("PO tidak ditemukan", 404)
    assert_transition("PO", po.status, PO_ISSUED)
    po.status = PO_ISSUED
    po.issued_at = utcnow()
    audit.log(
        "PO",
        po.id,
        "ISSUE",
        actor=current_user,
        from_status=PO_APPROVED,
        to_status=PO_ISSUED,
        notes=f"Diterbitkan ke {po.vendor.name}",
    )
    notifications.notify_roles(
        ["Requester", "Warehouse"],
        f"PO {po.number} diterbitkan",
        f"{po.vendor.name} akan mengirim barang sesuai jadwal.",
        link=f"/pos/{po.id}",
    )
    db.session.commit()
    return jsonify(po.to_dict(detail=True))


@bp.post("/<int:po_id>/cancel")
@roles("Procurement Officer", "Procurement Manager")
def cancel_po(po_id: int):
    po = db.session.get(PurchaseOrder, po_id)
    if po is None:
        raise ApiError("PO tidak ditemukan", 404)
    if po.status not in (PO_DRAFT, PO_PENDING, PO_APPROVED, PO_ISSUED):
        raise ApiError(f"PO berstatus {po.status} tidak dapat dibatalkan")
    if GoodsReceipt.query.filter_by(po_id=po.id, status=GRN_POSTED).first():
        raise ApiError("PO sudah memiliki penerimaan barang; tidak dapat dibatalkan")
    assert_transition("PO", po.status, PO_CANCELLED)
    old = po.status
    po.status = PO_CANCELLED
    audit.log(
        "PO",
        po.id,
        "CANCEL",
        actor=current_user,
        from_status=old,
        to_status=PO_CANCELLED,
        notes="Commitment budget tetap di PR sampai PR dibatalkan/ditutup",
    )
    db.session.commit()
    return jsonify(po.to_dict())


@bp.post("/<int:po_id>/close")
@roles("Procurement Manager")
def close_po(po_id: int):
    po = db.session.get(PurchaseOrder, po_id)
    if po is None:
        raise ApiError("PO tidak ditemukan", 404)
    if po.status not in (PO_PARTIAL, PO_RECEIVED):
        raise ApiError(f"PO berstatus {po.status} tidak dapat ditutup")
    assert_transition("PO", po.status, PO_CLOSED)
    old = po.status
    po.status = PO_CLOSED
    audit.log(
        "PO",
        po.id,
        "CLOSE",
        actor=current_user,
        from_status=old,
        to_status=PO_CLOSED,
        notes="Sisa qty tidak akan diterima" if old == PO_PARTIAL else "PO selesai",
    )
    _maybe_close_pr(po.pr, actor=current_user)
    db.session.commit()
    return jsonify(po.to_dict(detail=True))


def _maybe_close_pr(pr: PurchaseRequest, *, actor) -> None:
    if pr is None or pr.status != PR_APPROVED or not pr.purchase_orders:
        return
    if all(po.status in (PO_CLOSED, PO_RECEIVED, PO_CANCELLED) for po in pr.purchase_orders):
        received = sum((matching.received_value(po) for po in pr.purchase_orders), money(0))
        remaining = money(pr.total_estimated) - money(received)
        if remaining > 0:
            budget_service.release(pr.budget, remaining)
        pr.status = PR_CLOSED
        audit.log(
            "PR",
            pr.id,
            "AUTO_CLOSE",
            actor=actor,
            from_status=PR_APPROVED,
            to_status=PR_CLOSED,
            notes="Seluruh PO terkait sudah selesai; sisa commitment dirilis",
        )


def _visible_query():
    query = PurchaseOrder.query.join(PurchaseRequest, PurchaseOrder.pr_id == PurchaseRequest.id)
    if current_user.role == "Requester":
        query = query.filter(PurchaseRequest.requester_id == current_user.id)
    elif current_user.role == "Dept Head":
        query = query.filter(PurchaseRequest.department_id == current_user.department_id)
    return query


def _load_visible(po_id: int) -> PurchaseOrder:
    po = db.session.get(PurchaseOrder, po_id)
    if po is None:
        raise ApiError("PO tidak ditemukan", 404)
    if current_user.role == "Requester" and po.pr.requester_id != current_user.id:
        raise ApiError("Tidak punya akses ke PO ini", 403)
    if current_user.role == "Dept Head" and po.pr.department_id != current_user.department_id:
        raise ApiError("Tidak punya akses ke PO ini", 403)
    return po
