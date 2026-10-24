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
import { INVOICE_STATUS_FILTER, statusLabel } from '../labels'
import type { Invoice, Paged } from '../types'

export function InvoiceList() {
  const [status, setStatus] = useState<string | undefined>()
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['invoices', { status, page }],
    queryFn: () => api.get<Paged<Invoice>>('/invoices', { status, page, per_page: 10 }),
  })

  const columns: TableProps<Invoice>['columns'] = [
    {
      title: 'Nomor invoice',
      dataIndex: 'number',
      width: 195,
      render: (value: string, row) => (
        <Link to={`/invoices/${row.id}`} style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
          {value}
        </Link>
      ),
    },
    {
      title: 'PO',
      width: 170,
      render: (_, row) => (
        <Link to={`/pos/${row.po_id}`}>{row.po_number ?? `#${row.po_id}`}</Link>
      ),
    },
    { title: 'Vendor', dataIndex: ['vendor', 'name'], ellipsis: true },
    {
      title: 'Tanggal',
      dataIndex: 'invoice_date',
      width: 130,
      render: (value: string | null) => formatDate(value),
    },
    {
      title: 'Jatuh tempo',
      dataIndex: 'due_date',
      width: 130,
      responsive: ['lg'],
      render: (value: string | null) => formatDate(value),
    },
    {
      title: 'Nilai',
      dataIndex: 'amount',
      align: 'right',
      width: 170,
      render: (value: number) => <span className="amount">{formatMoney(value)}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 190,
      render: (value: string) => <StatusTag status={value} />,
    },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Invoice Vendor"
        subtitle="Verifikasi tagihan vendor lewat 3-way match PO – GRN – Invoice sebelum diserahkan ke Finance."
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
            style={{ width: 230 }}
            value={status}
            onChange={(value) => {
              setStatus(value)
              setPage(1)
            }}
            options={INVOICE_STATUS_FILTER.map((value) => ({ value, label: statusLabel(value) }))}
          />
        </Space>

        <Table
          rowKey="id"
          loading={query.isLoading}
          columns={columns}
          dataSource={query.data?.items ?? []}
          scroll={{ x: 1000 }}
          pagination={{
            current: page,
            pageSize: query.data?.per_page ?? 10,
            total: query.data?.total ?? 0,
            showSizeChanger: false,
            showTotal: (total) => `${total} invoice`,
            onChange: setPage,
          }}
        />
      </Card>
    </div>
  )
}
