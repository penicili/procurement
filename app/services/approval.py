"""Approval engine: rule matrix -> steps -> aksi approve/reject."""

from flask_login import current_user

from ..extensions import db
from ..models import (
    PO_APPROVED,
    PO_DRAFT,
    PO_PENDING,
    PR_APPROVED,
    PR_REJECTED,
    STEP_APPROVED,
    STEP_PENDING,
    STEP_REJECTED,
    STEP_SKIPPED,
    ApprovalRule,
    ApprovalStep,
    PurchaseOrder,
    PurchaseRequest,
)
from ..utils import money, utcnow
from . import audit, budget, notifications, state_machine


def rules_for(doc_type: str, amount) -> list[ApprovalRule]:
    amount = money(amount)
    return (
        ApprovalRule.query.filter(
            ApprovalRule.doc_type == doc_type,
            ApprovalRule.min_amount <= amount,
            db.or_(ApprovalRule.max_amount.is_(None), ApprovalRule.max_amount >= amount),
        )
        .order_by(ApprovalRule.sequence.asc())
        .all()
    )


def create_steps(doc_type: str, doc_id: int, amount) -> list[ApprovalStep]:
    rules = rules_for(doc_type, amount)
    if not rules:
        raise ValueError(
            f"Tidak ada approval rule untuk {doc_type} dengan nilai Rp{money(amount):,.0f}"
        )
    steps = [
        ApprovalStep(
            doc_type=doc_type,
            doc_id=doc_id,
            sequence=rule.sequence,
            role=rule.role,
            status=STEP_PENDING,
        )
        for rule in rules
    ]
    db.session.add_all(steps)
    db.session.flush()
    return steps


def steps_for(doc_type: str, doc_id: int) -> list[ApprovalStep]:
    return (
        ApprovalStep.query.filter_by(doc_type=doc_type, doc_id=doc_id)
        .order_by(ApprovalStep.sequence.asc())
        .all()
    )


def delete_steps(doc_type: str, doc_id: int) -> None:
    for step in steps_for(doc_type, doc_id):
        db.session.delete(step)
    db.session.flush()


def is_actionable(step: ApprovalStep) -> bool:
    if step.status != STEP_PENDING:
        return False
    previous = ApprovalStep.query.filter(
        ApprovalStep.doc_type == step.doc_type,
        ApprovalStep.doc_id == step.doc_id,
        ApprovalStep.sequence < step.sequence,
    ).all()
    return all(prev.status == STEP_APPROVED for prev in previous)


def actionable_for(user) -> list[ApprovalStep]:
    candidates = (
        ApprovalStep.query.filter_by(role=user.role, status=STEP_PENDING)
        .order_by(ApprovalStep.doc_id.asc(), ApprovalStep.sequence.asc())
        .all()
    )
    result = []
    for step in candidates:
        if is_actionable(step) and _department_ok(step, user):
            linked = _load_doc(step.doc_type, step.doc_id)
            if linked is not None:
                result.append(step)
    return result


def _department_ok(step: ApprovalStep, actor) -> bool:
    """Dept Head hanya boleh memutuskan PR dari departemennya sendiri."""
    if step.role != "Dept Head" or step.doc_type != "PR":
        return True
    pr = db.session.get(PurchaseRequest, step.doc_id)
    return pr is not None and pr.department_id == actor.department_id


def approve(step: ApprovalStep, actor, note: str | None = None) -> dict:
    _guard(step, actor)
    step.status = STEP_APPROVED
    step.actor_id = actor.id
    step.acted_at = utcnow()
    step.note = note
    db.session.flush()

    steps = steps_for(step.doc_type, step.doc_id)
    if all(s.status == STEP_APPROVED for s in steps):
        _on_final_approval(step.doc_type, step.doc_id, actor, step)
        final = True
    else:
        final = False
        next_step = next((s for s in steps if s.status == STEP_PENDING), None)
        if next_step:
            notifications.notify_roles(
                next_step.role,
                f"Approval dibutuhkan: {step.doc_type} #{step.doc_id}",
                f"Level {next_step.sequence} menunggu persetujuan Anda.",
                link=_doc_link(step.doc_type, step.doc_id),
            )
    audit.log(
        step.doc_type,
        step.doc_id,
        "APPROVE" if final else f"APPROVE_L{step.sequence}",
        actor=actor,
        notes=note,
    )
    return {"final": final, "steps": [s.to_dict() for s in steps]}


def reject(step: ApprovalStep, actor, note: str | None) -> dict:
    _guard(step, actor)
    if not note:
        raise ValueError("Alasan penolakan wajib diisi")
    step.status = STEP_REJECTED
    step.actor_id = actor.id
    step.acted_at = utcnow()
    step.note = note
    for other in steps_for(step.doc_type, step.doc_id):
        if other.sequence > step.sequence and other.status == STEP_PENDING:
            other.status = STEP_SKIPPED

    if step.doc_type == "PR":
        pr = db.session.get(PurchaseRequest, step.doc_id)
        old = pr.status
        pr.status = PR_REJECTED
        db.session.flush()
        audit.log(
            "PR", pr.id, "REJECT", actor=actor, from_status=old, to_status=pr.status, notes=note
        )
        notifications.notify_user(
            pr.requester_id,
            f"PR {pr.number} ditolak",
            f"Ditolak pada level {step.sequence} oleh {actor.name}: {note}",
            link=f"/prs/{pr.id}",
        )
    elif step.doc_type == "PO":
        po = db.session.get(PurchaseOrder, step.doc_id)
        old = po.status
        po.status = PO_DRAFT
        db.session.flush()
        audit.log(
            "PO", po.id, "REJECT", actor=actor, from_status=old, to_status=po.status, notes=note
        )
        if po.created_by:
            notifications.notify_user(
                po.created_by,
                f"PO {po.number} ditolak",
                f"Ditolak pada level {step.sequence} oleh {actor.name}: {note}",
                link=f"/pos/{po.id}",
            )
    return {"steps": [s.to_dict() for s in steps_for(step.doc_type, step.doc_id)]}


def _guard(step: ApprovalStep, actor) -> None:
    if step.status != STEP_PENDING:
        raise ValueError("Step approval ini sudah diproses")
    if step.role != actor.role:
        raise PermissionError(f"Step ini hanya untuk role {step.role}")
    if not _department_ok(step, actor):
        raise PermissionError("Step ini hanya untuk Dept Head dari departemen peminta")
    if not is_actionable(step):
        raise ValueError("Approval sebelumnya belum selesai")
    doc = _load_doc(step.doc_type, step.doc_id)
    if doc is None:
        raise ValueError("Dokumen tidak ditemukan")
    expected = PO_PENDING if step.doc_type == "PO" else "SUBMITTED"
    if doc.status != expected:
        raise ValueError(f"Dokumen tidak dalam status yang bisa di-approve ({doc.status})")


def _on_final_approval(doc_type: str, doc_id: int, actor, step: ApprovalStep) -> None:
    if doc_type == "PR":
        pr = db.session.get(PurchaseRequest, doc_id)
        old = pr.status
        state_machine.assert_transition("PR", old, PR_APPROVED)
        pr.status = PR_APPROVED
        pr.approved_at = utcnow()
        budget.commit(pr.budget, pr.total_estimated)
        db.session.flush()
        audit.log(
            "PR",
            pr.id,
            "FINAL_APPROVE",
            actor=actor,
            from_status=old,
            to_status=pr.status,
            notes=f"PR disetujui penuh; budget {pr.budget.code} ter-commit",
        )
        notifications.notify_user(
            pr.requester_id,
            f"PR {pr.number} disetujui",
            "PR disetujui penuh. Silakan lanjutkan ke proses sourcing.",
            link=f"/prs/{pr.id}",
        )
        notifications.notify_roles(
            "Procurement Officer",
            f"PR {pr.number} siap di-sourcing",
            f"PR dari {pr.department.name} senilai Rp{money(pr.total_estimated):,.0f}",
            link=f"/prs/{pr.id}",
        )
    elif doc_type == "PO":
        po = db.session.get(PurchaseOrder, doc_id)
        old = po.status
        state_machine.assert_transition("PO", old, PO_APPROVED)
        po.status = PO_APPROVED
        db.session.flush()
        audit.log(
            "PO",
            po.id,
            "FINAL_APPROVE",
            actor=actor,
            from_status=old,
            to_status=po.status,
            notes="PO disetujui penuh",
        )
        if po.created_by:
            notifications.notify_user(
                po.created_by,
                f"PO {po.number} disetujui",
                "PO sudah bisa diterbitkan ke vendor.",
                link=f"/pos/{po.id}",
            )


def _load_doc(doc_type: str, doc_id: int):
    if doc_type == "PR":
        return db.session.get(PurchaseRequest, doc_id)
    if doc_type == "PO":
        return db.session.get(PurchaseOrder, doc_id)
    return None


def _doc_link(doc_type: str, doc_id: int) -> str:
    return f"/prs/{doc_id}" if doc_type == "PR" else f"/pos/{doc_id}"


def current_user_role() -> str:
    return getattr(current_user, "role", "")
