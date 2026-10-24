"""3-way match: PO - GRN - Invoice."""

from decimal import Decimal

from flask import current_app

from ..models import (
    GRN_POSTED,
    INV_DISPUTED,
    INV_MATCHED,
    PO_CLOSED,
    PO_PARTIAL,
    PO_RECEIVED,
)
from ..utils import money


def received_value(po) -> Decimal:
    total = money(0)
    for receipt in po.receipts:
        if receipt.status != GRN_POSTED:
            continue
        for item in receipt.items:
            total += money(item.qty_received) * money(item.po_item.unit_price)
    return money(total)


def received_qty(po) -> Decimal:
    total = money(0)
    for receipt in po.receipts:
        if receipt.status != GRN_POSTED:
            continue
        total += sum((money(i.qty_received) for i in receipt.items), money(0))
    return money(total)


def evaluate(invoice, *, apply: bool = True) -> dict:
    po = invoice.po
    value = received_value(po)
    pct = Decimal(str(current_app.config.get("INVOICE_TOLERANCE_PERCENT", 2)))
    minimum = money(current_app.config.get("INVOICE_TOLERANCE_MIN", "10000"))
    tolerance = max(money(value * pct / Decimal("100")), minimum)
    limit = money(value + tolerance)
    amount = money(invoice.amount)

    reasons: list[str] = []
    if po.status not in (PO_PARTIAL, PO_RECEIVED, PO_CLOSED):
        reasons.append(f"PO belum dalam tahap penerimaan (status {po.status})")
    if value <= 0:
        reasons.append("Belum ada barang/jasa yang diterima (GRN posted)")
    if amount <= 0:
        reasons.append("Nilai invoice harus lebih dari 0")
    if value > 0 and amount > limit:
        reasons.append(
            f"Nilai invoice Rp{amount:,.0f} melebihi nilai diterima + toleransi "
            f"Rp{limit:,.0f} (diterima Rp{value:,.0f}, toleransi {pct:g}%/min Rp{minimum:,.0f})"
        )

    matched = not reasons
    if apply:
        invoice.status = INV_MATCHED if matched else INV_DISPUTED
        invoice.match_notes = (
            "3-way match lolos: nilai invoice dalam toleransi." if matched else " | ".join(reasons)
        )

    return {
        "matched": matched,
        "reasons": reasons,
        "invoice_amount": float(amount),
        "received_value": float(value),
        "tolerance": float(tolerance),
        "limit": float(limit),
        "po_total": float(money(po.total)),
        "received_qty": float(received_qty(po)),
        "po_status": po.status,
    }
