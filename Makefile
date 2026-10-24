# ---------------------------------------------------------------------------
# Procurement P2P — perintah pengembangan
# ---------------------------------------------------------------------------
PY := uv run
NPM := npm --prefix frontend

.DEFAULT_GOAL := help
.PHONY: help setup build seed run dev-api dev-ui test lint format docs clean reset-db

help: ## Tampilkan daftar perintah
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

setup: ## Install dependency Python + frontend
	uv sync
	$(NPM) ci

build: ## Build frontend produksi ke frontend/dist
	$(NPM) run build

seed: ## Isi database dengan data demo (idempotent)
	$(PY) flask --app app seed

reset-db: ## Hapus database lalu seed ulang
	$(PY) flask --app app seed-reset

run: build ## Build frontend lalu jalankan server Flask (port 5000)
	$(PY) flask --app app run --port 5000

dev-api: ## Jalankan Flask API di port 5000 (terminal 1)
	$(PY) flask --app app run --port 5000 --debug

dev-ui: ## Jalankan Vite dev server di port 5173 (terminal 2)
	$(NPM) run dev

test: ## Jalankan seluruh test
	$(PY) pytest -q

lint: ## Cek style Python
	$(PY) ruff check .
	$(PY) ruff format --check .

format: ## Rapikan format Python
	$(PY) ruff format .

docs: ## Generate ulang WBS (xlsx) dan diagram (pdf)
	$(PY) python scripts/build_wbs.py
	$(PY) python scripts/render_diagrams.py

clean: ## Bersihkan artefak build lokal
	rm -rf frontend/dist frontend/node_modules/.tmp .pytest_cache .ruff_cache
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
