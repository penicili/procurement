from flask import Blueprint, jsonify
from flask_login import current_user, login_required

from ..extensions import db
from ..models import ApprovalStep, PurchaseOrder, PurchaseRequest
from ..services import approval
from ._helpers import ApiError, payload

bp = Blueprint("approvals", __name__, url_prefix="/approvals")


@bp.get("")
@login_required
def inbox():
    items = []
    for step in approval.actionable_for(current_user):
        doc = _load(step.doc_type, step.doc_id)
        if doc is None:
            continue
        items.append(
            {
                "step": step.to_dict(),
                "doc_type": step.doc_type,
                "document": doc.to_dict(),
                "waiting_since": step.created_at.isoformat() if step.created_at else None,
            }
        )
    return jsonify({"items": items, "total": len(items)})


@bp.post("/<int:step_id>/approve")
@login_required
def approve(step_id: int):
    step = db.session.get(ApprovalStep, step_id)
    if step is None:
        raise ApiError("Step approval tidak ditemukan", 404)
    data = payload()
    result = approval.approve(step, current_user, (data.get("note") or "").strip() or None)
    db.session.commit()
    doc = _load(step.doc_type, step.doc_id)
    return jsonify(
        {
            "final": result["final"],
            "steps": result["steps"],
            "document": doc.to_dict() if doc else None,
        }
    )


@bp.post("/<int:step_id>/reject")
@login_required
def reject(step_id: int):
    step = db.session.get(ApprovalStep, step_id)
    if step is None:
        raise ApiError("Step approval tidak ditemukan", 404)
    data = payload()
    result = approval.reject(step, current_user, (data.get("note") or "").strip())
    db.session.commit()
    doc = _load(step.doc_type, step.doc_id)
    return jsonify({"steps": result["steps"], "document": doc.to_dict() if doc else None})


@bp.get("/history")
@login_required
def history():
    rows = (
        ApprovalStep.query.filter(
            ApprovalStep.actor_id == current_user.id,
            ApprovalStep.status.in_(["APPROVED", "REJECTED"]),
        )
        .order_by(ApprovalStep.acted_at.desc())
        .limit(30)
        .all()
    )
    return jsonify(
        [
            {
                "step": row.to_dict(),
                "document": (
                    _load(row.doc_type, row.doc_id).to_dict()
                    if _load(row.doc_type, row.doc_id)
                    else None
                ),
            }
            for row in rows
        ]
    )


def _load(doc_type: str, doc_id: int):
    if doc_type == "PR":
        return db.session.get(PurchaseRequest, doc_id)
    if doc_type == "PO":
        return db.session.get(PurchaseOrder, doc_id)
    return None
