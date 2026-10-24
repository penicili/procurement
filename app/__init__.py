import logging
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_login import current_user
from werkzeug.exceptions import HTTPException

from .api import register_api
from .api._helpers import ApiError
from .config import INSTANCE_DIR, Config
from .extensions import db, login_manager
from .services.state_machine import InvalidTransition


def create_app(config_object: type = Config) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config.from_object(config_object)
    INSTANCE_DIR.mkdir(parents=True, exist_ok=True)

    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = "spa"

    from . import models  # noqa: F401  (register models)

    @login_manager.user_loader
    def load_user(user_id: str):
        return db.session.get(models.User, int(user_id))

    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify({"error": {"message": "Silakan login terlebih dahulu", "status": 401}}), 401

    register_api(app)
    _register_error_handlers(app)
    _register_spa(app)
    _register_cli(app)

    @app.get("/healthz")
    def healthz():
        return jsonify({"status": "ok"})

    @app.before_request
    def reset_login_cache():
        # Flask-Login menyimpan current_user pada app context (g). Pada server normal
        # setiap request punya app context baru, tetapi test client/CLI dapat memakai
        # context yang sama. Membersihkan cache membuat user selalu dibaca dari session.
        from flask import g

        g.pop("_login_user", None)

    @app.before_request
    def expose_user():
        # memudahkan debugging; tidak mengubah state
        request.environ["current_user_role"] = getattr(current_user, "role", None)

    return app


def _register_error_handlers(app: Flask) -> None:
    @app.errorhandler(ApiError)
    def handle_api_error(exc: ApiError):
        db.session.rollback()
        return jsonify({"error": {"message": exc.message, "status": exc.status}}), exc.status

    @app.errorhandler(InvalidTransition)
    def handle_transition(exc: InvalidTransition):
        db.session.rollback()
        return jsonify({"error": {"message": str(exc), "status": 409}}), 409

    @app.errorhandler(PermissionError)
    def handle_permission(exc: PermissionError):
        db.session.rollback()
        return jsonify({"error": {"message": str(exc), "status": 403}}), 403

    @app.errorhandler(ValueError)
    def handle_value_error(exc: ValueError):
        db.session.rollback()
        return jsonify({"error": {"message": str(exc), "status": 400}}), 400

    @app.errorhandler(HTTPException)
    def handle_http_error(exc: HTTPException):
        if request.path.startswith("/api/"):
            return (
                jsonify({"error": {"message": exc.description, "status": exc.code}}),
                exc.code,
            )
        return exc

    @app.errorhandler(Exception)
    def handle_unexpected(exc: Exception):
        db.session.rollback()
        app.logger.exception("Unhandled error: %s", exc)
        return (
            jsonify(
                {
                    "error": {
                        "message": "Terjadi kesalahan internal. Cek log server.",
                        "status": 500,
                    }
                }
            ),
            500,
        )


def _register_spa(app: Flask) -> None:
    dist = Path(app.config["SPA_DIST"])

    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def spa(path: str):
        if path.startswith("api/") or path == "api":
            return jsonify({"error": {"message": "Endpoint tidak ditemukan", "status": 404}}), 404
        if path and (dist / path).is_file():
            return send_from_directory(dist, path)
        index = dist / "index.html"
        if index.is_file():
            response = send_from_directory(dist, "index.html")
            response.headers["Cache-Control"] = "no-cache"
            return response
        return (
            "Frontend belum di-build.\n\n"
            "Jalankan: npm --prefix frontend ci && npm --prefix frontend run build\n"
            "atau: make build\n",
            503,
            {"Content-Type": "text/plain; charset=utf-8"},
        )


def _register_cli(app: Flask) -> None:
    from .cli import register_cli

    register_cli(app)


logging.basicConfig(level=logging.INFO)
