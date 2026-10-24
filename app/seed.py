"""Seed data demo.

Transaksi dibuat lewat HTTP API memakai Flask test client, sehingga seed sekaligus
menjadi smoke test alur end-to-end (PR -> approval -> RFQ -> PO -> GRN -> invoice).

Jalankan: uv run flask --app app seed-reset
"""

from datetime import date, timedelta
from decimal import Decimal

from .extensions import db
from .models import ApprovalRule, Budget, Department, Item, User, Vendor
from .utils import money

DEMO_PASSWORD = "demo1234"

DEPARTMENTS = [
    ("IT", "Information Technology"),
    ("GA", "General Affairs"),
    ("MKT", "Marketing"),
    ("OPS", "Operations"),
    ("PROC", "Procurement"),
    ("FIN", "Finance"),
]

USERS = [
    ("rina@demo.test", "Rina Wijaya", "Requester", "IT"),
    ("bayu@demo.test", "Bayu Santoso", "Dept Head", "IT"),
    ("dewi@demo.test", "Dewi Lestari", "Requester", "GA"),
    ("hendra@demo.test", "Hendra Gunawan", "Dept Head", "GA"),
    ("sari@demo.test", "Sari Utami", "Finance", "FIN"),
    ("andi@demo.test", "Andi Pratama", "Procurement Officer", "PROC"),
    ("maya@demo.test", "Maya Kartika", "Procurement Manager", "PROC"),
    ("direktur@demo.test", "Darmawan Putra", "Director", "FIN"),
    ("gudang@demo.test", "Gito Saputra", "Warehouse", "OPS"),
]

BUDGETS = [
    ("IT-2026", "Budget IT 2026", "IT", "500000000"),
    ("GA-2026", "Budget General Affairs 2026", "GA", "250000000"),
    ("MKT-2026", "Budget Marketing 2026", "MKT", "200000000"),
    ("OPS-2026", "Budget Operations 2026", "OPS", "300000000"),
    ("PROC-2026", "Budget Procurement 2026", "PROC", "80000000"),
    ("FIN-2026", "Budget Finance 2026", "FIN", "150000000"),
]

VENDORS = [
    ("VND-001", "PT Maju Teknologi", "IT Hardware", "4.5", "ACTIVE", "Budi Hartono"),
    ("VND-002", "CV Sinar Komputer", "IT Hardware", "4.0", "ACTIVE", "Lina Marlina"),
    ("VND-003", "PT Global Office", "Office Supplies", "4.2", "ACTIVE", "Rudi Setiawan"),
    ("VND-004", "PT Karya Furnitur", "Furniture", "3.8", "ACTIVE", "Wulan Sari"),
    ("VND-005", "PT Logistik Cepat", "Logistics", "4.1", "ACTIVE", "Agus Salim"),
    ("VND-006", "CV Media Kreatif", "Marketing", "4.3", "ACTIVE", "Tania Putri"),
    ("VND-007", "PT Sumber Listrik", "Electrical", "3.5", "ACTIVE", "Hendra Wijaya"),
    ("VND-008", "PT Blacklist Jaya", "Umum", "1.0", "BLACKLISTED", "Tidak Dikenal"),
]

ITEMS = [
    ("ITM-001", "Laptop 14 inch i7", "IT Hardware", "unit", "20000000"),
    ("ITM-002", "Docking station USB-C", "IT Hardware", "unit", "1500000"),
    ("ITM-003", "Monitor 24 inch IPS", "IT Hardware", "unit", "1800000"),
    ("ITM-004", "Kursi ergonomis", "Furniture", "unit", "2500000"),
    ("ITM-005", "Meja kerja 120cm", "Furniture", "unit", "1800000"),
    ("ITM-006", "Printer laser A4", "Office Supplies", "unit", "3000000"),
    ("ITM-007", "UPS 1500VA", "Electrical", "unit", "3200000"),
    ("ITM-008", "Kabel UTP Cat6 (roll)", "IT Hardware", "roll", "900000"),
    ("ITM-009", "Switch 24 port", "IT Hardware", "unit", "4500000"),
    ("ITM-010", "Server rack 1U", "IT Hardware", "unit", "60000000"),
    ("ITM-011", "Sewa kendaraan operasional", "Logistics", "hari", "800000"),
    ("ITM-012", "Jasa instalasi jaringan", "Services", "paket", "5000000"),
]

# (doc_type, min, max, sequence, role)
APPROVAL_RULES = [
    ("PR", "0", "10000000", 1, "Dept Head"),
    ("PR", "0", "10000000", 2, "Finance"),
    ("PR", "10000001", "100000000", 1, "Dept Head"),
    ("PR", "10000001", "100000000", 2, "Finance"),
    ("PR", "10000001", "100000000", 3, "Procurement Manager"),
    ("PR", "100000001", None, 1, "Dept Head"),
    ("PR", "100000001", None, 2, "Finance"),
    ("PR", "100000001", None, 3, "Procurement Manager"),
    ("PR", "100000001", None, 4, "Director"),
    ("PO", "0", "10000000", 1, "Procurement Manager"),
    ("PO", "10000001", "100000000", 1, "Procurement Manager"),
    ("PO", "10000001", "100000000", 2, "Finance"),
    ("PO", "100000001", None, 1, "Procurement Manager"),
    ("PO", "100000001", None, 2, "Finance"),
    ("PO", "100000001", None, 3, "Director"),
]


class SeedError(RuntimeError):
    pass


def _reset_login_cache() -> None:
    """Flask-Login menyimpan current_user di g; CLI memakai satu app context
    untuk banyak test client, jadi cache harus dibersihkan antar request."""
    from flask import g, has_app_context

    if has_app_context():
        g.pop("_login_user", None)


class Api:
    """Klien kecil untuk memanggil API sebagai user tertentu."""

    def __init__(self, app, email: str, password: str = DEMO_PASSWORD):
        self.client = app.test_client()
        _reset_login_cache()
        response = self.client.post("/api/auth/login", json={"email": email, "password": password})
        if response.status_code != 200:
            raise SeedError(f"Login {email} gagal: {response.get_data(as_text=True)}")

    def call(self, method: str, path: str, json=None, expect=(200, 201)):
        _reset_login_cache()
        response = getattr(self.client, method)(path, json=json)
        if response.status_code not in expect:
            raise SeedError(
                f"{method.upper()} {path} -> {response.status_code}: "
                f"{response.get_data(as_text=True)[:500]}"
            )
        return response.get_json()

    def get(self, path: str):
        return self.call("get", path)

    def post(self, path: str, json=None):
        return self.call("post", path, json=json)

    def put(self, path: str, json=None):
        return self.call("put", path, json=json)


def run_seed(reset: bool = False) -> None:
    from flask import current_app

    app = current_app._get_current_object()

    if reset:
        db.drop_all()
    db.create_all()
    if User.query.first() and not reset:
        print("Database sudah berisi data. Gunakan `flask seed-reset` untuk mengulang.")
        return
    if reset:
        # pastikan benar-benar kosong setelah drop/create
        pass

    departments = _create_master()
    db.session.commit()

    builders = DemoBuilder(app, departments)
    builders.build()
    db.session.commit()

    counts = {
        "user": User.query.count(),
        "budget": Budget.query.count(),
        "vendor": Vendor.query.count(),
        "item": Item.query.count(),
    }
    print(
        "Seed selesai: "
        + ", ".join(f"{key}={value}" for key, value in counts.items())
        + "\nAkun demo (password: demo1234): "
        + ", ".join(user[0] for user in USERS)
    )


def _create_master() -> dict[str, Department]:
    departments: dict[str, Department] = {}
    for code, name in DEPARTMENTS:
        dept = Department(code=code, name=name)
        db.session.add(dept)
        departments[code] = dept
    db.session.flush()

    for email, name, role, dept_code in USERS:
        user = User(
            email=email,
            name=name,
            role=role,
            department_id=departments[dept_code].id,
        )
        user.set_password(DEMO_PASSWORD)
        db.session.add(user)

    for code, name, dept_code, allocated in BUDGETS:
        db.session.add(
            Budget(
                code=code,
                name=name,
                fiscal_year=date.today().year,
                department_id=departments[dept_code].id,
                allocated=Decimal(allocated),
            )
        )

    for code, name, category, rating, status, contact in VENDORS:
        db.session.add(
            Vendor(
                code=code,
                name=name,
                category=category,
                rating=Decimal(rating),
                status=status,
                contact_name=contact,
                contact_email=f"sales@{code.lower()}.example.com",
                contact_phone="021-555-0100",
                address="Jakarta",
                npwp="01.234.567.8-901.000",
            )
        )

    for code, name, category, uom, price in ITEMS:
        db.session.add(
            Item(
                code=code,
                name=name,
                category=category,
                uom=uom,
                estimated_price=Decimal(price),
            )
        )

    for row in APPROVAL_RULES:
        doc_type, minimum, maximum, sequence, role = row
        db.session.add(
            ApprovalRule(
                doc_type=doc_type,
                min_amount=money(minimum),
                max_amount=money(maximum) if maximum else None,
                sequence=sequence,
                role=role,
            )
        )
    db.session.flush()
    return departments


class DemoBuilder:
    def __init__(self, app, departments):
        self.app = app
        self.departments = departments
        self.rina = Api(app, "rina@demo.test")
        self.bayu = Api(app, "bayu@demo.test")
        self.dewi = Api(app, "dewi@demo.test")
        self.hendra = Api(app, "hendra@demo.test")
        self.sari = Api(app, "sari@demo.test")
        self.andi = Api(app, "andi@demo.test")
        self.maya = Api(app, "maya@demo.test")
        self.director = Api(app, "direktur@demo.test")
        self.gudang = Api(app, "gudang@demo.test")
        self.roles = {
            "Dept Head": [self.bayu, self.hendra],
            "Finance": [self.sari],
            "Procurement Manager": [self.maya],
            "Director": [self.director],
        }
        self.vendors = {v.code: v.id for v in Vendor.query.all()}
        self.budgets = {b.code: b.id for b in Budget.query.all()}
        self.item_ids = {item.name: item.id for item in Item.query.all()}
        self.today = date.today()

    # ------------------------------------------------------------------ utils
    def approve_until(self, doc_type: str, doc_id: int) -> None:
        order = ["Dept Head", "Finance", "Procurement Manager", "Director"]
        for _ in range(6):
            progressed = False
            for role in order:
                for client in self.roles.get(role, []):
                    items = client.get("/api/approvals")["items"]
                    match = next(
                        (
                            item
                            for item in items
                            if item["doc_type"] == doc_type and item["document"]["id"] == doc_id
                        ),
                        None,
                    )
                    if match:
                        client.post(
                            f"/api/approvals/{match['step']['id']}/approve",
                            {"note": f"Disetujui oleh {role}"},
                        )
                        progressed = True
                        break
            if not progressed:
                break

    def create_pr(
        self,
        client: Api,
        title: str,
        budget_code: str,
        items: list[dict],
        needed_days: int = 14,
        justification: str | None = None,
    ) -> dict:
        for item in items:
            item.setdefault("item_id", self.item_ids.get(item["description"]))
        response = client.post(
            "/api/prs",
            {
                "title": title,
                "budget_id": self.budgets[budget_code],
                "needed_date": (self.today + timedelta(days=needed_days)).isoformat(),
                "justification": justification,
                "items": items,
            },
        )
        return response["pr"] if "pr" in response else response

    def submit(self, client: Api, pr_id: int) -> dict:
        response = client.post(f"/api/prs/{pr_id}/submit")
        return response["pr"]

    def create_rfq(self, pr_id: int, vendor_codes: list[str], method: str) -> dict:
        response = self.andi.post(
            "/api/rfqs",
            {
                "pr_id": pr_id,
                "vendor_ids": [self.vendors[code] for code in vendor_codes],
                "method": method,
                "deadline": (self.today + timedelta(days=5)).isoformat(),
                "justification": "Sesuai kebutuhan operasional" if method == "DIRECT" else None,
            },
        )
        rfq = response
        self.andi.post(f"/api/rfqs/{rfq['id']}/issue")
        return self.andi.get(f"/api/rfqs/{rfq['id']}")["rfq"]

    def add_quotation(
        self, rfq_id: int, vendor_code: str, unit_prices: dict[int, str], lead_time: int
    ) -> dict:
        rfq = self.andi.get(f"/api/rfqs/{rfq_id}")["rfq"]
        items = [
            {
                "pr_item_id": item["id"],
                "qty": item["qty"],
                "unit_price": unit_prices[item["id"]],
            }
            for item in rfq["pr"]["items"]
        ]
        return self.andi.post(
            f"/api/rfqs/{rfq_id}/quotations",
            {
                "vendor_id": self.vendors[vendor_code],
                "lead_time_days": lead_time,
                "warranty": "12 bulan",
                "valid_until": (self.today + timedelta(days=30)).isoformat(),
                "items": items,
            },
        )

    def award_cheapest(self, rfq_id: int) -> dict:
        detail = self.andi.get(f"/api/rfqs/{rfq_id}")
        cheapest = min(detail["rfq"]["quotations"], key=lambda q: q["total"])
        self.maya.post(f"/api/rfqs/{rfq_id}/award", {"quotation_id": cheapest["id"]})
        return self.andi.get(f"/api/rfqs/{rfq_id}")["rfq"]

    def create_po(self, quotation_id: int, delivery_days: int = 7) -> dict:
        return self.andi.post(
            "/api/pos",
            {
                "quotation_id": quotation_id,
                "delivery_date": (self.today + timedelta(days=delivery_days)).isoformat(),
                "delivery_address": "Gudang pusat, Jl. Jenderal Sudirman No. 1, Jakarta",
                "terms": "Pembayaran 30 hari setelah invoice diverifikasi",
            },
        )

    def submit_po(self, po_id: int) -> dict:
        return self.andi.post(f"/api/pos/{po_id}/submit")["po"]

    def issue_po(self, po_id: int) -> dict:
        return self.andi.post(f"/api/pos/{po_id}/issue")

    def receive(self, po_id: int, qty_map: dict[int, tuple[str, str, str]], note: str = "") -> dict:
        """qty_map: po_item_id -> (qty_received, qty_rejected, condition)."""
        po = self.andi.get(f"/api/pos/{po_id}")["po"]
        items = []
        for item in po["items"]:
            if item["id"] not in qty_map:
                continue
            received, rejected, condition = qty_map[item["id"]]
            items.append(
                {
                    "po_item_id": item["id"],
                    "qty_received": received,
                    "qty_rejected": rejected,
                    "condition": condition,
                    "note": note or None,
                }
            )
        grn = self.gudang.post(
            "/api/grns",
            {
                "po_id": po_id,
                "received_date": self.today.isoformat(),
                "delivery_note_no": f"DO/{po['number'].split('/')[-1]}",
                "items": items,
            },
        )
        return self.gudang.post(f"/api/grns/{grn['id']}/post")

    def invoice(self, po_id: int, number: str, amount: str) -> dict:
        response = self.andi.post(
            "/api/invoices",
            {
                "po_id": po_id,
                "number": number,
                "invoice_date": self.today.isoformat(),
                "due_date": (self.today + timedelta(days=30)).isoformat(),
                "amount": amount,
            },
        )
        return response["invoice"]

    # -------------------------------------------------------------- scenarios
    def build(self) -> None:
        self.scenario_laptop_full()
        self.scenario_chairs_partial_disputed()
        self.scenario_monitor_waiting_approval()
        self.scenario_printers_awaiting_award()
        self.scenario_server_po_pending()
        self.scenario_vehicle_rejected()
        self.scenario_ups_direct_issued()
        self.scenario_network_completed_invoice_review()

    def scenario_laptop_full(self) -> None:
        pr = self.create_pr(
            self.rina,
            "Pengadaan laptop tim engineering",
            "IT-2026",
            [
                {
                    "description": "Laptop 14 inch i7",
                    "qty": 2,
                    "uom": "unit",
                    "estimated_price": "20000000",
                },
                {
                    "description": "Docking station USB-C",
                    "qty": 2,
                    "uom": "unit",
                    "estimated_price": "1500000",
                },
            ],
            justification="Tim engineering baru, laptop lama sudah 5 tahun.",
        )
        self.submit(self.rina, pr["id"])
        self.approve_until("PR", pr["id"])

        rfq = self.create_rfq(pr["id"], ["VND-001", "VND-002", "VND-003"], "RFQ")
        items = rfq["pr"]["items"]
        self.add_quotation(
            rfq["id"],
            "VND-001",
            {items[0]["id"]: "19500000", items[1]["id"]: "1400000"},
            7,
        )
        self.add_quotation(
            rfq["id"],
            "VND-002",
            {items[0]["id"]: "19800000", items[1]["id"]: "1350000"},
            10,
        )
        self.add_quotation(
            rfq["id"],
            "VND-003",
            {items[0]["id"]: "20100000", items[1]["id"]: "1500000"},
            5,
        )
        awarded = self.award_cheapest(rfq["id"])
        selected = next(q for q in awarded["quotations"] if q["status"] == "SELECTED")

        po = self.create_po(selected["id"])
        self.submit_po(po["id"])
        self.approve_until("PO", po["id"])
        self.issue_po(po["id"])

        po_detail = self.andi.get(f"/api/pos/{po['id']}")["po"]
        self.receive(
            po["id"],
            {item["id"]: (item["qty"], "0", "GOOD") for item in po_detail["items"]},
        )
        self.invoice(po["id"], "INV/EXT/2026/0001", "41800000")
        invoice = next(
            inv
            for inv in self.andi.get(f"/api/pos/{po['id']}")["po"]["invoices"]
            if inv["number"] == "INV/EXT/2026/0001"
        )
        self.sari.post(f"/api/invoices/{invoice['id']}/verify")
        self.sari.post(f"/api/invoices/{invoice['id']}/handoff")
        self.maya.post(f"/api/pos/{po['id']}/close")

    def scenario_chairs_partial_disputed(self) -> None:
        pr = self.create_pr(
            self.dewi,
            "Pengadaan kursi ergonomis ruang meeting",
            "GA-2026",
            [
                {
                    "description": "Kursi ergonomis",
                    "qty": 10,
                    "uom": "unit",
                    "estimated_price": "2500000",
                }
            ],
            justification="Kursi lama rusak dan tidak ergonomis.",
        )
        self.submit(self.dewi, pr["id"])
        self.approve_until("PR", pr["id"])

        rfq = self.create_rfq(pr["id"], ["VND-004", "VND-003", "VND-005"], "RFQ")
        item = rfq["pr"]["items"][0]
        self.add_quotation(rfq["id"], "VND-004", {item["id"]: "2450000"}, 14)
        self.add_quotation(rfq["id"], "VND-003", {item["id"]: "2600000"}, 9)
        awarded = self.award_cheapest(rfq["id"])
        selected = next(q for q in awarded["quotations"] if q["status"] == "SELECTED")

        po = self.create_po(selected["id"], delivery_days=10)
        self.submit_po(po["id"])
        self.approve_until("PO", po["id"])
        self.issue_po(po["id"])

        po_detail = self.andi.get(f"/api/pos/{po['id']}")["po"]
        line = po_detail["items"][0]
        self.receive(
            po["id"],
            {line["id"]: ("6", "1", "DAMAGED")},
            note="1 unit rangka penyok saat pengiriman, menunggu penggantian.",
        )
        self.invoice(po["id"], "INV/EXT/2026/0002", "24500000")

    def scenario_monitor_waiting_approval(self) -> None:
        pr = self.create_pr(
            self.rina,
            "Monitor tambahan untuk ruang desain",
            "IT-2026",
            [
                {
                    "description": "Monitor 24 inch IPS",
                    "qty": 3,
                    "uom": "unit",
                    "estimated_price": "1800000",
                }
            ],
        )
        self.submit(self.rina, pr["id"])

    def scenario_printers_awaiting_award(self) -> None:
        pr = self.create_pr(
            self.dewi,
            "Printer laser untuk resepsionis dan GA",
            "GA-2026",
            [
                {
                    "description": "Printer laser A4",
                    "qty": 4,
                    "uom": "unit",
                    "estimated_price": "3000000",
                }
            ],
        )
        self.submit(self.dewi, pr["id"])
        self.approve_until("PR", pr["id"])

        rfq = self.create_rfq(pr["id"], ["VND-001", "VND-002", "VND-003"], "RFQ")
        item = rfq["pr"]["items"][0]
        self.add_quotation(rfq["id"], "VND-001", {item["id"]: "3050000"}, 6)
        self.add_quotation(rfq["id"], "VND-002", {item["id"]: "2950000"}, 12)

    def scenario_server_po_pending(self) -> None:
        pr = self.create_pr(
            self.rina,
            "Server rack untuk lab infrastruktur",
            "IT-2026",
            [
                {
                    "description": "Server rack 1U",
                    "qty": 1,
                    "uom": "unit",
                    "estimated_price": "60000000",
                }
            ],
            justification="Kapasitas server saat ini sudah penuh.",
        )
        self.submit(self.rina, pr["id"])
        self.approve_until("PR", pr["id"])

        rfq = self.create_rfq(pr["id"], ["VND-001", "VND-002", "VND-003"], "RFQ")
        item = rfq["pr"]["items"][0]
        self.add_quotation(rfq["id"], "VND-001", {item["id"]: "59000000"}, 21)
        self.add_quotation(rfq["id"], "VND-002", {item["id"]: "61000000"}, 18)
        awarded = self.award_cheapest(rfq["id"])
        selected = next(q for q in awarded["quotations"] if q["status"] == "SELECTED")

        po = self.create_po(selected["id"], delivery_days=21)
        self.submit_po(po["id"])

    def scenario_vehicle_rejected(self) -> None:
        pr = self.create_pr(
            self.dewi,
            "Sewa kendaraan operasional bulanan",
            "GA-2026",
            [
                {
                    "description": "Sewa kendaraan operasional",
                    "qty": 10,
                    "uom": "hari",
                    "estimated_price": "800000",
                }
            ],
        )
        self.submit(self.dewi, pr["id"])
        items = self.hendra.get("/api/approvals")["items"]
        match = next(
            item
            for item in items
            if item["doc_type"] == "PR" and item["document"]["id"] == pr["id"]
        )
        self.hendra.post(
            f"/api/approvals/{match['step']['id']}/reject",
            {
                "note": "Gunakan vendor kendaraan yang sudah ada kontrak. "
                "Ajukan ulang dengan 3 quotation pembanding."
            },
        )

    def scenario_ups_direct_issued(self) -> None:
        pr = self.create_pr(
            self.rina,
            "UPS untuk ruang server kecil",
            "IT-2026",
            [
                {
                    "description": "UPS 1500VA",
                    "qty": 1,
                    "uom": "unit",
                    "estimated_price": "3200000",
                }
            ],
        )
        self.submit(self.rina, pr["id"])
        self.approve_until("PR", pr["id"])

        rfq = self.create_rfq(pr["id"], ["VND-007"], "DIRECT")
        item = rfq["pr"]["items"][0]
        self.add_quotation(rfq["id"], "VND-007", {item["id"]: "3150000"}, 3)
        awarded = self.award_cheapest(rfq["id"])
        selected = next(q for q in awarded["quotations"] if q["status"] == "SELECTED")

        po = self.create_po(selected["id"], delivery_days=3)
        self.submit_po(po["id"])
        self.approve_until("PO", po["id"])
        self.issue_po(po["id"])

    def scenario_network_completed_invoice_review(self) -> None:
        pr = self.create_pr(
            self.rina,
            "Kabel dan aksesoris jaringan lantai 2",
            "IT-2026",
            [
                {
                    "description": "Kabel UTP Cat6 (roll)",
                    "qty": 2,
                    "uom": "roll",
                    "estimated_price": "900000",
                },
                {
                    "description": "Switch 24 port",
                    "qty": 1,
                    "uom": "unit",
                    "estimated_price": "4500000",
                },
            ],
        )
        self.submit(self.rina, pr["id"])
        self.approve_until("PR", pr["id"])

        rfq = self.create_rfq(pr["id"], ["VND-002"], "DIRECT")
        items = rfq["pr"]["items"]
        self.add_quotation(
            rfq["id"],
            "VND-002",
            {items[0]["id"]: "880000", items[1]["id"]: "4400000"},
            4,
        )
        awarded = self.award_cheapest(rfq["id"])
        selected = next(q for q in awarded["quotations"] if q["status"] == "SELECTED")

        po = self.create_po(selected["id"], delivery_days=5)
        self.submit_po(po["id"])
        self.approve_until("PO", po["id"])
        self.issue_po(po["id"])

        po_detail = self.andi.get(f"/api/pos/{po['id']}")["po"]
        self.receive(
            po["id"],
            {item["id"]: (item["qty"], "0", "GOOD") for item in po_detail["items"]},
        )
        self.invoice(po["id"], "INV/EXT/2026/0003", "6160000")
