from datetime import UTC, datetime
from statistics import mean

from flask import Blueprint, jsonify
from flask_login import current_user, login_required
from sqlalchemy import func

from ..extensions import db
from ..models import (
    GRN_POSTED,
    INV_MATCHED,
    PO_CANCELLED,
    PO_CLOSED,
    PO_ISSUED,
    PO_PARTIAL,
    PO_RECEIVED,
    PR_APPROVED,
    PR_SUBMITTED,
    Budget,
    GoodsReceipt,
    GoodsReceiptItem,
    Invoice,
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseRequest,
)
from ..services import approval
from ..utils import as_float, iso, money
from ._helpers import visible_pr_query

bp = Blueprint("dashboard", __name__)


def _scope_po_query():
    query = PurchaseOrder.query.join(PurchaseRequest, PurchaseOrder.pr_id == PurchaseRequest.id)
    if current_user.role == "Requester":
        query = query.filter(PurchaseRequest.requester_id == current_user.id)
    elif current_user.role == "Dept Head":
        query = query.filter(PurchaseRequest.department_id == current_user.department_id)
    return query


@bp.get("/dashboard")
@login_required
def dashboard():
    pr_query = visible_pr_query()
    pr_rows = (
        pr_query.with_entities(PurchaseRequest.status, func.count(PurchaseRequest.id))
        .group_by(PurchaseRequest.status)
        .all()
    )
    pr_by_status = {status: count for status, count in pr_rows}
    pr_total = sum(pr_by_status.values())

    po_query = _scope_po_query()
    po_open = po_query.filter(
        PurchaseOrder.status.in_([PO_ISSUED, PO_PARTIAL, PO_RECEIVED])
    ).count()
    po_value = (
        po_query.filter(PurchaseOrder.status != PO_CANCELLED)
        .with_entities(func.coalesce(func.sum(PurchaseOrder.total), 0))
        .scalar()
    )

    spend_value = (
        db.session.query(
            func.coalesce(func.sum(GoodsReceiptItem.qty_received * PurchaseOrderItem.unit_price), 0)
        )
        .select_from(GoodsReceiptItem)
        .join(GoodsReceipt, GoodsReceiptItem.grn_id == GoodsReceipt.id)
        .join(PurchaseOrderItem, GoodsReceiptItem.po_item_id == PurchaseOrderItem.id)
        .filter(GoodsReceipt.status == GRN_POSTED)
        .scalar()
    )

    dept_spend_rows = (
        db.session.query(
            PurchaseRequest.department_id,
            func.coalesce(
                func.sum(GoodsReceiptItem.qty_received * PurchaseOrderItem.unit_price), 0
            ),
        )
        .select_from(GoodsReceiptItem)
        .join(GoodsReceipt, GoodsReceiptItem.grn_id == GoodsReceipt.id)
        .join(PurchaseOrderItem, GoodsReceiptItem.po_item_id == PurchaseOrderItem.id)
        .join(PurchaseOrder, PurchaseOrderItem.po_id == PurchaseOrder.id)
        .join(PurchaseRequest, PurchaseOrder.pr_id == PurchaseRequest.id)
        .filter(GoodsReceipt.status == GRN_POSTED)
        .group_by(PurchaseRequest.department_id)
        .all()
    )
    from ..models import Department

    dept_names = {d.id: d.name for d in Department.query.all()}
    spend_by_department = [
        {"name": dept_names.get(dept_id, "-"), "value": as_float(money(value))}
        for dept_id, value in dept_spend_rows
    ]

    recent_prs = [
        pr.to_dict() for pr in pr_query.order_by(PurchaseRequest.created_at.desc()).limit(5).all()
    ]
    recent_pos = [
        po.to_dict() for po in po_query.order_by(PurchaseOrder.created_at.desc()).limit(5).all()
    ]

    budget_query = Budget.query
    if current_user.role in ("Requester", "Dept Head"):
        budget_query = budget_query.filter(Budget.department_id == current_user.department_id)
    budgets = [b.to_dict() for b in budget_query.order_by(Budget.code.asc()).limit(6).all()]

    pairs = (
        db.session.query(PurchaseRequest.approved_at, PurchaseOrder.issued_at)
        .join(PurchaseOrder, PurchaseOrder.pr_id == PurchaseRequest.id)
        .filter(
            PurchaseRequest.approved_at.is_not(None),
            PurchaseOrder.issued_at.is_not(None),
        )
        .all()
    )
    cycle_days = None
    if pairs:
        cycle_days = round(
            mean(
                (issued.astimezone(UTC) - approved.astimezone(UTC)).days
                for approved, issued in pairs
            ),
            1,
        )

    invoices_matched = (
        _scope_po_query().join(PurchaseOrder.invoices).filter(Invoice.status == INV_MATCHED).count()
    )

    return jsonify(
        {
            "kpis": {
                "pr_total": pr_total,
                "pr_waiting_approval": pr_by_status.get(PR_SUBMITTED, 0),
                "pr_approved": pr_by_status.get(PR_APPROVED, 0),
                "po_open": po_open,
                "po_closed": po_query.filter(
                    PurchaseOrder.status.in_([PO_CLOSED, PO_RECEIVED])
                ).count(),
                "po_value": as_float(money(po_value)),
                "spend": as_float(money(spend_value)),
                "pending_approvals": len(approval.actionable_for(current_user)),
                "invoices_matched": invoices_matched,
            },
            "pr_by_status": pr_by_status,
            "recent_prs": recent_prs,
            "recent_pos": recent_pos,
            "budgets": budgets,
            "spend_by_department": spend_by_department,
            "cycle_time_days": cycle_days,
            "generated_at": iso(datetime.now(UTC)),
        }
    )
