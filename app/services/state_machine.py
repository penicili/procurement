from .. import models as m

# Transisi status yang sah per jenis dokumen. Endpoint tidak boleh mengubah status
# langsung tanpa melewati guard ini.
TRANSITIONS: dict[str, dict[str, set[str]]] = {
    "PR": {
        m.PR_DRAFT: {m.PR_SUBMITTED, m.PR_CANCELLED},
        m.PR_SUBMITTED: {m.PR_APPROVED, m.PR_REJECTED, m.PR_CANCELLED},
        m.PR_REJECTED: {m.PR_DRAFT, m.PR_CANCELLED},
        m.PR_APPROVED: {m.PR_CANCELLED, m.PR_CLOSED},
        m.PR_CLOSED: set(),
        m.PR_CANCELLED: set(),
    },
    "RFQ": {
        m.RFQ_DRAFT: {m.RFQ_ISSUED, m.RFQ_CANCELLED},
        m.RFQ_ISSUED: {m.RFQ_AWARDED, m.RFQ_CANCELLED},
        m.RFQ_AWARDED: set(),
        m.RFQ_CANCELLED: set(),
    },
    "PO": {
        m.PO_DRAFT: {m.PO_PENDING, m.PO_CANCELLED},
        m.PO_PENDING: {m.PO_APPROVED, m.PO_DRAFT, m.PO_CANCELLED},
        m.PO_APPROVED: {m.PO_ISSUED, m.PO_CANCELLED},
        m.PO_ISSUED: {m.PO_PARTIAL, m.PO_RECEIVED, m.PO_CANCELLED},
        m.PO_PARTIAL: {m.PO_RECEIVED, m.PO_CLOSED},
        m.PO_RECEIVED: {m.PO_CLOSED},
        m.PO_CLOSED: set(),
        m.PO_CANCELLED: set(),
    },
    "GRN": {
        m.GRN_DRAFT: {m.GRN_POSTED, m.GRN_CANCELLED},
        m.GRN_POSTED: set(),
        m.GRN_CANCELLED: set(),
    },
    "INVOICE": {
        m.INV_RECEIVED: {m.INV_MATCHED, m.INV_DISPUTED},
        m.INV_DISPUTED: {m.INV_MATCHED},
        m.INV_MATCHED: {m.INV_VERIFIED},
        m.INV_VERIFIED: {m.INV_HANDED_OFF},
        m.INV_HANDED_OFF: set(),
    },
}


class InvalidTransition(Exception):
    pass


def assert_transition(doc_type: str, from_status: str, to_status: str) -> None:
    allowed = TRANSITIONS.get(doc_type, {}).get(from_status, set())
    if to_status not in allowed:
        raise InvalidTransition(
            f"Transisi {doc_type} dari {from_status} ke {to_status} tidak diizinkan"
        )


def next_statuses(doc_type: str, status: str) -> set[str]:
    return TRANSITIONS.get(doc_type, {}).get(status, set())
