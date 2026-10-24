from flask import Blueprint, jsonify
from flask_login import current_user, login_required

from ..extensions import db
from ..models import (
    GRN_CANCELLED,
    GRN_DRAFT,
    GRN_POSTED,
    PO_ISSUED,
    PO_PARTIAL,
    PO_RECEIVED,
    GoodsReceipt,
    GoodsReceiptItem,
    PurchaseOrder,
    PurchaseRequest,
)
from ..services import audit, notifications
from ..services import budget as budget_service
from ..services.numbering import next_number
from ..services.state_machine import assert_transition
from ..utils import as_float, money, parse_date, required, utcnow
from ._helpers import ApiError, page_payload, pagination, payload, roles

bp = Blueprint("grns", __name__, url_prefix="/grns")


@bp.get("")
@login_required
def list_grns():
    query = _visible_query()
    page, per_page = pagination()
    result = query.order_by(GoodsReceipt.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify(
        page_payload([row.to_dict() for row in result.items], result.total, page, per_page)
    )


@bp.get("/<int:grn_id>")
@login_required
def get_grn(grn_id: int):
    grn = db.session.get(GoodsReceipt, grn_id)
    if grn is None:
        raise ApiError("GRN tidak ditemukan", 404)
    _ensure_visible(grn.po)
    return jsonify(
        {
            "grn": grn.to_dict(detail=True),
            "po": grn.po.to_dict(detail=True),
            "timeline": audit.timeline("GRN", grn.id),
        }
    )


@bp.post("")
@roles("Warehouse", "Procurement Officer", "Procurement Manager")
def create_grn():
    data = payload()
    required(data, ["po_id", "items"])
    po = db.session.get(PurchaseOrder, int(data["po_id"]))
    if po is None:
        raise ApiError("PO tidak ditemukan", 404)
    if po.status not in (PO_ISSUED, PO_PARTIAL):
        raise ApiError(f"PO berstatus {po.status} tidak dapat diterima")
    if not isinstance(data["items"], list) or not data["items"]:
        raise ApiError("Minimal satu item penerimaan")
    if not data.get("received_date"):
        raise ApiError("Tanggal penerimaan wajib diisi")

    grn = GoodsReceipt(
        number=next_number("GRN"),
        po_id=po.id,
        received_by=current_user.id,
        received_date=parse_date(data.get("received_date")),
        status=GRN_DRAFT,
        delivery_note_no=data.get("delivery_note_no"),
        is_service=bool(data.get("is_service")),
        notes=data.get("notes"),
    )
    po_items = {item.id: item for item in po.items}
    seen: set[int] = set()
    any_qty = False
    for raw in data["items"]:
        po_item_id = int(raw.get("po_item_id") or 0)
        if po_item_id not in po_items:
            raise ApiError("Item penerimaan tidak berasal dari PO ini")
        if po_item_id in seen:
            raise ApiError("Item penerimaan duplikat")
        seen.add(po_item_id)
        po_item = po_items[po_item_id]
        qty_received = money(raw.get("qty_received") or 0)
        qty_rejected = money(raw.get("qty_rejected") or 0)
        if qty_received < 0 or qty_rejected < 0:
            raise ApiError("Qty tidak boleh negatif")
        if qty_received == 0 and qty_rejected == 0:
            continue
        remaining = money(po_item.qty) - money(po_item.received_qty)
        if qty_received > remaining:
            raise ApiError(
                f"Qty diterima melebihi sisa PO untuk {po_item.description} (sisa {remaining})"
            )
        condition = (raw.get("condition") or "GOOD").upper()
        if condition not in ("GOOD", "DAMAGED", "WRONG_SPEC", "SHORT"):
            raise ApiError("Kondisi barang tidak dikenal")
        if qty_rejected > 0 and not (raw.get("note") or "").strip():
            raise ApiError("Catatan discrepancy wajib diisi untuk qty ditolak")
        grn.items.append(
            GoodsReceiptItem(
                po_item_id=po_item_id,
                qty_received=qty_received,
                qty_rejected=qty_rejected,
                condition=condition,
                note=raw.get("note"),
            )
        )
        any_qty = True
    if not any_qty:
        raise ApiError("Tidak ada qty yang diisi")

    db.session.add(grn)
    db.session.flush()
    audit.log(
        "GRN",
        grn.id,
        "CREATE",
        actor=current_user,
        to_status=GRN_DRAFT,
        notes=f"Penerimaan untuk PO {po.number}",
    )
    db.session.commit()
    return jsonify(grn.to_dict(detail=True)), 201


@bp.post("/<int:grn_id>/post")
@roles("Warehouse", "Procurement Officer", "Procurement Manager")
def post_grn(grn_id: int):
    grn = db.session.get(GoodsReceipt, grn_id)
    if grn is None:
        raise ApiError("GRN tidak ditemukan", 404)
    if grn.status != GRN_DRAFT:
        raise ApiError(f"GRN berstatus {grn.status} tidak dapat diposting")
    po = grn.po
    if po.status not in (PO_ISSUED, PO_PARTIAL):
        raise ApiError(f"PO berstatus {po.status} tidak dapat menerima barang")

    total_value = money(0)
    for item in grn.items:
        po_item = item.po_item
        remaining = money(po_item.qty) - money(po_item.received_qty)
        if money(item.qty_received) > remaining:
            raise ApiError(f"Qty melebihi sisa PO untuk {po_item.description}")
        po_item.received_qty = money(po_item.received_qty) + money(item.qty_received)
        total_value += money(item.qty_received) * money(po_item.unit_price)

    old_po_status = po.status
    new_po_status = PO_RECEIVED if po.is_fully_received() else PO_PARTIAL
    if new_po_status != old_po_status:
        assert_transition("PO", old_po_status, new_po_status)
        po.status = new_po_status
    budget_service.spend(po.pr.budget, total_value)

    assert_transition("GRN", grn.status, GRN_POSTED)
    grn.status = GRN_POSTED
    grn.posted_at = utcnow()
    audit.log(
        "GRN",
        grn.id,
        "POST",
        actor=current_user,
        from_status=GRN_DRAFT,
        to_status=GRN_POSTED,
        notes=f"Nilai diterima Rp{total_value:,.0f}; PO menjadi {new_po_status}",
    )
    audit.log(
        "PO",
        po.id,
        "RECEIVE",
        actor=current_user,
        from_status=old_po_status,
        to_status=new_po_status,
        notes=f"GRN {grn.number}: Rp{total_value:,.0f}",
    )
    notifications.notify_user(
        po.pr.requester_id,
        f"Barang diterima untuk PO {po.number}",
        f"GRN {grn.number} diposting. Nilai Rp{total_value:,.0f}.",
        link=f"/pos/{po.id}",
    )
    notifications.notify_roles(
        "Finance",
        f"Realisasi budget dari GRN {grn.number}",
        f"PO {po.number}: Rp{total_value:,.0f} dipindahkan ke realisasi.",
        link=f"/pos/{po.id}",
    )
    db.session.commit()
    return jsonify(grn.to_dict(detail=True))


@bp.post("/<int:grn_id>/cancel")
@roles("Warehouse", "Procurement Officer", "Procurement Manager")
def cancel_grn(grn_id: int):
    grn = db.session.get(GoodsReceipt, grn_id)
    if grn is None:
        raise ApiError("GRN tidak ditemukan", 404)
    assert_transition("GRN", grn.status, GRN_CANCELLED)
    grn.status = GRN_CANCELLED
    audit.log(
        "GRN",
        grn.id,
        "CANCEL",
        actor=current_user,
        from_status=GRN_DRAFT,
        to_status=GRN_CANCELLED,
    )
    db.session.commit()
    return jsonify(grn.to_dict())


def _visible_query():
    query = GoodsReceipt.query.join(PurchaseOrder, GoodsReceipt.po_id == PurchaseOrder.id).join(
        PurchaseRequest, PurchaseOrder.pr_id == PurchaseRequest.id
    )
    if current_user.role == "Requester":
        query = query.filter(PurchaseRequest.requester_id == current_user.id)
    elif current_user.role == "Dept Head":
        query = query.filter(PurchaseRequest.department_id == current_user.department_id)
    return query


def _ensure_visible(po: PurchaseOrder) -> None:
    if current_user.role == "Requester" and po.pr.requester_id != current_user.id:
        raise ApiError("Tidak punya akses ke dokumen ini", 403)
    if current_user.role == "Dept Head" and po.pr.department_id != current_user.department_id:
        raise ApiError("Tidak punya akses ke dokumen ini", 403)


# dipakai oleh modul lain (mis. laporan)
def received_value(po: PurchaseOrder) -> float:
    total = money(0)
    for receipt in po.receipts:
        if receipt.status == GRN_POSTED:
            for item in receipt.items:
                total += money(item.qty_received) * money(item.po_item.unit_price)
    return as_float(total)
