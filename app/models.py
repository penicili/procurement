"""SQLAlchemy models.

Satu file agar relasi mudah ditelusuri; bagian dipisah dengan komentar.
Status disimpan sebagai string agar transisi eksplisit di service layer.
"""

from datetime import date

from flask_login import UserMixin
from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db
from .utils import as_float, iso, money, utcnow

# ---------------------------------------------------------------------------
# Role & status constants
# ---------------------------------------------------------------------------
ROLES = (
    "Requester",
    "Dept Head",
    "Finance",
    "Procurement Officer",
    "Procurement Manager",
    "Director",
    "Warehouse",
)

PR_DRAFT, PR_SUBMITTED, PR_APPROVED, PR_REJECTED, PR_CANCELLED, PR_CLOSED = (
    "DRAFT",
    "SUBMITTED",
    "APPROVED",
    "REJECTED",
    "CANCELLED",
    "CLOSED",
)
PO_DRAFT, PO_PENDING, PO_APPROVED, PO_ISSUED = (
    "DRAFT",
    "PENDING_APPROVAL",
    "APPROVED",
    "ISSUED",
)
PO_PARTIAL, PO_RECEIVED, PO_CLOSED, PO_CANCELLED = (
    "PARTIALLY_RECEIVED",
    "RECEIVED",
    "CLOSED",
    "CANCELLED",
)
RFQ_DRAFT, RFQ_ISSUED, RFQ_AWARDED, RFQ_CANCELLED = "DRAFT", "ISSUED", "AWARDED", "CANCELLED"
QT_DRAFT, QT_SUBMITTED, QT_SELECTED, QT_REJECTED = "DRAFT", "SUBMITTED", "SELECTED", "REJECTED"
GRN_DRAFT, GRN_POSTED, GRN_CANCELLED = "DRAFT", "POSTED", "CANCELLED"
INV_RECEIVED, INV_MATCHED, INV_VERIFIED, INV_DISPUTED, INV_HANDED_OFF = (
    "RECEIVED",
    "MATCHED",
    "VERIFIED",
    "DISPUTED",
    "HANDED_OFF",
)
STEP_PENDING, STEP_APPROVED, STEP_REJECTED, STEP_SKIPPED = (
    "PENDING",
    "APPROVED",
    "REJECTED",
    "SKIPPED",
)


class TimestampMixin:
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


# ---------------------------------------------------------------------------
# Master data
# ---------------------------------------------------------------------------
class Department(TimestampMixin, db.Model):
    __tablename__ = "departments"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(20), unique=True, nullable=False)
    name = db.Column(db.String(120), nullable=False)

    users = db.relationship("User", back_populates="department")
    budgets = db.relationship("Budget", back_populates="department")

    def to_dict(self) -> dict:
        return {"id": self.id, "code": self.code, "name": self.name}


class User(UserMixin, TimestampMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(160), unique=True, nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(40), nullable=False, index=True)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"))
    is_active_flag = db.Column("is_active", db.Boolean, default=True, nullable=False)

    department = db.relationship("Department", back_populates="users")

    def set_password(self, raw: str) -> None:
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw: str) -> bool:
        return check_password_hash(self.password_hash, raw)

    @property
    def is_active(self) -> bool:  # Flask-Login
        return self.is_active_flag

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "role": self.role,
            "department": self.department.to_dict() if self.department else None,
        }


class Budget(TimestampMixin, db.Model):
    __tablename__ = "budgets"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(40), unique=True, nullable=False)
    name = db.Column(db.String(160), nullable=False)
    fiscal_year = db.Column(db.Integer, nullable=False, default=lambda: date.today().year)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=False)
    allocated = db.Column(db.Numeric(18, 2), nullable=False, default=0)
    committed = db.Column(db.Numeric(18, 2), nullable=False, default=0)
    spent = db.Column(db.Numeric(18, 2), nullable=False, default=0)

    department = db.relationship("Department", back_populates="budgets")

    @property
    def available(self):
        return money(self.allocated) - money(self.committed) - money(self.spent)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "fiscal_year": self.fiscal_year,
            "department": self.department.to_dict() if self.department else None,
            "allocated": as_float(self.allocated),
            "committed": as_float(self.committed),
            "spent": as_float(self.spent),
            "available": as_float(self.available),
        }


class Vendor(TimestampMixin, db.Model):
    __tablename__ = "vendors"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(30), unique=True, nullable=False)
    name = db.Column(db.String(160), nullable=False)
    npwp = db.Column(db.String(40))
    address = db.Column(db.Text)
    contact_name = db.Column(db.String(120))
    contact_email = db.Column(db.String(160))
    contact_phone = db.Column(db.String(40))
    category = db.Column(db.String(80))
    status = db.Column(db.String(20), nullable=False, default="ACTIVE")
    rating = db.Column(db.Numeric(3, 1), default=0)

    quotations = db.relationship("Quotation", back_populates="vendor")
    purchase_orders = db.relationship("PurchaseOrder", back_populates="vendor")
    invoices = db.relationship("Invoice", back_populates="vendor")
    rfq_invites = db.relationship("RFQVendor", back_populates="vendor")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "npwp": self.npwp,
            "address": self.address,
            "contact_name": self.contact_name,
            "contact_email": self.contact_email,
            "contact_phone": self.contact_phone,
            "category": self.category,
            "status": self.status,
            "rating": as_float(self.rating),
        }


class Item(TimestampMixin, db.Model):
    __tablename__ = "items"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(40), unique=True, nullable=False)
    name = db.Column(db.String(160), nullable=False)
    category = db.Column(db.String(80))
    uom = db.Column(db.String(20), nullable=False, default="pcs")
    estimated_price = db.Column(db.Numeric(18, 2), nullable=False, default=0)
    is_active_flag = db.Column("is_active", db.Boolean, default=True, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "category": self.category,
            "uom": self.uom,
            "estimated_price": as_float(self.estimated_price),
            "is_active": self.is_active_flag,
        }


# ---------------------------------------------------------------------------
# Purchase Request
# ---------------------------------------------------------------------------
class PurchaseRequest(TimestampMixin, db.Model):
    __tablename__ = "purchase_requests"

    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.String(40), unique=True, nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=False)
    requester_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    budget_id = db.Column(db.Integer, db.ForeignKey("budgets.id"), nullable=False)
    status = db.Column(db.String(30), nullable=False, default=PR_DRAFT, index=True)
    total_estimated = db.Column(db.Numeric(18, 2), nullable=False, default=0)
    needed_date = db.Column(db.Date)
    justification = db.Column(db.Text)
    submitted_at = db.Column(db.DateTime(timezone=True))
    approved_at = db.Column(db.DateTime(timezone=True))

    department = db.relationship("Department")
    requester = db.relationship("User", foreign_keys=[requester_id])
    budget = db.relationship("Budget")
    items = db.relationship(
        "PurchaseRequestItem",
        back_populates="pr",
        cascade="all, delete-orphan",
        order_by="PurchaseRequestItem.id",
    )
    rfqs = db.relationship("RFQ", back_populates="pr")
    purchase_orders = db.relationship("PurchaseOrder", back_populates="pr")

    def recalculate(self) -> None:
        total = money(0)
        for item in self.items:
            item.subtotal = money(item.qty) * money(item.estimated_price)
            total += money(item.subtotal)
        self.total_estimated = money(total)

    def to_dict(self, detail: bool = False) -> dict:
        data = {
            "id": self.id,
            "number": self.number,
            "title": self.title,
            "status": self.status,
            "department": self.department.to_dict() if self.department else None,
            "requester": self.requester.to_dict() if self.requester else None,
            "budget": self.budget.to_dict() if self.budget else None,
            "total_estimated": as_float(self.total_estimated),
            "needed_date": iso(self.needed_date),
            "justification": self.justification,
            "submitted_at": iso(self.submitted_at),
            "approved_at": iso(self.approved_at),
            "created_at": iso(self.created_at),
        }
        if detail:
            data["items"] = [item.to_dict() for item in self.items]
        return data


class PurchaseRequestItem(TimestampMixin, db.Model):
    __tablename__ = "purchase_request_items"

    id = db.Column(db.Integer, primary_key=True)
    pr_id = db.Column(
        db.Integer, db.ForeignKey("purchase_requests.id", ondelete="CASCADE"), nullable=False
    )
    item_id = db.Column(db.Integer, db.ForeignKey("items.id"))
    description = db.Column(db.String(240), nullable=False)
    qty = db.Column(db.Numeric(18, 2), nullable=False)
    uom = db.Column(db.String(20), nullable=False, default="pcs")
    estimated_price = db.Column(db.Numeric(18, 2), nullable=False, default=0)
    subtotal = db.Column(db.Numeric(18, 2), nullable=False, default=0)

    pr = db.relationship("PurchaseRequest", back_populates="items")
    item = db.relationship("Item")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "item_id": self.item_id,
            "item": self.item.to_dict() if self.item else None,
            "description": self.description,
            "qty": as_float(self.qty),
            "uom": self.uom,
            "estimated_price": as_float(self.estimated_price),
            "subtotal": as_float(self.subtotal),
        }


# ---------------------------------------------------------------------------
# Sourcing
# ---------------------------------------------------------------------------
class RFQ(TimestampMixin, db.Model):
    __tablename__ = "rfqs"

    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.String(40), unique=True, nullable=False, index=True)
    pr_id = db.Column(db.Integer, db.ForeignKey("purchase_requests.id"), nullable=False)
    method = db.Column(db.String(20), nullable=False, default="RFQ")
    status = db.Column(db.String(30), nullable=False, default=RFQ_DRAFT, index=True)
    deadline = db.Column(db.Date)
    notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))

    pr = db.relationship("PurchaseRequest", back_populates="rfqs")
    creator = db.relationship("User", foreign_keys=[created_by])
    vendor_invites = db.relationship(
        "RFQVendor", back_populates="rfq", cascade="all, delete-orphan"
    )
    quotations = db.relationship("Quotation", back_populates="rfq", cascade="all, delete-orphan")

    def to_dict(self, detail: bool = False) -> dict:
        data = {
            "id": self.id,
            "number": self.number,
            "pr_id": self.pr_id,
            "pr": self.pr.to_dict(detail=True) if self.pr else None,
            "method": self.method,
            "status": self.status,
            "deadline": iso(self.deadline),
            "notes": self.notes,
            "created_at": iso(self.created_at),
            "quotation_count": len(self.quotations),
        }
        if detail:
            data["vendors"] = [invite.vendor.to_dict() for invite in self.vendor_invites]
            data["quotations"] = [q.to_dict(detail=True) for q in self.quotations]
        return data


class RFQVendor(TimestampMixin, db.Model):
    __tablename__ = "rfq_vendors"
    __table_args__ = (db.UniqueConstraint("rfq_id", "vendor_id", name="uq_rfq_vendor"),)

    id = db.Column(db.Integer, primary_key=True)
    rfq_id = db.Column(db.Integer, db.ForeignKey("rfqs.id", ondelete="CASCADE"), nullable=False)
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.id"), nullable=False)
    responded_at = db.Column(db.DateTime(timezone=True))

    rfq = db.relationship("RFQ", back_populates="vendor_invites")
    vendor = db.relationship("Vendor", back_populates="rfq_invites")


class Quotation(TimestampMixin, db.Model):
    __tablename__ = "quotations"

    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.String(40), unique=True, nullable=False, index=True)
    rfq_id = db.Column(db.Integer, db.ForeignKey("rfqs.id"), nullable=False)
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.id"), nullable=False)
    status = db.Column(db.String(20), nullable=False, default=QT_SUBMITTED)
    total = db.Column(db.Numeric(18, 2), nullable=False, default=0)
    lead_time_days = db.Column(db.Integer, nullable=False, default=0)
    warranty = db.Column(db.String(120))
    valid_until = db.Column(db.Date)
    notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))

    rfq = db.relationship("RFQ", back_populates="quotations")
    vendor = db.relationship("Vendor", back_populates="quotations")
    creator = db.relationship("User", foreign_keys=[created_by])
    items = db.relationship(
        "QuotationItem",
        back_populates="quotation",
        cascade="all, delete-orphan",
        order_by="QuotationItem.id",
    )

    def recalculate(self) -> None:
        total = money(0)
        for item in self.items:
            item.subtotal = money(item.qty) * money(item.unit_price)
            total += money(item.subtotal)
        self.total = money(total)

    def to_dict(self, detail: bool = False) -> dict:
        data = {
            "id": self.id,
            "number": self.number,
            "rfq_id": self.rfq_id,
            "vendor": self.vendor.to_dict() if self.vendor else None,
            "status": self.status,
            "total": as_float(self.total),
            "lead_time_days": self.lead_time_days,
            "warranty": self.warranty,
            "valid_until": iso(self.valid_until),
            "notes": self.notes,
        }
        if detail:
            data["items"] = [item.to_dict() for item in self.items]
        return data


class QuotationItem(TimestampMixin, db.Model):
    __tablename__ = "quotation_items"

    id = db.Column(db.Integer, primary_key=True)
    quotation_id = db.Column(
        db.Integer, db.ForeignKey("quotations.id", ondelete="CASCADE"), nullable=False
    )
    pr_item_id = db.Column(db.Integer, db.ForeignKey("purchase_request_items.id"), nullable=False)
    qty = db.Column(db.Numeric(18, 2), nullable=False)
    unit_price = db.Column(db.Numeric(18, 2), nullable=False)
    subtotal = db.Column(db.Numeric(18, 2), nullable=False, default=0)

    quotation = db.relationship("Quotation", back_populates="items")
    pr_item = db.relationship("PurchaseRequestItem")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "pr_item_id": self.pr_item_id,
            "description": self.pr_item.description if self.pr_item else None,
            "qty": as_float(self.qty),
            "unit_price": as_float(self.unit_price),
            "subtotal": as_float(self.subtotal),
        }


# ---------------------------------------------------------------------------
# Purchase Order & receiving
# ---------------------------------------------------------------------------
class PurchaseOrder(TimestampMixin, db.Model):
    __tablename__ = "purchase_orders"

    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.String(40), unique=True, nullable=False, index=True)
    pr_id = db.Column(db.Integer, db.ForeignKey("purchase_requests.id"), nullable=False)
    quotation_id = db.Column(
        db.Integer, db.ForeignKey("quotations.id"), unique=True, nullable=False
    )
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.id"), nullable=False)
    status = db.Column(db.String(30), nullable=False, default=PO_DRAFT, index=True)
    total = db.Column(db.Numeric(18, 2), nullable=False, default=0)
    delivery_date = db.Column(db.Date)
    delivery_address = db.Column(db.Text)
    terms = db.Column(db.Text)
    notes = db.Column(db.Text)
    issued_at = db.Column(db.DateTime(timezone=True))
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))

    pr = db.relationship("PurchaseRequest", back_populates="purchase_orders")
    quotation = db.relationship("Quotation", backref=db.backref("purchase_order", uselist=False))
    vendor = db.relationship("Vendor", back_populates="purchase_orders")
    creator = db.relationship("User", foreign_keys=[created_by])
    items = db.relationship(
        "PurchaseOrderItem",
        back_populates="po",
        cascade="all, delete-orphan",
        order_by="PurchaseOrderItem.id",
    )
    receipts = db.relationship("GoodsReceipt", back_populates="po")
    invoices = db.relationship("Invoice", back_populates="po")

    def is_fully_received(self) -> bool:
        return all(money(i.received_qty) >= money(i.qty) for i in self.items)

    def to_dict(self, detail: bool = False) -> dict:
        data = {
            "id": self.id,
            "number": self.number,
            "pr_id": self.pr_id,
            "pr_number": self.pr.number if self.pr else None,
            "vendor": self.vendor.to_dict() if self.vendor else None,
            "status": self.status,
            "total": as_float(self.total),
            "delivery_date": iso(self.delivery_date),
            "delivery_address": self.delivery_address,
            "terms": self.terms,
            "notes": self.notes,
            "issued_at": iso(self.issued_at),
            "created_at": iso(self.created_at),
        }
        if detail:
            data["items"] = [item.to_dict() for item in self.items]
            data["receipts"] = [r.to_dict() for r in self.receipts]
            data["invoices"] = [i.to_dict() for i in self.invoices]
        return data


class PurchaseOrderItem(TimestampMixin, db.Model):
    __tablename__ = "purchase_order_items"

    id = db.Column(db.Integer, primary_key=True)
    po_id = db.Column(
        db.Integer, db.ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False
    )
    pr_item_id = db.Column(db.Integer, db.ForeignKey("purchase_request_items.id"))
    description = db.Column(db.String(240), nullable=False)
    qty = db.Column(db.Numeric(18, 2), nullable=False)
    uom = db.Column(db.String(20), nullable=False, default="pcs")
    unit_price = db.Column(db.Numeric(18, 2), nullable=False, default=0)
    subtotal = db.Column(db.Numeric(18, 2), nullable=False, default=0)
    received_qty = db.Column(db.Numeric(18, 2), nullable=False, default=0)

    po = db.relationship("PurchaseOrder", back_populates="items")
    pr_item = db.relationship("PurchaseRequestItem")
    receipt_items = db.relationship("GoodsReceiptItem", back_populates="po_item")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "pr_item_id": self.pr_item_id,
            "description": self.description,
            "qty": as_float(self.qty),
            "uom": self.uom,
            "unit_price": as_float(self.unit_price),
            "subtotal": as_float(self.subtotal),
            "received_qty": as_float(self.received_qty),
            "remaining_qty": as_float(money(self.qty) - money(self.received_qty)),
        }


class GoodsReceipt(TimestampMixin, db.Model):
    __tablename__ = "goods_receipts"

    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.String(40), unique=True, nullable=False, index=True)
    po_id = db.Column(db.Integer, db.ForeignKey("purchase_orders.id"), nullable=False)
    received_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    received_date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), nullable=False, default=GRN_DRAFT, index=True)
    delivery_note_no = db.Column(db.String(80))
    is_service = db.Column(db.Boolean, default=False, nullable=False)
    notes = db.Column(db.Text)
    posted_at = db.Column(db.DateTime(timezone=True))

    po = db.relationship("PurchaseOrder", back_populates="receipts")
    receiver = db.relationship("User", foreign_keys=[received_by])
    items = db.relationship(
        "GoodsReceiptItem",
        back_populates="grn",
        cascade="all, delete-orphan",
        order_by="GoodsReceiptItem.id",
    )

    def to_dict(self, detail: bool = False) -> dict:
        data = {
            "id": self.id,
            "number": self.number,
            "po_id": self.po_id,
            "po_number": self.po.number if self.po else None,
            "status": self.status,
            "received_date": iso(self.received_date),
            "delivery_note_no": self.delivery_note_no,
            "is_service": self.is_service,
            "notes": self.notes,
            "receiver": self.receiver.to_dict() if self.receiver else None,
            "posted_at": iso(self.posted_at),
            "created_at": iso(self.created_at),
            "value": as_float(
                sum(
                    (money(i.qty_received) * money(i.po_item.unit_price) for i in self.items),
                    money(0),
                )
            ),
        }
        if detail:
            data["items"] = [item.to_dict() for item in self.items]
        return data


class GoodsReceiptItem(TimestampMixin, db.Model):
    __tablename__ = "goods_receipt_items"

    id = db.Column(db.Integer, primary_key=True)
    grn_id = db.Column(
        db.Integer, db.ForeignKey("goods_receipts.id", ondelete="CASCADE"), nullable=False
    )
    po_item_id = db.Column(db.Integer, db.ForeignKey("purchase_order_items.id"), nullable=False)
    qty_received = db.Column(db.Numeric(18, 2), nullable=False, default=0)
    qty_rejected = db.Column(db.Numeric(18, 2), nullable=False, default=0)
    condition = db.Column(db.String(30), nullable=False, default="GOOD")
    note = db.Column(db.String(240))

    grn = db.relationship("GoodsReceipt", back_populates="items")
    po_item = db.relationship("PurchaseOrderItem", back_populates="receipt_items")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "po_item_id": self.po_item_id,
            "description": self.po_item.description if self.po_item else None,
            "qty_received": as_float(self.qty_received),
            "qty_rejected": as_float(self.qty_rejected),
            "condition": self.condition,
            "note": self.note,
        }


# ---------------------------------------------------------------------------
# Invoice
# ---------------------------------------------------------------------------
class Invoice(TimestampMixin, db.Model):
    __tablename__ = "invoices"

    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.String(80), unique=True, nullable=False, index=True)
    po_id = db.Column(db.Integer, db.ForeignKey("purchase_orders.id"), nullable=False)
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.id"), nullable=False)
    invoice_date = db.Column(db.Date, nullable=False)
    due_date = db.Column(db.Date)
    amount = db.Column(db.Numeric(18, 2), nullable=False)
    status = db.Column(db.String(20), nullable=False, default=INV_RECEIVED, index=True)
    match_notes = db.Column(db.Text)
    verified_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    verified_at = db.Column(db.DateTime(timezone=True))
    notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))

    po = db.relationship("PurchaseOrder", back_populates="invoices")
    vendor = db.relationship("Vendor", back_populates="invoices")
    verifier = db.relationship("User", foreign_keys=[verified_by])
    creator = db.relationship("User", foreign_keys=[created_by])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "number": self.number,
            "po_id": self.po_id,
            "po_number": self.po.number if self.po else None,
            "vendor": self.vendor.to_dict() if self.vendor else None,
            "invoice_date": iso(self.invoice_date),
            "due_date": iso(self.due_date),
            "amount": as_float(self.amount),
            "status": self.status,
            "match_notes": self.match_notes,
            "verified_at": iso(self.verified_at),
            "notes": self.notes,
            "created_at": iso(self.created_at),
        }


# ---------------------------------------------------------------------------
# Control, audit, notification
# ---------------------------------------------------------------------------
class ApprovalRule(db.Model):
    __tablename__ = "approval_rules"

    id = db.Column(db.Integer, primary_key=True)
    doc_type = db.Column(db.String(20), nullable=False, index=True)  # PR | PO
    min_amount = db.Column(db.Numeric(18, 2), nullable=False, default=0)
    max_amount = db.Column(db.Numeric(18, 2))
    sequence = db.Column(db.Integer, nullable=False)
    role = db.Column(db.String(40), nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "doc_type": self.doc_type,
            "min_amount": as_float(self.min_amount),
            "max_amount": as_float(self.max_amount),
            "sequence": self.sequence,
            "role": self.role,
        }


class ApprovalStep(TimestampMixin, db.Model):
    __tablename__ = "approval_steps"
    __table_args__ = (
        db.UniqueConstraint("doc_type", "doc_id", "sequence", name="uq_approval_step"),
        db.Index("ix_approval_doc", "doc_type", "doc_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    doc_type = db.Column(db.String(20), nullable=False)
    doc_id = db.Column(db.Integer, nullable=False)
    sequence = db.Column(db.Integer, nullable=False)
    role = db.Column(db.String(40), nullable=False)
    status = db.Column(db.String(20), nullable=False, default=STEP_PENDING)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    acted_at = db.Column(db.DateTime(timezone=True))
    note = db.Column(db.Text)

    actor = db.relationship("User", foreign_keys=[actor_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "doc_type": self.doc_type,
            "doc_id": self.doc_id,
            "sequence": self.sequence,
            "role": self.role,
            "status": self.status,
            "actor": self.actor.to_dict() if self.actor else None,
            "acted_at": iso(self.acted_at),
            "note": self.note,
        }


class DocumentSequence(db.Model):
    __tablename__ = "document_sequences"
    __table_args__ = (db.UniqueConstraint("doc_type", "period", name="uq_sequence_period"),)

    id = db.Column(db.Integer, primary_key=True)
    doc_type = db.Column(db.String(10), nullable=False)
    period = db.Column(db.String(7), nullable=False)  # YYYY-MM
    last_number = db.Column(db.Integer, nullable=False, default=0)


class ActivityLog(db.Model):
    __tablename__ = "activity_logs"
    __table_args__ = (db.Index("ix_activity_doc", "doc_type", "doc_id"),)

    id = db.Column(db.Integer, primary_key=True)
    doc_type = db.Column(db.String(20), nullable=False)
    doc_id = db.Column(db.Integer, nullable=False)
    action = db.Column(db.String(60), nullable=False)
    from_status = db.Column(db.String(30))
    to_status = db.Column(db.String(30))
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False)

    actor = db.relationship("User", foreign_keys=[actor_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "doc_type": self.doc_type,
            "doc_id": self.doc_id,
            "action": self.action,
            "from_status": self.from_status,
            "to_status": self.to_status,
            "actor": self.actor.name if self.actor else "system",
            "notes": self.notes,
            "created_at": iso(self.created_at),
        }


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    title = db.Column(db.String(160), nullable=False)
    message = db.Column(db.Text)
    link = db.Column(db.String(200))
    is_read = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False)

    user = db.relationship("User", foreign_keys=[user_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "message": self.message,
            "link": self.link,
            "is_read": self.is_read,
            "created_at": iso(self.created_at),
        }
