import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
INSTANCE_DIR = BASE_DIR / "instance"

# Muat variabel dari .env bila ada (opsional untuk demo lokal).
load_dotenv(BASE_DIR / ".env")


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-secret-change-me")
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", f"sqlite:///{INSTANCE_DIR / 'procurement.db'}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SPA_DIST = Path(os.environ.get("SPA_DIST", BASE_DIR / "frontend" / "dist"))
    CURRENCY = "IDR"
    # 3-way match: toleransi harga invoice terhadap nilai barang diterima
    INVOICE_TOLERANCE_PERCENT = 2
    INVOICE_TOLERANCE_MIN = "10000"
    # threshold sourcing (IDR)
    DIRECT_PURCHASE_LIMIT = 10_000_000
    TENDER_LIMIT = 100_000_000
