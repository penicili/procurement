import click
from flask import Flask

from .extensions import db


def register_cli(app: Flask) -> None:
    @app.cli.command("init-db")
    def init_db() -> None:
        """Buat seluruh tabel dari model (SQLite)."""
        db.create_all()
        click.echo("Database siap.")

    @app.cli.command("seed")
    def seed() -> None:
        """Isi data master + transaksi demo (hanya jika database kosong)."""
        from .seed import run_seed

        run_seed(reset=False)

    @app.cli.command("seed-reset")
    def seed_reset() -> None:
        """Hapus semua tabel lalu isi ulang data demo."""
        from .seed import run_seed

        run_seed(reset=True)

    @app.cli.command("demo-accounts")
    def demo_accounts() -> None:
        """Tampilkan akun demo."""
        from .seed import DEMO_PASSWORD, USERS

        for email, _, role, _dept in USERS:
            click.echo(f"{email:28} {DEMO_PASSWORD:10} {role}")
