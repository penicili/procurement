import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, Col, Empty, Progress, Row, Skeleton, Space, Table, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import {
  ArrowRightOutlined,
  AuditOutlined,
  DollarOutlined,
  InboxOutlined,
  ShoppingOutlined,
} from '@ant-design/icons'
import { api } from '../api'
import { useAuth } from '../auth'
import { formatMoney, percent, shortMoney } from '../format'
import { StatusTag } from '../components/StatusTag'
import { PageHeader } from '../components/PageHeader'
import { statusLabel } from '../labels'
import type { DashboardData, PurchaseOrder, PurchaseRequest } from '../types'

function KpiCard({
  label,
  value,
  hint,
  icon,
  color,
}: {
  label: string
  value: ReactNode
  hint: ReactNode
  icon: ReactNode
  color: string
}) {
  return (
    <Card size="small" style={{ height: '100%' }}>
      <div className="kpi-label">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <div className="kpi-value" style={{ marginTop: 6 }}>
        {value}
      </div>
      <div className="kpi-hint">{hint}</div>
    </Card>
  )
}

export function Dashboard() {
  const { user } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
  })

  if (isLoading || !data) {
    return (
      <div className="page">
        <PageHeader title="Dashboard" subtitle="Ringkasan pipeline pengadaan" />
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    )
  }

  const { kpis } = data
  const maxDept = Math.max(1, ...data.spend_by_department.map((point) => point.value))

  const prColumns: TableProps<PurchaseRequest>['columns'] = [
    {
      title: 'Dokumen',
      dataIndex: 'number',
      render: (value: string, row) => (
        <div style={{ minWidth: 0 }}>
          <Link to={`/prs/${row.id}`} style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
            {value}
          </Link>
          <div className="muted ellipsis" style={{ fontSize: 12 }} title={row.title}>
            {row.title}
          </div>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 135,
      render: (value: string) => <StatusTag status={value} />,
    },
    {
      title: 'Nilai',
      dataIndex: 'total_estimated',
      align: 'right',
      width: 135,
      render: (value: number) => <span className="amount">{formatMoney(value)}</span>,
    },
  ]

  const poColumns: TableProps<PurchaseOrder>['columns'] = [
    {
      title: 'Dokumen',
      dataIndex: 'number',
      render: (value: string, row) => (
        <div style={{ minWidth: 0 }}>
          <Link to={`/pos/${row.id}`} style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
            {value}
          </Link>
          <div className="muted ellipsis" style={{ fontSize: 12 }} title={row.vendor?.name}>
            {row.vendor?.name ?? '—'}
          </div>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 135,
      render: (value: string) => <StatusTag status={value} />,
    },
    {
      title: 'Nilai',
      dataIndex: 'total',
      align: 'right',
      width: 135,
      render: (value: number) => <span className="amount">{formatMoney(value)}</span>,
    },
  ]

  return (
    <div className="page">
      <PageHeader
        title={`Halo, ${user?.name.split(' ')[0] ?? 'there'}`}
        subtitle="Ringkasan pengadaan yang sedang berjalan di organisasi Anda."
        extra={
          data.cycle_time_days !== null && (
            <Tag color="geekblue">Rata-rata PR → PO: {data.cycle_time_days} hari</Tag>
          )
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            label="Menunggu approval"
            value={kpis.pending_approvals}
            hint={
              kpis.pending_approvals > 0 ? (
                <Link to="/approvals">
                  Tugas approval Anda <ArrowRightOutlined />
                </Link>
              ) : (
                'Tidak ada tugas approval'
              )
            }
            icon={<AuditOutlined />}
            color="#4f46e5"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            label="PR menunggu approval"
            value={kpis.pr_waiting_approval}
            hint={`${kpis.pr_total} PR tercatat · ${kpis.pr_approved} disetujui`}
            icon={<InboxOutlined />}
            color="#0891b2"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            label="PO berjalan"
            value={kpis.po_open}
            hint={
              <>
                Nilai PO aktif <span className="amount">{shortMoney(kpis.po_value)}</span>
              </>
            }
            icon={<ShoppingOutlined />}
            color="#d97706"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            label="Realisasi (barang diterima)"
            value={shortMoney(kpis.spend)}
            hint={`${kpis.invoices_matched} invoice lolos 3-way match`}
            icon={<DollarOutlined />}
            color="#059669"
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Spend per departemen" size="small" style={{ height: '100%' }}>
            {data.spend_by_department.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada realisasi" />
            ) : (
              <Space direction="vertical" size={14} style={{ width: '100%' }}>
                {data.spend_by_department.map((point) => (
                  <div key={point.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span>{point.name}</span>
                      <span className="amount">{formatMoney(point.value)}</span>
                    </div>
                    <Progress
                      percent={percent(point.value, maxDept)}
                      showInfo={false}
                      strokeColor="#4f46e5"
                      size="small"
                    />
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Pipeline dokumen" size="small" style={{ height: '100%' }}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              {Object.entries(data.pr_by_status).length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                Object.entries(data.pr_by_status).map(([status, count]) => (
                  <div key={status} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography.Text>{statusLabel(status)}</Typography.Text>
                    <Tag color="default" style={{ marginInlineEnd: 0 }}>
                      {count}
                    </Tag>
                  </div>
                ))
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title="PR terbaru"
            size="small"
            extra={<Link to="/prs">Lihat semua</Link>}
            style={{ height: '100%' }}
          >
            <Table
              size="small"
              rowKey="id"
              columns={prColumns}
              dataSource={data.recent_prs}
              pagination={false}
              locale={{ emptyText: 'Belum ada PR' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="PO terbaru"
            size="small"
            extra={<Link to="/pos">Lihat semua</Link>}
            style={{ height: '100%' }}
          >
            <Table
              size="small"
              rowKey="id"
              columns={poColumns}
              dataSource={data.recent_pos}
              pagination={false}
              locale={{ emptyText: 'Belum ada PO' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Pemakaian budget" size="small">
        {data.budgets.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada budget" />
        ) : (
          <Row gutter={[16, 16]}>
            {data.budgets.map((budget) => {
              const used = budget.committed + budget.spent
              return (
                <Col xs={24} md={12} xl={8} key={budget.id}>
                  <div style={{ border: '1px solid #eef0f5', borderRadius: 10, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{budget.code}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {budget.name}
                        </div>
                      </div>
                      <Tag color={budget.available > 0 ? 'green' : 'red'} style={{ marginInlineEnd: 0 }}>
                        {shortMoney(budget.available)}
                      </Tag>
                    </div>
                    <Progress
                      percent={percent(used, budget.allocated)}
                      size="small"
                      strokeColor={used / budget.allocated > 0.9 ? '#dc2626' : '#4f46e5'}
                    />
                    <div className="muted" style={{ fontSize: 12 }}>
                      Terpakai {formatMoney(used)} dari {formatMoney(budget.allocated)}
                    </div>
                  </div>
                </Col>
              )
            })}
          </Row>
        )}
      </Card>
    </div>
  )
}
