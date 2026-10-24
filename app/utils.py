from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

TWO_PLACES = Decimal("0.01")


def money(value: object) -> Decimal:
    """Convert any numeric input to a 2-decimal Decimal, never raising on None."""
    if value is None or value == "":
        return Decimal("0.00")
    try:
        return Decimal(str(value)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"Nilai uang tidak valid: {value!r}") from exc


def as_float(value: Decimal | None) -> float | None:
    return None if value is None else float(value)


def utcnow() -> datetime:
    return datetime.now(UTC)


def iso(value: datetime | date | None) -> str | None:
    if value is None:
        return None
    # SQLite menyimpan DATETIME sebagai UTC tanpa tzinfo. Tambahkan UTC agar klien
    # (browser) dapat mengonversi ke zona waktu lokal dengan benar.
    if isinstance(value, datetime) and value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value)


def required(payload: dict, fields: list[str]) -> None:
    missing = [f for f in fields if payload.get(f) in (None, "", [])]
    if missing:
        raise ValueError(f"Field wajib belum diisi: {', '.join(missing)}")


def role_label(role: str) -> str:
    return role
