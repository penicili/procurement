import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, Col, DatePicker, Empty, Progress, Row, Space, Statistic, Table, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { ClockCircleOutlined, DatabaseOutlined, DollarOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { api } from '../api'
import { formatMoney, percent, shortMoney } from '../format'
import { PageHeader } from '../components/PageHeader'
import { statusLabel } from '../labels'
import type { CycleTime, PipelineData, ReportSummary, SeriesPoint } from '../types'

type RangeValue = [Dayjs | null, Dayjs | null] | null

function SeriesCard({ title, data }: { title: string; data: SeriesPoint[] }) {
  const max = Math.max(1, ...data.map((point) => point.value))
  return (
    <Card title={title} size="small" style={{ height: '100%' }}>
      {data.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada realisasi" />
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {data.map((point) => (
            <div key={point.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>{point.name}</span>
                <span className="amount">{formatMoney(point.value)}</span>
              </div>
              <Progress
                percent={percent(point.value, max)}
                showInfo={false}
                size="small"
                strokeColor="#4f46e5"
              />
            </div>
          ))}
        </Space>
      )}
    </Card>
  )
}

export function Reports() {
  const [range, setRange] = useState<RangeValue>([dayjs().startOf('year'), dayjs()])

  const from = range?.[0]?.format('YYYY-MM-DD')
  const to = range?.[1]?.format('YYYY-MM-DD')

  const summaryQuery = useQuery({
    queryKey: ['reports', 'summary', { from, to }],
    queryFn: () => api.get<ReportSummary>('/reports/summary', { from, to }),
  })

  const cycleQuery = useQuery({
    queryKey: ['reports', 'cycle-time'],
    queryFn: () => api.get<CycleTime>('/reports/cycle-time'),
  })

  const pipelineQuery = useQuery({
    queryKey: ['reports', 'pipeline'],
    queryFn: () => api.get<PipelineData>('/reports/pipeline'),
  })

  const summary = summaryQuery.data
  const cycle = cycleQuery.data
  const pipeline = pipelineQuery.data

  const pipelineRows = [
    ...(pipeline
      ? Object.entries(pipeline.pr).map(([status, count]) => ({
          key: `PR-${status}`,
          doc: 'PR',
          status,
          count,
        }))
      : []),
    ...(pipeline
      ? Object.entries(pipeline.po).map(([status, count]) => ({
          key: `PO-${status}`,
          doc: 'PO',
          status,
          count,
        }))
      : []),
    ...(pipeline
      ? Object.entries(pipeline.invoice).map(([status, count]) => ({
          key: `INV-${status}`,
          doc: 'Invoice',
          status,
          count,
        }))
      : []),
  ]

  const pipelineColumns: TableProps<(typeof pipelineRows)[number]>['columns'] = [
    {
      title: 'Dokumen',
      dataIndex: 'doc',
      width: 110,
      render: (value: string) => (
        <Tag color={value === 'PR' ? 'blue' : value === 'PO' ? 'purple' : 'green'}>{value}</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (value: string) => statusLabel(value),
    },
    {
      title: 'Jumlah',
      dataIndex: 'count',
      width: 100,
      align: 'right',
      render: (value: number) => <span className="amount">{value}</span>,
    },
  ]

  const cycleCards = [
    {
      key: 'pr_po',
      label: 'PR disetujui → PO terbit',
      value: cycle?.pr_to_po_days,
      samples: cycle?.samples.pr_to_po ?? 0,
    },
    {
      key: 'po_grn',
      label: 'PO terbit → barang diterima',
      value: cycle?.po_to_grn_days,
      samples: cycle?.samples.po_to_grn ?? 0,
    },
    {
      key: 'grn_inv',
      label: 'Barang diterima → invoice diverifikasi',
      value: cycle?.grn_to_invoice_days,
      samples: cycle?.samples.grn_to_invoice ?? 0,
    },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Laporan Pengadaan"
        subtitle="Realisasi belanja, waktu siklus proses, dan posisi dokumen di seluruh pipeline."
        extra={
          <>
            <DatePicker.RangePicker
              value={range}
              onChange={(value) => setRange(value as RangeValue)}
              format="DD MMM YYYY"
              allowClear
            />
            <Button
              icon={<ReloadOutlined />}
              loading={summaryQuery.isFetching || cycleQuery.isFetching || pipelineQuery.isFetching}
              onClick={() => {
                void summaryQuery.refetch()
                void cycleQuery.refetch()
                void pipelineQuery.refetch()
              }}
            >
              Muat ulang
            </Button>
          </>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic
              title="Total realisasi"
              value={summary?.total_spend ?? 0}
              formatter={(value) => formatMoney(Number(value))}
              valueStyle={{ fontWeight: 700 }}
              loading={summaryQuery.isLoading}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Berdasarkan GRN posted pada rentang tanggal.
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <div className="kpi-label">
              <DatabaseOutlined /> Dokumen dalam pipeline
            </div>
            <div className="kpi-value">{pipelineRows.reduce((sum, row) => sum + row.count, 0)}</div>
            <div className="kpi-hint">PR + PO + invoice pada semua status</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <div className="kpi-label">
              <DollarOutlined /> Vendor teratas
            </div>
            <div className="kpi-value" style={{ fontSize: 18 }}>
              {summary?.top_vendors[0]?.name ?? '—'}
            </div>
            <div className="kpi-hint">
              {summary?.top_vendors[0] ? shortMoney(summary.top_vendors[0].value) : 'Belum ada realisasi'}
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <SeriesCard title="Realisasi per departemen" data={summary?.by_department ?? []} />
        </Col>
        <Col xs={24} lg={12}>
          <SeriesCard title="Realisasi per kategori" data={summary?.by_category ?? []} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Realisasi per bulan" size="small" style={{ height: '100%' }}>
            {summary?.by_month.length ? (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {summary.by_month.map((point) => (
                  <div key={point.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span>{dayjs(`${point.name}-01`).format('MMMM YYYY')}</span>
                      <span className="amount">{formatMoney(point.value)}</span>
                    </div>
                    <Progress
                      percent={percent(
                        point.value,
                        Math.max(1, ...summary.by_month.map((entry) => entry.value)),
                      )}
                      showInfo={false}
                      size="small"
                      strokeColor="#059669"
                    />
                  </div>
                ))}
              </Space>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada realisasi" />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Vendor teratas" size="small" style={{ height: '100%' }}>
            {summary?.top_vendors.length ? (
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {summary.top_vendors.map((vendor, index) => (
                  <div key={vendor.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Space>
                      <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                        #{index + 1}
                      </Tag>
                      <span>{vendor.name}</span>
                    </Space>
                    <span className="amount">{formatMoney(vendor.value)}</span>
                  </div>
                ))}
              </Space>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada realisasi" />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Waktu siklus rata-rata" size="small">
        <Row gutter={[16, 16]}>
          {cycleCards.map((card) => (
            <Col xs={24} md={8} key={card.key}>
              <div style={{ border: '1px solid #eef0f5', borderRadius: 10, padding: 14 }}>
                <div className="kpi-label">
                  <ClockCircleOutlined /> {card.label}
                </div>
                <div className="kpi-value" style={{ marginTop: 6 }}>
                  {card.value === null || card.value === undefined ? '—' : `${card.value} hari`}
                </div>
                <div className="kpi-hint">{card.samples} sampel dokumen</div>
              </div>
            </Col>
          ))}
        </Row>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
          Waktu siklus dihitung dari pasangan timestamp dokumen (approved → issued → posted → verified).
        </Typography.Text>
      </Card>

      <Card title="Posisi dokumen per status" size="small">
        <Table
          rowKey="key"
          size="small"
          loading={pipelineQuery.isLoading}
          columns={pipelineColumns}
          dataSource={pipelineRows}
          pagination={false}
          locale={{ emptyText: 'Belum ada dokumen' }}
        />
      </Card>
    </div>
  )
}
