import { Tag } from 'antd'
import { statusColor, statusLabel } from '../labels'

export function StatusTag({ status }: { status: string }) {
  return (
    <Tag color={statusColor(status)} style={{ marginInlineEnd: 0 }}>
      {statusLabel(status)}
    </Tag>
  )
}
