from flask import Blueprint, current_app, jsonify
from flask_login import current_user, login_required

from ..extensions import db
from ..models import (
    GRN_DRAFT,
    GRN_POSTED,
    INV_DISPUTED,
    INV_HANDED_OFF,
    INV_MATCHED,
    INV_RECEIVED,
    INV_VERIFIED,
    PO_APPROVED,
    PO_CANCELLED,
    PO_CLOSED,
    PO_DRAFT,
    PO_ISSUED,
    PO_PARTIAL,
    PO_PENDING,
    PO_RECEIVED,
    PR_APPROVED,
    PR_CANCELLED,
    PR_CLOSED,
    PR_DRAFT,
    PR_REJECTED,
    PR_SUBMITTED,
    RFQ_AWARDED,
    RFQ_CANCELLED,
    RFQ_DRAFT,
    RFQ_ISSUED,
    ROLES,
    Budget,
    Department,
    Item,
    Vendor,
)
from ..utils import money
from ._helpers import ApiError, payload, roles

bp = Blueprint("references", __name__)


@bp.get("/meta")
@login_required
def meta():
    cfg = current_app.config
    return jsonify(
        {
            "currency": cfg["CURRENCY"],
            "roles": list(ROLES),
            "thresholds": {
                "direct_purchase": cfg["DIRECT_PURCHASE_LIMIT"],
                "tender": cfg["TENDER_LIMIT"],
                "invoice_tolerance_percent": cfg["INVOICE_TOLERANCE_PERCENT"],
            },
            "statuses": {
                "PR": [PR_DRAFT, PR_SUBMITTED, PR_APPROVED, PR_REJECTED, PR_CANCELLED, PR_CLOSED],
                "PO": [
                    PO_DRAFT,
                    PO_PENDING,
                    PO_APPROVED,
                    PO_ISSUED,
                    PO_PARTIAL,
                    PO_RECEIVED,
                    PO_CLOSED,
                    PO_CANCELLED,
                ],
                "RFQ": [RFQ_DRAFT, RFQ_ISSUED, RFQ_AWARDED, RFQ_CANCELLED],
                "GRN": [GRN_DRAFT, GRN_POSTED],
                "INVOICE": [INV_RECEIVED, INV_MATCHED, INV_VERIFIED, INV_DISPUTED, INV_HANDED_OFF],
            },
            "conditions": ["GOOD", "DAMAGED", "WRONG_SPEC", "SHORT"],
            "methods": ["DIRECT", "RFQ", "TENDER"],
        }
    )


@bp.get("/departments")
@login_required
def departments():
    rows = Department.query.order_by(Department.name.asc()).all()
    return jsonify([row.to_dict() for row in rows])


@bp.get("/budgets")
@login_required
def budgets():
    query = Budget.query
    if current_user.role in ("Requester", "Dept Head"):
        query = query.filter(Budget.department_id == current_user.department_id)
    rows = query.order_by(Budget.fiscal_year.desc(), Budget.code.asc()).all()
    return jsonify([row.to_dict() for row in rows])


@bp.post("/budgets")
@roles("Finance", "Procurement Manager")
def create_budget():
    data = payload()
    if not data.get("code") or not data.get("name") or not data.get("department_id"):
        raise ApiError("code, name, department_id wajib diisi")
    if Budget.query.filter_by(code=data["code"]).first():
        raise ApiError("Kode budget sudah dipakai")
    budget = Budget(
        code=data["code"],
        name=data["name"],
        fiscal_year=int(data.get("fiscal_year") or 2026),
        department_id=int(data["department_id"]),
        allocated=money(data.get("allocated") or 0),
    )
    db.session.add(budget)
    db.session.commit()
    return jsonify(budget.to_dict()), 201


@bp.get("/vendors")
@login_required
def vendors():
    query = Vendor.query
    status = request_args("status")
    if status:
        query = query.filter(Vendor.status == status)
    rows = query.order_by(Vendor.name.asc()).all()
    return jsonify([row.to_dict() for row in rows])


@bp.post("/vendors")
@roles("Procurement Officer", "Procurement Manager")
def create_vendor():
    data = payload()
    if not data.get("code") or not data.get("name"):
        raise ApiError("code dan name wajib diisi")
    if Vendor.query.filter_by(code=data["code"]).first():
        raise ApiError("Kode vendor sudah dipakai")
    vendor = Vendor(
        code=data["code"],
        name=data["name"],
        npwp=data.get("npwp"),
        address=data.get("address"),
        contact_name=data.get("contact_name"),
        contact_email=data.get("contact_email"),
        contact_phone=data.get("contact_phone"),
        category=data.get("category"),
        rating=money(data.get("rating") or 0),
        status=data.get("status") or "ACTIVE",
    )
    db.session.add(vendor)
    db.session.commit()
    return jsonify(vendor.to_dict()), 201


@bp.get("/items")
@login_required
def items():
    rows = Item.query.filter_by(is_active_flag=True).order_by(Item.name.asc()).all()
    return jsonify([row.to_dict() for row in rows])


@bp.post("/items")
@roles("Procurement Officer", "Procurement Manager")
def create_item():
    data = payload()
    if not data.get("code") or not data.get("name"):
        raise ApiError("code dan name wajib diisi")
    if Item.query.filter_by(code=data["code"]).first():
        raise ApiError("Kode item sudah dipakai")
    item = Item(
        code=data["code"],
        name=data["name"],
        category=data.get("category"),
        uom=data.get("uom") or "pcs",
        estimated_price=money(data.get("estimated_price") or 0),
    )
    db.session.add(item)
    db.session.commit()
    return jsonify(item.to_dict()), 201


def request_args(name: str):
    from flask import request

    return request.args.get(name)
