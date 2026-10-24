from datetime import date

import pytest

from app.models import PR_DRAFT, PR_SUBMITTED
from app.services import numbering
from app.services.state_machine import InvalidTransition, assert_transition


def test_numbering_format_and_sequence(app):
    first = numbering.next_number("PR", date(2026, 10, 1))
    second = numbering.next_number("PR", date(2026, 10, 2))
    other_month = numbering.next_number("PR", date(2026, 11, 1))
    other_type = numbering.next_number("PO", date(2026, 10, 1))

    assert first == "PR/2026/10/0001"
    assert second == "PR/2026/10/0002"
    assert other_month == "PR/2026/11/0001"
    assert other_type == "PO/2026/10/0001"


def test_state_machine_allows_only_defined_transitions():
    assert_transition("PR", PR_DRAFT, PR_SUBMITTED)
    assert_transition("PO", "APPROVED", "ISSUED")
    with pytest.raises(InvalidTransition):
        assert_transition("PO", "DRAFT", "ISSUED")
    with pytest.raises(InvalidTransition):
        assert_transition("INVOICE", "RECEIVED", "HANDED_OFF")
