from decimal import Decimal

import pytest

from app.extensions import db
from app.models import (
    PR_APPROVED,
    PR_DRAFT,
    PR_REJECTED,
    PR_SUBMITTED,
    STEP_PENDING,
    STEP_SKIPPED,
    ApprovalStep,
    Budget,
)
from app.services import approval
from app.services.state_machine import InvalidTransition, assert_transition


def pr_payload(unit_price: str = "5000000", qty: int = 1) -> list[dict]:
    return [
        {
            "description": "Laptop 14 inch i7",
            "qty": qty,
            "uom": "unit",
            "estimated_price": unit_price,
        }
    ]


def pending_step(client, doc_type: str):
    items = client.get("/api/approvals")["items"]
    return next(item for item in items if item["doc_type"] == doc_type)


def test_approval_matrix_per_tier(flow):
    base = [(r.sequence, r.role) for r in approval.rules_for("PR", 5_000_000)]
    mid = [(r.sequence, r.role) for r in approval.rules_for("PR", 50_000_000)]
    high = [(r.sequence, r.role) for r in approval.rules_for("PR", 150_000_000)]
    po_small = [(r.sequence, r.role) for r in approval.rules_for("PO", 5_000_000)]

    assert base == [(1, "Dept Head"), (2, "Finance")]
    assert mid == [(1, "Dept Head"), (2, "Finance"), (3, "Procurement Manager")]
    assert len(high) == 4 and high[-1] == (4, "Director")
    assert po_small == [(1, "Procurement Manager")]


def test_sequential_approval_and_budget_commit(flow, budget_ids):
    pr = flow.create_pr(flow.rina, "Monitor ruang desain", "IT-2026", pr_payload("1800000", 2))
    flow.submit(flow.rina, pr["id"])

    # Finance belum boleh approve sebelum Dept Head
    finance_inbox = flow.sari.get("/api/approvals")["items"]
    assert not any(i["document"]["id"] == pr["id"] for i in finance_inbox)

    finance_step = ApprovalStep.query.filter_by(
        doc_type="PR", doc_id=pr["id"], role="Finance"
    ).one()
    response = flow.sari.client.post(
        f"/api/approvals/{finance_step.id}/approve", json={"note": "skip"}
    )
    assert response.status_code == 400

    flow.bayu.post(
        f"/api/approvals/{pending_step(flow.bayu, 'PR')['step']['id']}/approve",
        {"note": "OK"},
    )
    flow.sari.post(
        f"/api/approvals/{pending_step(flow.sari, 'PR')['step']['id']}/approve",
        {"note": "Budget tersedia"},
    )

    detail = flow.rina.get(f"/api/prs/{pr['id']}")["pr"]
    assert detail["status"] == PR_APPROVED
    budget = db.session.get(Budget, budget_ids["IT-2026"])
    db.session.refresh(budget)
    assert budget.committed == Decimal("3600000.00")


def test_reject_then_revise_and_resubmit(flow):
    pr = flow.create_pr(flow.rina, "Kursi tambahan", "IT-2026", pr_payload("2500000", 2))
    flow.submit(flow.rina, pr["id"])
    step = pending_step(flow.bayu, "PR")
    flow.bayu.post(
        f"/api/approvals/{step['step']['id']}/reject",
        {"note": "Spesifikasi belum lengkap"},
    )

    detail = flow.rina.get(f"/api/prs/{pr['id']}")
    assert detail["pr"]["status"] == PR_REJECTED
    statuses = {s["role"]: s["status"] for s in detail["approvals"]}
    assert statuses["Finance"] == STEP_SKIPPED

    flow.rina.post(f"/api/prs/{pr['id']}/revise")
    revised = flow.rina.get(f"/api/prs/{pr['id']}")
    assert revised["pr"]["status"] == PR_DRAFT
    assert revised["approvals"] == []

    flow.rina.put(
        f"/api/prs/{pr['id']}",
        {
            "title": "Kursi tambahan (revisi)",
            "items": pr_payload("2500000", 2),
        },
    )
    flow.submit(flow.rina, pr["id"])
    resubmitted = flow.rina.get(f"/api/prs/{pr['id']}")
    assert resubmitted["pr"]["status"] == PR_SUBMITTED
    assert all(s["status"] == STEP_PENDING for s in resubmitted["approvals"])
    assert len(resubmitted["approvals"]) == 2


def test_budget_insufficient_blocks_final_approval(flow, budget_ids):
    budget = db.session.get(Budget, budget_ids["IT-2026"])
    budget.allocated = Decimal("1000.00")
    db.session.commit()

    pr = flow.create_pr(flow.rina, "Pengadaan besar", "IT-2026", pr_payload("5000000", 1))
    flow.submit(flow.rina, pr["id"])
    flow.bayu.post(
        f"/api/approvals/{pending_step(flow.bayu, 'PR')['step']['id']}/approve",
        {"note": "OK"},
    )
    finance = pending_step(flow.sari, "PR")
    response = flow.sari.client.post(
        f"/api/approvals/{finance['step']['id']}/approve", json={"note": "OK"}
    )
    assert response.status_code == 400
    assert "Budget tidak cukup" in response.get_json()["error"]["message"]

    db.session.expire_all()
    detail = flow.rina.get(f"/api/prs/{pr['id']}")["pr"]
    assert detail["status"] == PR_SUBMITTED
    budget = db.session.get(Budget, budget_ids["IT-2026"])
    assert budget.committed == Decimal("0.00")


def test_requester_cannot_approve(flow):
    pr = flow.create_pr(flow.rina, "Barang kecil", "IT-2026", pr_payload("1000000", 1))
    flow.submit(flow.rina, pr["id"])
    step = pending_step(flow.bayu, "PR")
    response = flow.rina.client.post(
        f"/api/approvals/{step['step']['id']}/approve", json={"note": "self approve"}
    )
    assert response.status_code == 403


def test_dept_head_scope_is_limited_to_own_department(flow):
    pr = flow.create_pr(flow.rina, "Monitor tim desain", "IT-2026", pr_payload("1800000", 1))
    flow.submit(flow.rina, pr["id"])

    other_inbox = flow.hendra.get("/api/approvals")["items"]
    assert not any(item["document"]["id"] == pr["id"] for item in other_inbox)

    step = ApprovalStep.query.filter_by(doc_type="PR", doc_id=pr["id"], role="Dept Head").one()
    response = flow.hendra.client.post(
        f"/api/approvals/{step.id}/approve", json={"note": "lintas departemen"}
    )
    assert response.status_code == 403
    assert "departemen" in response.get_json()["error"]["message"]

    own_inbox = flow.bayu.get("/api/approvals")["items"]
    assert any(item["document"]["id"] == pr["id"] for item in own_inbox)


def test_invalid_transition_is_rejected():
    with pytest.raises(InvalidTransition):
        assert_transition("PR", "DRAFT", "ISSUED")
