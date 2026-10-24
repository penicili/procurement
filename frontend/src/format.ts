import dayjs from 'dayjs'

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value)
}

export function shortMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `Rp${(value / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`
  if (abs >= 1_000_000) return `Rp${(value / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  if (abs >= 1_000) return `Rp${(value / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`
  return `Rp${value.toLocaleString('id-ID')}`
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return dayjs(value).format('DD MMM YYYY')
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return dayjs(value).format('DD MMM YYYY HH:mm')
}

export function fromNow(value: string | null | undefined): string {
  if (!value) return '—'
  const diffMinutes = dayjs().diff(dayjs(value), 'minute')
  if (diffMinutes < 1) return 'baru saja'
  if (diffMinutes < 60) return `${diffMinutes} menit lalu`
  const hours = Math.floor(diffMinutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} hari lalu`
  return formatDate(value)
}

export function percent(part: number, whole: number): number {
  if (!whole) return 0
  return Math.min(100, Math.round((part / whole) * 100))
}
