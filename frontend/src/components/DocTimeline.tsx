import { Card, Empty, Timeline, Typography } from 'antd'
import type { ActivityLog } from '../types'
import { formatDateTime } from '../format'
import { statusLabel } from '../labels'

const ACTION_LABEL: Record<string, string> = {
  CREATE: 'Dokumen dibuat',
  UPDATE: 'Dokumen diperbarui',
  SUBMIT: 'Diajukan untuk approval',
  APPROVE: 'Disetujui',
  FINAL_APPROVE: 'Disetujui penuh',
  REJECT: 'Ditolak',
  REVISE: 'Direvisi ke draft',
  CANCEL: 'Dibatalkan',
  CLOSE: 'Ditutup',
  AUTO_CLOSE: 'Ditutup otomatis',
  ISSUE: 'Diterbitkan',
  QUOTATION_RECEIVED: 'Quotation diterima',
  AWARD: 'Pemenang ditetapkan',
  RECEIVE: 'Barang diterima',
  POST: 'GRN diposting',
  RECHECK: '3-way match diulang',
  VERIFY: 'Invoice diverifikasi',
  HANDOFF: 'Diserahkan ke Finance',
}

function actionLabel(action: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action]
  if (action.startsWith('APPROVE_L')) return `Disetujui level ${action.split('_L')[1]}`
  return action
}

function dotColor(entry: ActivityLog): string {
  if (entry.action === 'REJECT') return 'red'
  if (entry.action === 'CANCEL') return 'gray'
  if (entry.action.includes('APPROVE')) return 'green'
  if (entry.action === 'AWARD' || entry.action === 'ISSUE') return 'blue'
  return 'gray'
}

export function DocTimeline({ items }: { items: ActivityLog[] }) {
  if (!items.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada aktivitas" />
  }

  return (
    <Timeline
      items={items.map((entry) => ({
        color: dotColor(entry),
        children: (
          <div>
            <Typography.Text strong>{actionLabel(entry.action)}</Typography.Text>
            <Typography.Text type="secondary"> · {entry.actor}</Typography.Text>
            <div className="muted" style={{ fontSize: 12 }}>
              {formatDateTime(entry.created_at)}
              {entry.from_status && entry.to_status && (
                <span>
                  {' '}
                  — {statusLabel(entry.from_status)} → {statusLabel(entry.to_status)}
                </span>
              )}
            </div>
            {entry.notes && (
              <div style={{ marginTop: 2, fontSize: 13 }}>{entry.notes}</div>
            )}
          </div>
        ),
      }))}
    />
  )
}

export function TimelineCard({ items }: { items: ActivityLog[] }) {
  return (
    <Card title="Riwayat aktivitas" size="small">
      <DocTimeline items={items} />
    </Card>
  )
}
