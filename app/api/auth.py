from flask import Blueprint, jsonify
from flask_login import current_user, login_required, login_user, logout_user

from ..extensions import db
from ..models import User
from ._helpers import ApiError, payload

bp = Blueprint("auth", __name__, url_prefix="/auth")


@bp.post("/login")
def login():
    data = payload()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password:
        raise ApiError("Email dan password wajib diisi")
    user = User.query.filter(db.func.lower(User.email) == email).one_or_none()
    if user is None or not user.check_password(password) or not user.is_active:
        raise ApiError("Email atau password salah", 401)
    login_user(user, remember=True)
    return jsonify({"user": user.to_dict()})


@bp.post("/logout")
@login_required
def logout():
    logout_user()
    return jsonify({"ok": True})


@bp.get("/me")
@login_required
def me():
    return jsonify({"user": current_user.to_dict()})
