import { Empty, Steps, Tag, Typography } from 'antd'
import type { ApprovalStep } from '../types'
import { formatDateTime } from '../format'

function stepStatus(status: string): 'finish' | 'error' | 'wait' | 'process' {
  if (status === 'APPROVED') return 'finish'
  if (status === 'REJECTED') return 'error'
  if (status === 'PENDING') return 'process'
  return 'wait'
}

export function ApprovalSteps({ steps }: { steps: ApprovalStep[] }) {
  if (!steps.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum diajukan untuk approval" />
  }

  return (
    <Steps
      direction="vertical"
      size="small"
      items={steps.map((step) => ({
        title: (
          <span>
            Level {step.sequence} · {step.role}{' '}
            <Tag
              color={
                step.status === 'APPROVED'
                  ? 'success'
                  : step.status === 'REJECTED'
                    ? 'error'
                    : step.status === 'SKIPPED'
                      ? 'default'
                      : 'processing'
              }
              style={{ marginInlineEnd: 0 }}
            >
              {step.status === 'PENDING' ? 'Menunggu' : step.status === 'APPROVED' ? 'Disetujui' : step.status === 'REJECTED' ? 'Ditolak' : 'Dilewati'}
            </Tag>
          </span>
        ),
        status: stepStatus(step.status),
        description: (
          <div style={{ fontSize: 13 }}>
            {step.actor ? (
              <div>
                {step.actor.name} · {formatDateTime(step.acted_at)}
              </div>
            ) : (
              <span className="muted">Belum diproses</span>
            )}
            {step.note && <Typography.Text type="secondary">“{step.note}”</Typography.Text>}
          </div>
        ),
      }))}
    />
  )
}
