from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import (
    INV_DISPUTED,
    INV_HANDED_OFF,
    INV_MATCHED,
    INV_VERIFIED,
    PO_CANCELLED,
    PO_DRAFT,
    PO_PENDING,
    Invoice,
    PurchaseOrder,
    PurchaseRequest,
)
from ..services import audit, matching, notifications
from ..services.state_machine import assert_transition
from ..utils import money, parse_date, required, utcnow
from ._helpers import ApiError, page_payload, pagination, payload, roles

bp = Blueprint("invoices", __name__, url_prefix="/invoices")


@bp.get("")
@login_required
def list_invoices():
    query = _visible_query()
    status = request.args.get("status")
    if status:
        query = query.filter(Invoice.status == status)
    page, per_page = pagination()
    result = query.order_by(Invoice.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify(
        page_payload([row.to_dict() for row in result.items], result.total, page, per_page)
    )


@bp.get("/<int:invoice_id>")
@login_required
def get_invoice(invoice_id: int):
    invoice = db.session.get(Invoice, invoice_id)
    if invoice is None:
        raise ApiError("Invoice tidak ditemukan", 404)
    _ensure_visible(invoice.po)
    summary = matching.evaluate(invoice, apply=False)
    return jsonify(
        {
            "invoice": invoice.to_dict(),
            "match": summary,
            "po": invoice.po.to_dict(detail=True),
            "timeline": audit.timeline("INVOICE", invoice.id),
        }
    )


@bp.post("")
@roles("Procurement Officer", "Procurement Manager", "Finance")
def create_invoice():
    data = payload()
    required(data, ["po_id", "number", "invoice_date", "amount"])
    po = db.session.get(PurchaseOrder, int(data["po_id"]))
    if po is None:
        raise ApiError("PO tidak ditemukan", 404)
    if po.status in (PO_DRAFT, PO_PENDING, PO_CANCELLED):
        raise ApiError(f"PO berstatus {po.status} belum dapat ditagihkan")
    number = str(data["number"]).strip()
    if Invoice.query.filter_by(number=number).first():
        raise ApiError("Nomor invoice sudah tercatat")
    amount = money(data["amount"])
    if amount <= 0:
        raise ApiError("Nilai invoice harus lebih dari 0")

    invoice = Invoice(
        number=number,
        po_id=po.id,
        vendor_id=po.vendor_id,
        invoice_date=parse_date(data["invoice_date"]),
        due_date=parse_date(data.get("due_date")),
        amount=amount,
        status="RECEIVED",
        notes=data.get("notes"),
        created_by=current_user.id,
    )
    db.session.add(invoice)
    db.session.flush()
    summary = matching.evaluate(invoice, apply=True)
    audit.log(
        "INVOICE",
        invoice.id,
        "CREATE",
        actor=current_user,
        to_status=invoice.status,
        notes=invoice.match_notes,
    )
    if summary["matched"]:
        notifications.notify_roles(
            "Finance",
            f"Invoice {invoice.number} siap diverifikasi",
            f"3-way match lolos untuk PO {po.number}.",
            link=f"/invoices/{invoice.id}",
        )
    db.session.commit()
    return jsonify({"invoice": invoice.to_dict(), "match": summary}), 201


@bp.post("/<int:invoice_id>/recheck")
@roles("Procurement Officer", "Procurement Manager", "Finance")
def recheck_invoice(invoice_id: int):
    invoice = db.session.get(Invoice, invoice_id)
    if invoice is None:
        raise ApiError("Invoice tidak ditemukan", 404)
    if invoice.status not in ("RECEIVED", INV_DISPUTED):
        raise ApiError("Recheck hanya untuk invoice RECEIVED/DISPUTED")
    old = invoice.status
    summary = matching.evaluate(invoice, apply=True)
    audit.log(
        "INVOICE",
        invoice.id,
        "RECHECK",
        actor=current_user,
        from_status=old,
        to_status=invoice.status,
        notes=invoice.match_notes,
    )
    db.session.commit()
    return jsonify({"invoice": invoice.to_dict(), "match": summary})


@bp.post("/<int:invoice_id>/verify")
@roles("Finance")
def verify_invoice(invoice_id: int):
    invoice = db.session.get(Invoice, invoice_id)
    if invoice is None:
        raise ApiError("Invoice tidak ditemukan", 404)
    if invoice.status != INV_MATCHED:
        raise ApiError("Hanya invoice yang lolos 3-way match dapat diverifikasi")
    assert_transition("INVOICE", invoice.status, INV_VERIFIED)
    invoice.status = INV_VERIFIED
    invoice.verified_by = current_user.id
    invoice.verified_at = utcnow()
    audit.log(
        "INVOICE",
        invoice.id,
        "VERIFY",
        actor=current_user,
        from_status=INV_MATCHED,
        to_status=INV_VERIFIED,
        notes=f"Diverifikasi oleh Finance: Rp{money(invoice.amount):,.0f}",
    )
    if invoice.created_by:
        notifications.notify_user(
            invoice.created_by,
            f"Invoice {invoice.number} terverifikasi",
            "Invoice siap diteruskan ke aplikasi pembayaran.",
            link=f"/invoices/{invoice.id}",
        )
    db.session.commit()
    return jsonify(invoice.to_dict())


@bp.post("/<int:invoice_id>/handoff")
@roles("Finance")
def handoff_invoice(invoice_id: int):
    invoice = db.session.get(Invoice, invoice_id)
    if invoice is None:
        raise ApiError("Invoice tidak ditemukan", 404)
    assert_transition("INVOICE", invoice.status, INV_HANDED_OFF)
    invoice.status = INV_HANDED_OFF
    audit.log(
        "INVOICE",
        invoice.id,
        "HANDOFF",
        actor=current_user,
        from_status=INV_VERIFIED,
        to_status=INV_HANDED_OFF,
        notes="Diserahkan ke aplikasi finance (di luar scope)",
    )
    db.session.commit()
    return jsonify(invoice.to_dict())


def _visible_query():
    query = Invoice.query.join(PurchaseOrder, Invoice.po_id == PurchaseOrder.id).join(
        PurchaseRequest, PurchaseOrder.pr_id == PurchaseRequest.id
    )
    if current_user.role == "Requester":
        query = query.filter(PurchaseRequest.requester_id == current_user.id)
    elif current_user.role == "Dept Head":
        query = query.filter(PurchaseRequest.department_id == current_user.department_id)
    return query


def _ensure_visible(po: PurchaseOrder) -> None:
    if current_user.role == "Requester" and po.pr.requester_id != current_user.id:
        raise ApiError("Tidak punya akses ke invoice ini", 403)
    if current_user.role == "Dept Head" and po.pr.department_id != current_user.department_id:
        raise ApiError("Tidak punya akses ke invoice ini", 403)
