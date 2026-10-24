"""Blueprint registry API."""

from . import (
    approvals,
    auth,
    dashboard,
    grns,
    invoices,
    notifications,
    pos,
    prs,
    references,
    reports,
    rfqs,
)

MODULES = (
    auth,
    dashboard,
    references,
    prs,
    approvals,
    rfqs,
    pos,
    grns,
    invoices,
    reports,
    notifications,
)


def register_api(app) -> None:
    for module in MODULES:
        prefix = "/api" + (module.bp.url_prefix or "")
        app.register_blueprint(module.bp, url_prefix=prefix)
