from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import (
    PR_APPROVED,
    QT_REJECTED,
    QT_SELECTED,
    QT_SUBMITTED,
    RFQ,
    RFQ_AWARDED,
    RFQ_CANCELLED,
    RFQ_DRAFT,
    RFQ_ISSUED,
    PurchaseRequest,
    Quotation,
    QuotationItem,
    RFQVendor,
    Vendor,
)
from ..services import audit, notifications
from ..services.numbering import next_number
from ..services.state_machine import assert_transition
from ..utils import money, parse_date, required, utcnow
from ._helpers import ApiError, page_payload, pagination, payload, roles

bp = Blueprint("rfqs", __name__, url_prefix="/rfqs")


@bp.get("")
@login_required
def list_rfqs():
    query = _visible_query()
    status = request.args.get("status")
    if status:
        query = query.filter(RFQ.status == status)
    page, per_page = pagination()
    result = query.order_by(RFQ.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify(
        page_payload([row.to_dict() for row in result.items], result.total, page, per_page)
    )


@bp.get("/<int:rfq_id>")
@login_required
def get_rfq(rfq_id: int):
    rfq = db.session.get(RFQ, rfq_id)
    if rfq is None:
        raise ApiError("RFQ tidak ditemukan", 404)
    if current_user.role == "Requester" and rfq.pr.requester_id != current_user.id:
        raise ApiError("Tidak punya akses ke RFQ ini", 403)
    if current_user.role == "Dept Head" and rfq.pr.department_id != current_user.department_id:
        raise ApiError("Tidak punya akses ke RFQ ini", 403)

    cheapest = min(
        (q for q in rfq.quotations if q.status != QT_REJECTED),
        key=lambda q: money(q.total),
        default=None,
    )
    return jsonify(
        {
            "rfq": rfq.to_dict(detail=True),
            "timeline": audit.timeline("RFQ", rfq.id),
            "comparison": [
                {
                    **q.to_dict(detail=True),
                    "is_cheapest": cheapest is not None and q.id == cheapest.id,
                }
                for q in rfq.quotations
            ],
        }
    )


@bp.post("")
@roles("Procurement Officer", "Procurement Manager")
def create_rfq():
    data = payload()
    required(data, ["pr_id", "vendor_ids"])
    pr = db.session.get(PurchaseRequest, int(data["pr_id"]))
    if pr is None:
        raise ApiError("PR tidak ditemukan", 404)
    if pr.status != PR_APPROVED:
        raise ApiError("RFQ hanya dapat dibuat dari PR yang sudah approved")
    if RFQ.query.filter(RFQ.pr_id == pr.id, RFQ.status != RFQ_CANCELLED).first():
        raise ApiError("PR ini sudah memiliki RFQ aktif")

    vendor_ids = [int(v) for v in data["vendor_ids"]]
    vendors = Vendor.query.filter(Vendor.id.in_(vendor_ids)).all()
    if len(vendors) != len(set(vendor_ids)):
        raise ApiError("Ada vendor yang tidak ditemukan")
    blacklisted = [v.name for v in vendors if v.status != "ACTIVE"]
    if blacklisted:
        raise ApiError(f"Vendor blacklist tidak dapat diundang: {', '.join(blacklisted)}")

    method = data.get("method") or _default_method(pr.total_estimated)
    if method not in ("DIRECT", "RFQ", "TENDER"):
        raise ApiError("Metode sourcing tidak dikenal")
    if method == "DIRECT" and len(vendors) > 1:
        raise ApiError("Direct purchase hanya untuk satu vendor")
    if method != "DIRECT" and len(vendors) < 3 and not data.get("justification"):
        raise ApiError("RFQ/Tender membutuhkan minimal 3 vendor (atau isi justifikasi)")

    rfq = RFQ(
        number=next_number("RFQ"),
        pr_id=pr.id,
        method=method,
        status=RFQ_DRAFT,
        deadline=parse_date(data.get("deadline")),
        notes=data.get("justification") or data.get("notes"),
        created_by=current_user.id,
    )
    for vendor in vendors:
        rfq.vendor_invites.append(RFQVendor(vendor_id=vendor.id))
    db.session.add(rfq)
    db.session.flush()
    audit.log("RFQ", rfq.id, "CREATE", actor=current_user, to_status=RFQ_DRAFT)
    db.session.commit()
    return jsonify(rfq.to_dict(detail=True)), 201


@bp.post("/<int:rfq_id>/issue")
@roles("Procurement Officer", "Procurement Manager")
def issue_rfq(rfq_id: int):
    rfq = db.session.get(RFQ, rfq_id)
    if rfq is None:
        raise ApiError("RFQ tidak ditemukan", 404)
    assert_transition("RFQ", rfq.status, RFQ_ISSUED)
    rfq.status = RFQ_ISSUED
    audit.log(
        "RFQ", rfq.id, "ISSUE", actor=current_user, from_status=RFQ_DRAFT, to_status=RFQ_ISSUED
    )
    db.session.commit()
    return jsonify(rfq.to_dict(detail=True))


@bp.post("/<int:rfq_id>/quotations")
@roles("Procurement Officer", "Procurement Manager")
def create_quotation(rfq_id: int):
    rfq = db.session.get(RFQ, rfq_id)
    if rfq is None:
        raise ApiError("RFQ tidak ditemukan", 404)
    if rfq.status != RFQ_ISSUED:
        raise ApiError("Quotation hanya dapat diinput saat RFQ berstatus ISSUED")
    data = payload()
    required(data, ["vendor_id", "items"])
    vendor_id = int(data["vendor_id"])
    invited = {invite.vendor_id for invite in rfq.vendor_invites}
    if vendor_id not in invited:
        raise ApiError("Vendor tidak diundang pada RFQ ini")
    if Quotation.query.filter_by(rfq_id=rfq.id, vendor_id=vendor_id).first():
        raise ApiError("Vendor ini sudah mengirim quotation")

    quotation = Quotation(
        number=next_number("QT"),
        rfq_id=rfq.id,
        vendor_id=vendor_id,
        status=QT_SUBMITTED,
        lead_time_days=int(data.get("lead_time_days") or 0),
        warranty=data.get("warranty"),
        valid_until=parse_date(data.get("valid_until")),
        notes=data.get("notes"),
        created_by=current_user.id,
    )
    pr_items = {item.id: item for item in rfq.pr.items}
    raw_items = data["items"]
    if not isinstance(raw_items, list) or not raw_items:
        raise ApiError("Quotation harus memiliki item")
    seen: set[int] = set()
    for raw in raw_items:
        pr_item_id = int(raw.get("pr_item_id") or 0)
        if pr_item_id not in pr_items:
            raise ApiError("Item quotation tidak berasal dari PR ini")
        if pr_item_id in seen:
            raise ApiError("Item quotation duplikat")
        seen.add(pr_item_id)
        qty = money(raw.get("qty") or pr_items[pr_item_id].qty)
        if qty <= 0:
            raise ApiError("Qty quotation harus lebih dari 0")
        unit_price = money(raw.get("unit_price"))
        if unit_price < 0:
            raise ApiError("Harga satuan tidak boleh negatif")
        quotation.items.append(
            QuotationItem(
                pr_item_id=pr_item_id,
                qty=qty,
                unit_price=unit_price,
                subtotal=money(qty * unit_price),
            )
        )
    if seen != set(pr_items):
        raise ApiError("Semua item PR harus dikutip")
    quotation.recalculate()
    db.session.add(quotation)
    db.session.flush()
    invite = RFQVendor.query.filter_by(rfq_id=rfq.id, vendor_id=vendor_id).first()
    if invite:
        invite.responded_at = utcnow()
    audit.log(
        "RFQ",
        rfq.id,
        "QUOTATION_RECEIVED",
        actor=current_user,
        notes=f"{quotation.vendor.name}: Rp{money(quotation.total):,.0f}",
    )
    db.session.commit()
    return jsonify(quotation.to_dict(detail=True)), 201


@bp.post("/<int:rfq_id>/award")
@roles("Procurement Manager")
def award_rfq(rfq_id: int):
    rfq = db.session.get(RFQ, rfq_id)
    if rfq is None:
        raise ApiError("RFQ tidak ditemukan", 404)
    if rfq.status != RFQ_ISSUED:
        raise ApiError("Hanya RFQ berstatus ISSUED yang dapat di-award")
    data = payload()
    required(data, ["quotation_id"])
    quotation = db.session.get(Quotation, int(data["quotation_id"]))
    if quotation is None or quotation.rfq_id != rfq.id:
        raise ApiError("Quotation bukan milik RFQ ini")
    active = [q for q in rfq.quotations if q.status != QT_REJECTED]
    minimum = 1 if rfq.method == "DIRECT" else 2
    if len(active) < minimum:
        raise ApiError(f"Minimal {minimum} quotation untuk menetapkan pemenang")
    if data.get("justification"):
        rfq.notes = f"{rfq.notes or ''}\nJustifikasi pemenang: {data['justification']}".strip()

    for other in rfq.quotations:
        other.status = QT_SELECTED if other.id == quotation.id else QT_REJECTED
    assert_transition("RFQ", rfq.status, RFQ_AWARDED)
    rfq.status = RFQ_AWARDED
    audit.log(
        "RFQ",
        rfq.id,
        "AWARD",
        actor=current_user,
        from_status=RFQ_ISSUED,
        to_status=RFQ_AWARDED,
        notes=f"Pemenang: {quotation.vendor.name} (Rp{money(quotation.total):,.0f})",
    )
    notifications.notify_roles(
        "Procurement Officer",
        f"RFQ {rfq.number} sudah ada pemenang",
        f"{quotation.vendor.name} terpilih. Silakan buat PO.",
        link=f"/rfqs/{rfq.id}",
    )
    db.session.commit()
    return jsonify(rfq.to_dict(detail=True))


def _visible_query():
    query = RFQ.query.join(PurchaseRequest, RFQ.pr_id == PurchaseRequest.id)
    if current_user.role == "Requester":
        query = query.filter(PurchaseRequest.requester_id == current_user.id)
    elif current_user.role == "Dept Head":
        query = query.filter(PurchaseRequest.department_id == current_user.department_id)
    return query


def _default_method(total) -> str:
    from flask import current_app

    total = money(total)
    if total <= current_app.config["DIRECT_PURCHASE_LIMIT"]:
        return "DIRECT"
    if total <= current_app.config["TENDER_LIMIT"]:
        return "RFQ"
    return "TENDER"
