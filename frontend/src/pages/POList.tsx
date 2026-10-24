import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Select, Space, Table } from 'antd'
import type { TableProps } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { api } from '../api'
import { formatDate, formatMoney } from '../format'
import { PageHeader } from '../components/PageHeader'
import { StatusTag } from '../components/StatusTag'
import { PO_STATUS_FILTER, statusLabel } from '../labels'
import type { Paged, PurchaseOrder } from '../types'

export function POList() {
  const [status, setStatus] = useState<string | undefined>()
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['pos', { status, page }],
    queryFn: () => api.get<Paged<PurchaseOrder>>('/pos', { status, page, per_page: 10 }),
  })

  const columns: TableProps<PurchaseOrder>['columns'] = [
    {
      title: 'Nomor PO',
      dataIndex: 'number',
      width: 185,
      render: (value: string, row) => (
        <Link to={`/pos/${row.id}`} style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
          {value}
        </Link>
      ),
    },
    {
      title: 'PR',
      width: 160,
      render: (_, row) => (row.pr_number ? <Link to={`/prs/${row.pr_id}`}>{row.pr_number}</Link> : '—'),
    },
    { title: 'Vendor', dataIndex: ['vendor', 'name'], ellipsis: true },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 170,
      render: (value: string) => <StatusTag status={value} />,
    },
    {
      title: 'Nilai',
      dataIndex: 'total',
      align: 'right',
      width: 160,
      render: (value: number) => <span className="amount">{formatMoney(value)}</span>,
    },
    {
      title: 'Kirim',
      dataIndex: 'delivery_date',
      width: 120,
      responsive: ['lg'],
      render: (value: string | null) => formatDate(value),
    },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Purchase Order"
        subtitle="PO yang diterbitkan ke vendor, status pengiriman, dan penerimaannya."
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void query.refetch()} loading={query.isFetching}>
            Muat ulang
          </Button>
        }
      />

      <Card size="small">
        <Space style={{ marginBottom: 12 }} wrap>
          <Select
            allowClear
            placeholder="Semua status"
            style={{ width: 220 }}
            value={status}
            onChange={(value) => {
              setStatus(value)
              setPage(1)
            }}
            options={PO_STATUS_FILTER.map((value) => ({ value, label: statusLabel(value) }))}
          />
        </Space>

        <Table
          rowKey="id"
          loading={query.isLoading}
          columns={columns}
          dataSource={query.data?.items ?? []}
          scroll={{ x: 950 }}
          pagination={{
            current: page,
            pageSize: query.data?.per_page ?? 10,
            total: query.data?.total ?? 0,
            showSizeChanger: false,
            showTotal: (total) => `${total} PO`,
            onChange: setPage,
          }}
        />
      </Card>
    </div>
  )
}
