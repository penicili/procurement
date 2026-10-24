from ..extensions import db
from ..models import ActivityLog


def log(
    doc_type: str,
    doc_id: int,
    action: str,
    *,
    actor=None,
    from_status: str | None = None,
    to_status: str | None = None,
    notes: str | None = None,
) -> ActivityLog:
    """Tulis satu baris audit. Caller bertanggung jawab commit."""
    entry = ActivityLog(
        doc_type=doc_type,
        doc_id=doc_id,
        action=action,
        from_status=from_status,
        to_status=to_status,
        actor_id=actor.id if actor else None,
        notes=notes,
    )
    db.session.add(entry)
    return entry


def timeline(doc_type: str, doc_id: int) -> list[dict]:
    rows = (
        ActivityLog.query.filter_by(doc_type=doc_type, doc_id=doc_id)
        .order_by(ActivityLog.created_at.asc(), ActivityLog.id.asc())
        .all()
    )
    return [row.to_dict() for row in rows]
