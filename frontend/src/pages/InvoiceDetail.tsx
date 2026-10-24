import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Descriptions,
  List,
  Row,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd'
import {
  CheckCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { api } from '../api'
import { useAuth } from '../auth'
import { notify } from '../notify'
import { formatDate, formatMoney, percent } from '../format'
import { PageHeader } from '../components/PageHeader'
import { StatusTag } from '../components/StatusTag'
import { TimelineCard } from '../components/DocTimeline'
import type { InvoiceDetail as InvoiceDetailData } from '../types'

export function InvoiceDetail() {
  const { id } = useParams()
  const invoiceId = Number(id)
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { modal } = AntApp.useApp()
  const [busy, setBusy] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => api.get<InvoiceDetailData>(`/invoices/${invoiceId}`),
  })

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] }),
      queryClient.invalidateQueries({ queryKey: ['invoices'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ])
  }

  const runAction = async (path: string, success: string) => {
    setBusy(true)
    try {
      await api.post(`/invoices/${invoiceId}${path}`)
      notify.success(success)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  if (isLoading || !data) {
    return (
      <div className="page">
        <PageHeader back title="Memuat invoice..." />
        <Card loading />
      </div>
    )
  }

  const { invoice, match, po, timeline } = data
  const isFinance = user?.role === 'Finance'
  const canRecheck =
    !!user &&
    ['Procurement Officer', 'Procurement Manager', 'Finance'].includes(user.role) &&
    ['RECEIVED', 'DISPUTED'].includes(invoice.status)
  const canVerify = isFinance && invoice.status === 'MATCHED'
  const canHandoff = isFinance && invoice.status === 'VERIFIED'

  const ratio = match.received_value > 0 ? (invoice.amount / match.received_value) * 100 : 0

  return (
    <div className="page">
      <PageHeader
        back
        title={
          <Space wrap size={10}>
            <span>{invoice.number}</span>
            <StatusTag status={invoice.status} />
          </Space>
        }
        subtitle={`${invoice.vendor?.name ?? 'Vendor'} · PO ${invoice.po_number ?? ''}`}
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={busy}>
              Muat ulang
            </Button>
            {canRecheck && (
              <Button
                icon={<ReloadOutlined />}
                loading={busy}
                onClick={() => void runAction('/recheck', '3-way match dihitung ulang')}
              >
                Cek ulang match
              </Button>
            )}
            {canVerify && (
              <Button
                type="primary"
                icon={<SafetyCertificateOutlined />}
                loading={busy}
                onClick={() =>
                  modal.confirm({
                    title: 'Verifikasi invoice?',
                    content:
                      'Invoice lolos 3-way match. Setelah diverifikasi, dokumen siap diserahkan ke aplikasi pembayaran.',
                    okText: 'Verifikasi',
                    onOk: () => runAction('/verify', 'Invoice terverifikasi'),
                  })
                }
              >
                Verifikasi
              </Button>
            )}
            {canHandoff && (
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={busy}
                onClick={() =>
                  modal.confirm({
                    title: 'Serahkan ke Finance?',
                    content:
                      'Status invoice menjadi HANDED_OFF. Proses pembayaran berjalan di aplikasi finance (di luar scope).',
                    okText: 'Serahkan',
                    onOk: () => runAction('/handoff', 'Invoice diserahkan ke Finance'),
                  })
                }
              >
                Serahkan ke Finance
              </Button>
            )}
          </>
        }
      />

      <Alert
        type={match.matched ? 'success' : invoice.status === 'DISPUTED' ? 'error' : 'warning'}
        showIcon
        icon={match.matched ? <CheckCircleOutlined /> : undefined}
        message={
          match.matched
            ? 'Lolos 3-way match'
            : invoice.status === 'DISPUTED'
              ? 'Invoice dalam sengketa — belum lolos 3-way match'
              : 'Menunggu evaluasi 3-way match'
        }
        description={
          match.matched ? (
            <span>
              Nilai invoice {formatMoney(match.invoice_amount)} masih dalam batas{' '}
              {formatMoney(match.limit)} (nilai diterima {formatMoney(match.received_value)} + toleransi{' '}
              {formatMoney(match.tolerance)}).
            </span>
          ) : (
            <List
              size="small"
              dataSource={match.reasons}
              renderItem={(reason) => <List.Item style={{ paddingInline: 0 }}>{reason}</List.Item>}
            />
          )
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card size="small" style={{ height: '100%' }}>
            <Statistic
              title="Nilai invoice"
              value={invoice.amount}
              formatter={(value) => formatMoney(Number(value))}
              valueStyle={{ fontWeight: 700 }}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              {ratio.toFixed(1)}% dari nilai barang diterima
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" style={{ height: '100%' }}>
            <Statistic
              title="Nilai diterima (GRN posted)"
              value={match.received_value}
              formatter={(value) => formatMoney(Number(value))}
              valueStyle={{ fontWeight: 700 }}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              PO bernilai {formatMoney(match.po_total)} · status {match.po_status}
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" style={{ height: '100%' }}>
            <Statistic
              title="Toleransi diperbolehkan"
              value={match.tolerance}
              formatter={(value) => formatMoney(Number(value))}
              valueStyle={{ fontWeight: 700, color: match.matched ? '#059669' : '#dc2626' }}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Batas atas {formatMoney(match.limit)}
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card title="Detail invoice" size="small">
              <Descriptions
                column={{ xs: 1, md: 2 }}
                size="small"
                items={[
                  { key: 'number', label: 'Nomor invoice', children: invoice.number },
                  {
                    key: 'po',
                    label: 'Purchase Order',
                    children: (
                      <Link to={`/pos/${po.id}`}>{invoice.po_number ?? po.number}</Link>
                    ),
                  },
                  { key: 'vendor', label: 'Vendor', children: invoice.vendor?.name ?? '—' },
                  {
                    key: 'amount',
                    label: 'Nilai',
                    children: <span className="amount">{formatMoney(invoice.amount)}</span>,
                  },
                  {
                    key: 'invoice_date',
                    label: 'Tanggal invoice',
                    children: formatDate(invoice.invoice_date),
                  },
                  { key: 'due_date', label: 'Jatuh tempo', children: formatDate(invoice.due_date) },
                  {
                    key: 'verified_at',
                    label: 'Diverifikasi',
                    children: formatDate(invoice.verified_at),
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    children: <StatusTag status={invoice.status} />,
                  },
                ]}
              />
              {invoice.notes && (
                <>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Catatan
                  </Typography.Text>
                  <div style={{ whiteSpace: 'pre-line' }}>{invoice.notes}</div>
                </>
              )}
              {invoice.match_notes && (
                <>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Hasil pencocokan terakhir
                  </Typography.Text>
                  <div style={{ whiteSpace: 'pre-line' }}>{invoice.match_notes}</div>
                </>
              )}
            </Card>

            <Card title="Dasar pencocokan" size="small">
              <Descriptions
                column={{ xs: 1, md: 2 }}
                size="small"
                items={[
                  {
                    key: 'match',
                    label: 'Status match',
                    children: (
                      <Tag color={match.matched ? 'green' : 'red'}>
                        {match.matched ? 'Lolos' : 'Tidak lolos'}
                      </Tag>
                    ),
                  },
                  {
                    key: 'received_qty',
                    label: 'Total qty diterima',
                    children: match.received_qty.toLocaleString('id-ID'),
                  },
                  {
                    key: 'received_value',
                    label: 'Nilai diterima',
                    children: <span className="amount">{formatMoney(match.received_value)}</span>,
                  },
                  {
                    key: 'limit',
                    label: 'Batas nilai invoice',
                    children: <span className="amount">{formatMoney(match.limit)}</span>,
                  },
                ]}
              />
              <div style={{ marginTop: 8 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  Pemakaian toleransi · {formatMoney(Math.max(0, invoice.amount - match.received_value))} dari{' '}
                  {formatMoney(match.tolerance)}
                </div>
                <div style={{ height: 8, background: '#eef0f5', borderRadius: 999 }}>
                  <div
                    style={{
                      width: `${Math.min(
                        100,
                        percent(Math.max(0, invoice.amount - match.received_value), match.tolerance),
                      )}%`,
                      height: 8,
                      borderRadius: 999,
                      background: invoice.amount > match.limit ? '#dc2626' : '#4f46e5',
                    }}
                  />
                </div>
              </div>
            </Card>

            <Card title="Item PO terkait" size="small">
              <Descriptions
                column={1}
                size="small"
                items={(po.items ?? []).map((item) => ({
                  key: item.id,
                  label: item.description,
                  children: (
                    <span>
                      {item.received_qty} / {item.qty} {item.uom} diterima ·{' '}
                      <span className="amount">{formatMoney(item.unit_price)}</span>/unit
                    </span>
                  ),
                }))}
              />
            </Card>
          </Space>
        </Col>

        <Col xs={24} xl={8}>
          <TimelineCard items={timeline} />
        </Col>
      </Row>
    </div>
  )
}
