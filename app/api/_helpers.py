from functools import wraps

from flask import request
from flask_login import current_user


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def error(message: str, status: int = 400) -> ApiError:
    return ApiError(message, status)


def payload() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("Body harus JSON object", 400)
    return data


def roles(*allowed: str):
    """Batasi endpoint ke role tertentu; 401 bila belum login."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not current_user.is_authenticated:
                raise ApiError("Silakan login terlebih dahulu", 401)
            if allowed and current_user.role not in allowed:
                raise ApiError(f"Role {current_user.role} tidak punya akses ke aksi ini", 403)
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def pagination() -> tuple[int, int]:
    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(1, int(request.args.get("per_page", 20))))
    except ValueError as exc:
        raise ApiError("Parameter page/per_page tidak valid") from exc
    return page, per_page


def page_payload(items: list[dict], total: int, page: int, per_page: int) -> dict:
    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, (total + per_page - 1) // per_page),
    }


def ensure_pr_visible(pr) -> None:
    if pr is None:
        raise ApiError("PR tidak ditemukan", 404)
    if current_user.role == "Requester" and pr.requester_id != current_user.id:
        raise ApiError("Anda hanya dapat mengakses PR milik sendiri", 403)
    if current_user.role == "Dept Head" and pr.department_id != current_user.department_id:
        raise ApiError("Anda hanya dapat mengakses PR departemen sendiri", 403)


def visible_pr_query():
    """Query PR yang boleh dilihat current user."""
    from ..models import PurchaseRequest

    query = PurchaseRequest.query
    if current_user.role == "Requester":
        query = query.filter(PurchaseRequest.requester_id == current_user.id)
    elif current_user.role == "Dept Head":
        query = query.filter(PurchaseRequest.department_id == current_user.department_id)
    return query
