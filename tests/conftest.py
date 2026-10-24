import pytest

from app import create_app
from app.config import Config
from app.extensions import db
from app.seed import DemoBuilder, _create_master


@pytest.fixture()
def app(tmp_path):
    class TestConfig(Config):
        TESTING = True
        SECRET_KEY = "test-secret"
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{tmp_path / 'test.db'}"
        SPA_DIST = tmp_path / "dist"

    application = create_app(TestConfig)
    with application.app_context():
        db.create_all()
        _create_master()
        db.session.commit()
        yield application
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def flow(app):
    return DemoBuilder(app, _create_master_departments(app))


def _create_master_departments(app):
    from app.models import Department

    return {dept.code: dept for dept in Department.query.all()}


@pytest.fixture()
def budget_ids(app):
    from app.models import Budget

    return {budget.code: budget.id for budget in Budget.query.all()}
