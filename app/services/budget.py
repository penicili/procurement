from decimal import Decimal

from ..models import Budget


def commit(budget: Budget, amount: Decimal) -> None:
    amount = _amount(amount)
    if budget.available < amount:
        raise ValueError(
            f"Budget tidak cukup. Available Rp{budget.available:,.0f}, dibutuhkan Rp{amount:,.0f}"
        )
    budget.committed = _money(budget.committed) + amount


def release(budget: Budget, amount: Decimal) -> None:
    amount = _amount(amount, allow_zero=True)
    budget.committed = max(_money(0), _money(budget.committed) - amount)


def spend(budget: Budget, amount: Decimal) -> None:
    """Pindahkan nilai barang yang diterima dari committed ke spent."""
    amount = _amount(amount, allow_zero=True)
    if amount == 0:
        return
    budget.committed = max(_money(0), _money(budget.committed) - amount)
    budget.spent = _money(budget.spent) + amount


def _money(value) -> Decimal:
    from ..utils import money

    return money(value)


def _amount(value, allow_zero: bool = False) -> Decimal:
    amount = _money(value)
    if amount < 0 or (amount == 0 and not allow_zero):
        raise ValueError("Nilai budget harus lebih dari 0")
    return amount
