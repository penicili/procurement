// Tipe data yang mencerminkan payload API (lihat app/models.py & app/api/*).

export interface Department {
  id: number
  code: string
  name: string
}

export interface User {
  id: number
  email: string
  name: string
  role: string
  department: Department | null
}

export interface Budget {
  id: number
  code: string
  name: string
  fiscal_year: number
  department: Department | null
  allocated: number
  committed: number
  spent: number
  available: number
}

export interface Vendor {
  id: number
  code: string
  name: string
  npwp: string | null
  address: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  category: string | null
  status: string
  rating: number | null
}

export interface CatalogItem {
  id: number
  code: string
  name: string
  category: string | null
  uom: string
  estimated_price: number
  is_active: boolean
}

export interface PRItem {
  id: number
  item_id: number | null
  item: CatalogItem | null
  description: string
  qty: number
  uom: string
  estimated_price: number
  subtotal: number
}

export interface PurchaseRequest {
  id: number
  number: string
  title: string
  status: string
  department: Department | null
  requester: User | null
  budget: Budget | null
  total_estimated: number
  needed_date: string | null
  justification: string | null
  submitted_at: string | null
  approved_at: string | null
  created_at: string
  items?: PRItem[]
}

export interface QuotationItem {
  id: number
  pr_item_id: number
  description: string | null
  qty: number
  unit_price: number
  subtotal: number
}

export interface Quotation {
  id: number
  number: string
  rfq_id: number
  vendor: Vendor | null
  status: string
  total: number
  lead_time_days: number
  warranty: string | null
  valid_until: string | null
  notes: string | null
  items?: QuotationItem[]
  is_cheapest?: boolean
}

export interface RFQ {
  id: number
  number: string
  pr_id: number
  pr: PurchaseRequest | null
  method: string
  status: string
  deadline: string | null
  notes: string | null
  created_at: string
  quotation_count: number
  vendors?: Vendor[]
  quotations?: Quotation[]
}

export interface POItem {
  id: number
  pr_item_id: number | null
  description: string
  qty: number
  uom: string
  unit_price: number
  subtotal: number
  received_qty: number
  remaining_qty: number
}

export interface GRNItem {
  id: number
  po_item_id: number
  description: string | null
  qty_received: number
  qty_rejected: number
  condition: string
  note: string | null
}

export interface GRN {
  id: number
  number: string
  po_id: number
  po_number: string | null
  status: string
  received_date: string | null
  delivery_note_no: string | null
  is_service: boolean
  notes: string | null
  receiver: User | null
  posted_at: string | null
  created_at: string
  value: number
  items?: GRNItem[]
}

export interface Invoice {
  id: number
  number: string
  po_id: number
  po_number: string | null
  vendor: Vendor | null
  invoice_date: string | null
  due_date: string | null
  amount: number
  status: string
  match_notes: string | null
  verified_at: string | null
  notes: string | null
  created_at: string
}

export interface PurchaseOrder {
  id: number
  number: string
  pr_id: number
  pr_number: string | null
  vendor: Vendor | null
  status: string
  total: number
  delivery_date: string | null
  delivery_address: string | null
  terms: string | null
  notes: string | null
  issued_at: string | null
  created_at: string
  items?: POItem[]
  receipts?: GRN[]
  invoices?: Invoice[]
}

export interface ApprovalStep {
  id: number
  doc_type: string
  doc_id: number
  sequence: number
  role: string
  status: string
  actor: User | null
  acted_at: string | null
  note: string | null
}

export interface ActivityLog {
  id: number
  doc_type: string
  doc_id: number
  action: string
  from_status: string | null
  to_status: string | null
  actor: string
  notes: string | null
  created_at: string
}

export interface ApprovalInboxItem {
  step: ApprovalStep
  doc_type: string
  document: PurchaseRequest | PurchaseOrder
  waiting_since: string | null
}

export interface NotificationItem {
  id: number
  title: string
  message: string | null
  link: string | null
  is_read: boolean
  created_at: string
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  pages: number
}

export interface PRDetail {
  pr: PurchaseRequest
  approvals: ApprovalStep[]
  timeline: ActivityLog[]
  rfqs: RFQ[]
  purchase_orders: PurchaseOrder[]
}

export interface RFQDetail {
  rfq: RFQ
  timeline: ActivityLog[]
  comparison: Quotation[]
}

export interface PODetail {
  po: PurchaseOrder
  approvals: ApprovalStep[]
  timeline: ActivityLog[]
  received_value: number
  receipts: GRN[]
  invoices: Invoice[]
}

export interface GRNDetail {
  grn: GRN
  po: PurchaseOrder
  timeline: ActivityLog[]
}

export interface MatchSummary {
  matched: boolean
  reasons: string[]
  invoice_amount: number
  received_value: number
  tolerance: number
  limit: number
  po_total: number
  received_qty: number
  po_status: string
}

export interface InvoiceDetail {
  invoice: Invoice
  match: MatchSummary
  po: PurchaseOrder
  timeline: ActivityLog[]
}

export interface DashboardKpis {
  pr_total: number
  pr_waiting_approval: number
  pr_approved: number
  po_open: number
  po_closed: number
  po_value: number
  spend: number
  pending_approvals: number
  invoices_matched: number
}

export interface SeriesPoint {
  name: string
  value: number
}

export interface DashboardData {
  kpis: DashboardKpis
  pr_by_status: Record<string, number>
  recent_prs: PurchaseRequest[]
  recent_pos: PurchaseOrder[]
  budgets: Budget[]
  spend_by_department: SeriesPoint[]
  cycle_time_days: number | null
  generated_at: string
}

export interface ReportSummary {
  total_spend: number
  by_department: SeriesPoint[]
  by_category: SeriesPoint[]
  by_month: SeriesPoint[]
  top_vendors: SeriesPoint[]
  filters: { from: string | null; to: string | null }
}

export interface CycleTime {
  pr_to_po_days: number | null
  po_to_grn_days: number | null
  grn_to_invoice_days: number | null
  samples: { pr_to_po: number; po_to_grn: number; grn_to_invoice: number }
}

export interface PipelineData {
  pr: Record<string, number>
  po: Record<string, number>
  invoice: Record<string, number>
}

export interface Meta {
  currency: string
  roles: string[]
  thresholds: {
    direct_purchase: number
    tender: number
    invoice_tolerance_percent: number
  }
  statuses: Record<string, string[]>
  conditions: string[]
  methods: string[]
}
