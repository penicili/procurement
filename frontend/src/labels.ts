export const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Menunggu approval',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
  CLOSED: 'Selesai',
  PENDING_APPROVAL: 'Menunggu approval',
  ISSUED: 'Diterbitkan',
  PARTIALLY_RECEIVED: 'Diterima sebagian',
  RECEIVED: 'Diterima',
  AWARDED: 'Pemenang ditetapkan',
  POSTED: 'Diposting',
  MATCHED: 'Lolos 3-way match',
  VERIFIED: 'Terverifikasi',
  DISPUTED: 'Sengketa',
  HANDED_OFF: 'Diserahkan ke Finance',
  SELECTED: 'Dipilih',
  SKIPPED: 'Dilewati',
  PENDING: 'Menunggu',
}

export const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELLED: 'default',
  CLOSED: 'default',
  PENDING_APPROVAL: 'processing',
  ISSUED: 'cyan',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',
  AWARDED: 'success',
  POSTED: 'success',
  MATCHED: 'blue',
  VERIFIED: 'success',
  DISPUTED: 'error',
  HANDED_OFF: 'purple',
  SELECTED: 'success',
  SKIPPED: 'default',
  PENDING: 'processing',
}

export const METHOD_LABEL: Record<string, string> = {
  DIRECT: 'Pembelian langsung',
  RFQ: 'RFQ',
  TENDER: 'Tender',
}

export const CONDITION_LABEL: Record<string, string> = {
  GOOD: 'Baik',
  DAMAGED: 'Rusak',
  WRONG_SPEC: 'Salah spesifikasi',
  SHORT: 'Kurang kirim',
}

export const DOC_TYPE_LABEL: Record<string, string> = {
  PR: 'Purchase Request',
  PO: 'Purchase Order',
  RFQ: 'RFQ',
  GRN: 'Barang diterima',
  INVOICE: 'Invoice',
}

export const PR_STATUS_FILTER = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'CLOSED',
]

export const PO_STATUS_FILTER = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'ISSUED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CLOSED',
  'CANCELLED',
]

export const INVOICE_STATUS_FILTER = [
  'RECEIVED',
  'MATCHED',
  'VERIFIED',
  'DISPUTED',
  'HANDED_OFF',
]

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status
}

export function statusColor(status: string): string {
  return STATUS_COLOR[status] ?? 'default'
}
