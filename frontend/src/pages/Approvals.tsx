import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, Modal, Space, Table, Tabs, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { CheckOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons'
import { api } from '../api'
import { notify } from '../notify'
import { formatDateTime, formatMoney, fromNow } from '../format'
import { PageHeader } from '../components/PageHeader'
import { StatusTag } from '../components/StatusTag'
import { STATUS_LABEL } from '../labels'
import type { ApprovalInboxItem, ApprovalStep, PurchaseOrder, PurchaseRequest } from '../types'

type ActionState = { type: 'approve' | 'reject'; item: ApprovalInboxItem } | null

function docLink(docType: string, docId: number): string {
  return docType === 'PR' ? `/prs/${docId}` : `/pos/${docId}`
}

function docOwner(doc: PurchaseRequest | PurchaseOrder): string {
  if ('department' in doc) return doc.department?.name ?? '—'
  return doc.pr_number ? `Ref. ${doc.pr_number}` : 'Purchase Order'
}

function docAmount(doc: PurchaseRequest | PurchaseOrder): number {
  return 'total_estimated' in doc ? doc.total_estimated : doc.total
}

function docTitle(doc: PurchaseRequest | PurchaseOrder): string {
  return 'title' in doc ? doc.title : (doc.vendor?.name ?? 'Purchase Order')
}

export function Approvals() {
  const queryClient = useQueryClient()
  const [action, setAction] = useState<ActionState>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const inboxQuery = useQuery({
    queryKey: ['approvals', 'inbox'],
    queryFn: () => api.get<{ items: ApprovalInboxItem[]; total: number }>('/approvals'),
  })

  const historyQuery = useQuery({
    queryKey: ['approvals', 'history'],
    queryFn: () =>
      api.get<Array<{ step: ApprovalStep; document: PurchaseRequest | PurchaseOrder | null }>>(
        '/approvals/history',
      ),
  })

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['approvals'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['prs'] }),
      queryClient.invalidateQueries({ queryKey: ['pos'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ])
  }

  const submitAction = async () => {
    if (!action) return
    setSubmitting(true)
    try {
      await api.post(`/approvals/${action.item.step.id}/${action.type}`, { note: note || undefined })
      notify.success(action.type === 'approve' ? 'Approval berhasil diproses' : 'Dokumen ditolak')
      setAction(null)
      setNote('')
      await refresh()
    } finally {
      setSubmitting(false)
    }
  }

  const inboxColumns: TableProps<ApprovalInboxItem>['columns'] = [
    {
      title: 'Dokumen',
      width: 170,
      render: (_, row) => (
        <Link to={docLink(row.doc_type, row.document.id)} style={{ fontWeight: 600 }}>
          {row.document.number}
        </Link>
      ),
    },
    {
      title: 'Jenis',
      dataIndex: 'doc_type',
      width: 90,
      render: (value: string) => <Tag color={value === 'PR' ? 'blue' : 'purple'}>{value}</Tag>,
    },
    {
      title: 'Ringkasan',
      render: (_, row) => (
        <div>
          <div>{docTitle(row.document)}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {docOwner(row.document)}
          </div>
        </div>
      ),
    },
    {
      title: 'Nilai',
      align: 'right',
      width: 150,
      render: (_, row) => <span className="amount">{formatMoney(docAmount(row.document))}</span>,
    },
    {
      title: 'Level',
      width: 150,
      render: (_, row) => (
        <span>
          {row.step.sequence} · {row.step.role}
        </span>
      ),
    },
    {
      title: 'Menunggu',
      dataIndex: 'waiting_since',
      width: 130,
      render: (value: string | null) => <span className="muted">{fromNow(value)}</span>,
    },
    {
      title: 'Aksi',
      width: 170,
      render: (_, row) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => {
              setAction({ type: 'approve', item: row })
              setNote('')
            }}
          >
            Setujui
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseOutlined />}
            onClick={() => {
              setAction({ type: 'reject', item: row })
              setNote('')
            }}
          >
            Tolak
          </Button>
        </Space>
      ),
    },
  ]

  const historyColumns: TableProps<{ step: ApprovalStep; document: PurchaseRequest | PurchaseOrder | null }>['columns'] = [
    {
      title: 'Dokumen',
      width: 170,
      render: (_, row) =>
        row.document ? (
          <Link to={docLink(row.step.doc_type, row.step.doc_id)}>{row.document.number}</Link>
        ) : (
          `#${row.step.doc_id}`
        ),
    },
    {
      title: 'Keputusan',
      dataIndex: ['step', 'status'],
      width: 120,
      render: (value: string) => <StatusTag status={value === 'APPROVED' ? 'APPROVED' : 'REJECTED'} />,
    },
    { title: 'Level', width: 160, render: (_, row) => `${row.step.sequence} · ${row.step.role}` },
    { title: 'Catatan', render: (_, row) => row.step.note ?? '—' },
    {
      title: 'Waktu',
      width: 170,
      render: (_, row) => <span className="muted">{formatDateTime(row.step.acted_at)}</span>,
    },
  ]

  const inbox = inboxQuery.data?.items ?? []

  return (
    <div className="page">
      <PageHeader
        title="Approval"
        subtitle="Tugas approval yang menunggu keputusan Anda dan riwayat keputusan sebelumnya."
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void refresh()}
            loading={inboxQuery.isFetching || historyQuery.isFetching}
          >
            Muat ulang
          </Button>
        }
      />

      <Tabs
        items={[
          {
            key: 'inbox',
            label: `Tugas saya (${inbox.length})`,
            children: (
              <Card size="small">
                <Table
                  rowKey={(row) => row.step.id}
                  loading={inboxQuery.isLoading}
                  columns={inboxColumns}
                  dataSource={inbox}
                  pagination={false}
                  scroll={{ x: 1000 }}
                  locale={{ emptyText: 'Tidak ada approval yang menunggu Anda' }}
                />
              </Card>
            ),
          },
          {
            key: 'history',
            label: 'Riwayat saya',
            children: (
              <Card size="small">
                <Table
                  rowKey={(row) => row.step.id}
                  loading={historyQuery.isLoading}
                  columns={historyColumns}
                  dataSource={historyQuery.data ?? []}
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                  scroll={{ x: 900 }}
                  locale={{ emptyText: 'Belum ada keputusan' }}
                />
              </Card>
            ),
          },
        ]}
      />

      <Modal
        open={!!action}
        title={action?.type === 'approve' ? 'Setujui dokumen' : 'Tolak dokumen'}
        okText={action?.type === 'approve' ? 'Setujui' : 'Tolak'}
        okButtonProps={{ danger: action?.type === 'reject' }}
        confirmLoading={submitting}
        onOk={() => void submitAction()}
        onCancel={() => setAction(null)}
        destroyOnHidden
      >
        {action && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Typography.Text strong>{action.item.document.number}</Typography.Text>
              <div className="muted">{docTitle(action.item.document)}</div>
              <div className="muted">
                {formatMoney(docAmount(action.item.document))} · Level {action.item.step.sequence} (
                {action.item.step.role})
              </div>
            </div>
            {action.type === 'approve' && (
              <Tag color="blue">{STATUS_LABEL[action.item.document.status] ?? action.item.document.status}</Tag>
            )}
            <Input.TextArea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                action.type === 'approve'
                  ? 'Catatan persetujuan (opsional)'
                  : 'Alasan penolakan (wajib diisi)'
              }
              maxLength={500}
              showCount
            />
            {action.type === 'reject' && !note.trim() && (
              <Typography.Text type="danger" style={{ fontSize: 12 }}>
                Alasan penolakan wajib diisi.
              </Typography.Text>
            )}
          </Space>
        )}
      </Modal>
    </div>
  )
}
