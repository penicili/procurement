from decimal import Decimal

from app.extensions import db
from app.models import PurchaseOrder, Vendor


def build_po(flow, qty: int = 10, unit_price: str = "2000000") -> dict:
    pr = flow.create_pr(
        flow.rina,
        "Kursi ergonomis batch uji",
        "IT-2026",
        [
            {
                "description": "Kursi ergonomis",
                "qty": qty,
                "uom": "unit",
                "estimated_price": unit_price,
            }
        ],
    )
    flow.submit(flow.rina, pr["id"])
    flow.approve_until("PR", pr["id"])

    rfq = flow.create_rfq(pr["id"], ["VND-004", "VND-003", "VND-005"], "RFQ")
    item = rfq["pr"]["items"][0]
    flow.add_quotation(rfq["id"], "VND-004", {item["id"]: "1950000"}, 5)
    flow.add_quotation(rfq["id"], "VND-003", {item["id"]: "2050000"}, 7)
    awarded = flow.award_cheapest(rfq["id"])
    selected = next(q for q in awarded["quotations"] if q["status"] == "SELECTED")

    po = flow.create_po(selected["id"])
    flow.submit_po(po["id"])
    flow.approve_until("PO", po["id"])
    flow.issue_po(po["id"])
    return flow.andi.get(f"/api/pos/{po['id']}")["po"]


def grn_payload(po: dict, qty_received: str, qty_rejected: str = "0", condition="GOOD"):
    line = po["items"][0]
    return {
        "po_id": po["id"],
        "received_date": "2026-10-24",
        "delivery_note_no": "DO-TEST-1",
        "items": [
            {
                "po_item_id": line["id"],
                "qty_received": qty_received,
                "qty_rejected": qty_rejected,
                "condition": condition,
                "note": "Barang rusak" if Decimal(qty_rejected) > 0 else None,
            }
        ],
    }


def test_partial_receipt_and_three_way_match(flow):
    po = build_po(flow, qty=10)
    assert po["total"] == 19_500_000

    # Invoice sebelum barang diterima -> disputed
    first_invoice = flow.invoice(po["id"], "INV-TEST-1", "19500000")
    assert first_invoice["status"] == "DISPUTED"

    # Penerimaan sebagian 6 unit
    grn = flow.receive(po["id"], {po["items"][0]["id"]: ("6", "0", "GOOD")})
    assert grn["status"] == "POSTED"
    po_after = flow.andi.get(f"/api/pos/{po['id']}")["po"]
    assert po_after["status"] == "PARTIALLY_RECEIVED"
    assert po_after["items"][0]["received_qty"] == 6

    # Invoice penuh masih melebihi nilai diterima -> disputed
    recheck = flow.andi.post(f"/api/invoices/{first_invoice['id']}/recheck")
    assert recheck["invoice"]["status"] == "DISPUTED"

    # Invoice sesuai nilai diterima -> matched
    second = flow.invoice(po["id"], "INV-TEST-2", "11700000")
    assert second["status"] == "MATCHED"

    # Requester tidak boleh verifikasi
    denied = flow.rina.client.post(f"/api/invoices/{second['id']}/verify")
    assert denied.status_code == 403

    verified = flow.sari.post(f"/api/invoices/{second['id']}/verify")
    assert verified["status"] == "VERIFIED"
    handed = flow.sari.post(f"/api/invoices/{second['id']}/handoff")
    assert handed["status"] == "HANDED_OFF"

    # Pelunasan sisa qty
    flow.receive(po["id"], {po["items"][0]["id"]: ("4", "0", "GOOD")})
    final_po = flow.andi.get(f"/api/pos/{po['id']}")["po"]
    assert final_po["status"] == "RECEIVED"

    budget = db.session.get(PurchaseOrder, po["id"]).pr.budget
    db.session.refresh(budget)
    assert budget.spent == Decimal("19500000.00")


def test_over_receipt_is_rejected(flow):
    po = build_po(flow, qty=10)
    response = flow.gudang.client.post("/api/grns", json=grn_payload(po, "11"))
    assert response.status_code == 400
    assert "melebihi sisa PO" in response.get_json()["error"]["message"]


def test_rejected_qty_requires_note(flow):
    po = build_po(flow, qty=10)
    payload = grn_payload(po, "5", "0", condition="GOOD")
    payload["items"][0]["qty_rejected"] = "0"
    payload["items"][0]["note"] = None
    response = flow.gudang.client.post("/api/grns", json=payload)
    assert response.status_code == 201

    bad = grn_payload(po, "2", "1", condition="DAMAGED")
    bad["items"][0]["note"] = None
    response = flow.gudang.client.post("/api/grns", json=bad)
    assert response.status_code == 400
    assert "Catatan discrepancy" in response.get_json()["error"]["message"]


def test_invoice_tolerance_boundary(flow):
    po = build_po(flow, qty=10)
    flow.receive(po["id"], {po["items"][0]["id"]: ("6", "0", "GOOD")})
    received_value = Decimal("11700000.00")
    limit = received_value * Decimal("1.02")

    at_limit = flow.invoice(po["id"], "INV-TEST-LIMIT", str(limit))
    assert at_limit["status"] == "MATCHED"

    above = flow.invoice(po["id"], "INV-TEST-ABOVE", str(limit + Decimal("1")))
    assert above["status"] == "DISPUTED"


def test_blacklisted_vendor_cannot_be_invited(flow):
    pr = flow.create_pr(
        flow.rina,
        "Uji vendor blacklist",
        "IT-2026",
        [
            {
                "description": "Laptop 14 inch i7",
                "qty": 1,
                "uom": "unit",
                "estimated_price": "5000000",
            }
        ],
    )
    flow.submit(flow.rina, pr["id"])
    flow.approve_until("PR", pr["id"])

    response = flow.andi.client.post(
        "/api/rfqs",
        json={
            "pr_id": pr["id"],
            "vendor_ids": [Vendor.query.filter_by(code="VND-008").one().id],
            "method": "DIRECT",
        },
    )
    assert response.status_code == 400
    assert "blacklist" in response.get_json()["error"]["message"].lower()


def test_double_approval_is_rejected(flow):
    pr = flow.create_pr(
        flow.rina,
        "Uji double approve",
        "IT-2026",
        [
            {
                "description": "Laptop 14 inch i7",
                "qty": 1,
                "uom": "unit",
                "estimated_price": "5000000",
            }
        ],
    )
    flow.submit(flow.rina, pr["id"])
    items = flow.bayu.get("/api/approvals")["items"]
    step_id = next(i for i in items if i["document"]["id"] == pr["id"])["step"]["id"]
    assert flow.bayu.client.post(f"/api/approvals/{step_id}/approve", json={}).status_code == 200
    second = flow.bayu.client.post(f"/api/approvals/{step_id}/approve", json={})
    assert second.status_code in (400, 403)
