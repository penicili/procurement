from ..extensions import db
from ..models import Notification, User


def notify_user(user_id: int, title: str, message: str, link: str | None = None) -> None:
    db.session.add(Notification(user_id=user_id, title=title, message=message, link=link))


def notify_roles(
    roles: str | list[str],
    title: str,
    message: str,
    *,
    link: str | None = None,
    exclude_user_id: int | None = None,
) -> int:
    role_list = [roles] if isinstance(roles, str) else roles
    query = User.query.filter(User.role.in_(role_list), User.is_active_flag.is_(True))
    if exclude_user_id:
        query = query.filter(User.id != exclude_user_id)
    count = 0
    for user in query.all():
        notify_user(user.id, title, message, link)
        count += 1
    return count
