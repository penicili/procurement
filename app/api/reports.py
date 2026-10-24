from datetime import UTC
from statistics import mean

from flask import Blueprint, jsonify, request
from flask_login import login_required
from sqlalchemy import func

from ..extensions import db
from ..models import (
    GRN_POSTED,
    INV_VERIFIED,
    Department,
    GoodsReceipt,
    GoodsReceiptItem,
    Invoice,
    Item,
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseRequest,
    PurchaseRequestItem,
    Vendor,
)
from ..utils import money, parse_date

bp = Blueprint("reports", __name__, url_prefix="/reports")


def _base_filters(query):
    date_from = parse_date(request.args.get("from"))
    date_to = parse_date(request.args.get("to"))
    if date_from:
        query = query.filter(GoodsReceipt.received_date >= date_from)
    if date_to:
        query = query.filter(GoodsReceipt.received_date <= date_to)
    return query


@bp.get("/summary")
@login_required
def summary():
    base = (
        db.session.query(
            GoodsReceiptItem.qty_received,
            PurchaseOrderItem.unit_price,
            PurchaseRequest.department_id,
            PurchaseRequestItem.item_id,
            PurchaseOrder.vendor_id,
            GoodsReceipt.received_date,
        )
        .select_from(GoodsReceiptItem)
        .join(GoodsReceipt, GoodsReceiptItem.grn_id == GoodsReceipt.id)
        .join(PurchaseOrderItem, GoodsReceiptItem.po_item_id == PurchaseOrderItem.id)
        .join(PurchaseOrder, PurchaseOrderItem.po_id == PurchaseOrder.id)
        .join(PurchaseRequest, PurchaseOrder.pr_id == PurchaseRequest.id)
        .outerjoin(PurchaseRequestItem, PurchaseOrderItem.pr_item_id == PurchaseRequestItem.id)
        .filter(GoodsReceipt.status == GRN_POSTED)
    )
    base = _base_filters(base)
    rows = base.all()

    dept_names = {d.id: d.name for d in Department.query.all()}
    item_categories = {i.id: (i.category or "Lainnya") for i in Item.query.all()}
    vendor_names = {v.id: v.name for v in Vendor.query.all()}

    total = money(0)
    by_department: dict[str, float] = {}
    by_category: dict[str, float] = {}
    by_month: dict[str, float] = {}
    by_vendor: dict[str, float] = {}

    for qty, price, dept_id, item_id, vendor_id, received_date in rows:
        value = money(qty) * money(price)
        total += value
        dept = dept_names.get(dept_id, "-")
        category = item_categories.get(item_id, "Lainnya")
        vendor = vendor_names.get(vendor_id, "-")
        month = received_date.strftime("%Y-%m") if received_date else "-"
        by_department[dept] = by_department.get(dept, 0) + float(value)
        by_category[category] = by_category.get(category, 0) + float(value)
        by_month[month] = by_month.get(month, 0) + float(value)
        by_vendor[vendor] = by_vendor.get(vendor, 0) + float(value)

    return jsonify(
        {
            "total_spend": float(money(total)),
            "by_department": _series(by_department),
            "by_category": _series(by_category),
            "by_month": _series(by_month, sort=True),
            "top_vendors": _series(by_vendor)[:5],
            "filters": {"from": request.args.get("from"), "to": request.args.get("to")},
        }
    )


@bp.get("/cycle-time")
@login_required
def cycle_time():
    pr_to_po = (
        db.session.query(PurchaseRequest.approved_at, PurchaseOrder.issued_at)
        .join(PurchaseOrder, PurchaseOrder.pr_id == PurchaseRequest.id)
        .filter(PurchaseRequest.approved_at.is_not(None), PurchaseOrder.issued_at.is_not(None))
        .all()
    )
    po_to_grn = (
        db.session.query(PurchaseOrder.issued_at, GoodsReceipt.posted_at)
        .join(GoodsReceipt, GoodsReceipt.po_id == PurchaseOrder.id)
        .filter(
            PurchaseOrder.issued_at.is_not(None),
            GoodsReceipt.posted_at.is_not(None),
            GoodsReceipt.status == GRN_POSTED,
        )
        .all()
    )
    grn_to_invoice = (
        db.session.query(GoodsReceipt.posted_at, Invoice.verified_at)
        .join(GoodsReceipt, Invoice.po_id == GoodsReceipt.po_id)
        .filter(
            GoodsReceipt.posted_at.is_not(None),
            Invoice.verified_at.is_not(None),
            Invoice.status == INV_VERIFIED,
        )
        .all()
    )

    def avg_days(pairs):
        values = [
            (end.astimezone(UTC) - start.astimezone(UTC)).total_seconds() / 86400
            for start, end in pairs
            if start and end
        ]
        return round(mean(values), 1) if values else None

    return jsonify(
        {
            "pr_to_po_days": avg_days(pr_to_po),
            "po_to_grn_days": avg_days(po_to_grn),
            "grn_to_invoice_days": avg_days(grn_to_invoice),
            "samples": {
                "pr_to_po": len(pr_to_po),
                "po_to_grn": len(po_to_grn),
                "grn_to_invoice": len(grn_to_invoice),
            },
        }
    )


@bp.get("/pipeline")
@login_required
def pipeline():
    pr_counts = (
        db.session.query(PurchaseRequest.status, func.count(PurchaseRequest.id))
        .group_by(PurchaseRequest.status)
        .all()
    )
    po_counts = (
        db.session.query(PurchaseOrder.status, func.count(PurchaseOrder.id))
        .group_by(PurchaseOrder.status)
        .all()
    )
    invoice_counts = (
        db.session.query(Invoice.status, func.count(Invoice.id)).group_by(Invoice.status).all()
    )
    return jsonify(
        {
            "pr": {status: count for status, count in pr_counts},
            "po": {status: count for status, count in po_counts},
            "invoice": {status: count for status, count in invoice_counts},
        }
    )


def _series(data: dict[str, float], *, sort: bool = False):
    items = [{"name": key, "value": round(value, 2)} for key, value in data.items()]
    if sort:
        items.sort(key=lambda x: x["name"])
    else:
        items.sort(key=lambda x: x["value"], reverse=True)
    return items
