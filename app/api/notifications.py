from flask import Blueprint, jsonify
from flask_login import current_user, login_required

from ..extensions import db
from ..models import Notification
from ._helpers import ApiError

bp = Blueprint("notifications", __name__, url_prefix="/notifications")


@bp.get("")
@login_required
def list_notifications():
    rows = (
        Notification.query.filter_by(user_id=current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(30)
        .all()
    )
    unread = Notification.query.filter_by(user_id=current_user.id, is_read=False).count()
    return jsonify({"items": [row.to_dict() for row in rows], "unread": unread})


@bp.post("/read-all")
@login_required
def read_all():
    Notification.query.filter_by(user_id=current_user.id, is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"ok": True})


@bp.post("/<int:notification_id>/read")
@login_required
def read_one(notification_id: int):
    row = db.session.get(Notification, notification_id)
    if row is None or row.user_id != current_user.id:
        raise ApiError("Notifikasi tidak ditemukan", 404)
    row.is_read = True
    db.session.commit()
    return jsonify(row.to_dict())
