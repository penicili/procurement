import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Input, Select, Space, Table } from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { api } from '../api'
import { useAuth } from '../auth'
import { formatDate, formatMoney } from '../format'
import { PageHeader } from '../components/PageHeader'
import { StatusTag } from '../components/StatusTag'
import { PR_STATUS_FILTER, statusLabel } from '../labels'
import type { Paged, PurchaseRequest } from '../types'

export function PRList() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState<string | undefined>()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['prs', { status, search, page }],
    queryFn: () =>
      api.get<Paged<PurchaseRequest>>('/prs', {
        status,
        q: search || undefined,
        page,
        per_page: 10,
      }),
  })

  const columns: TableProps<PurchaseRequest>['columns'] = [
    {
      title: 'Nomor',
      dataIndex: 'number',
      width: 185,
      render: (value: string, row) => (
        <Link to={`/prs/${row.id}`} style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
          {value}
        </Link>
      ),
    },
    {
      title: 'Judul',
      dataIndex: 'title',
      ellipsis: true,
      render: (value: string) => <span title={value}>{value}</span>,
    },
    {
      title: 'Departemen',
      dataIndex: ['department', 'name'],
      width: 178,
      responsive: ['md'],
      render: (value: string | undefined) => (
        <span style={{ whiteSpace: 'nowrap' }}>{value ?? '—'}</span>
      ),
    },
    {
      title: 'Requester',
      dataIndex: ['requester', 'name'],
      width: 150,
      responsive: ['lg'],
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 152,
      render: (value: string) => <StatusTag status={value} />,
    },
    {
      title: 'Estimasi',
      dataIndex: 'total_estimated',
      align: 'right',
      width: 150,
      render: (value: number) => <span className="amount">{formatMoney(value)}</span>,
    },
    {
      title: 'Dibutuhkan',
      dataIndex: 'needed_date',
      width: 140,
      responsive: ['lg'],
      render: (value: string | null) => <span style={{ whiteSpace: 'nowrap' }}>{formatDate(value)}</span>,
    },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Purchase Request"
        subtitle="Permintaan pengadaan dari seluruh departemen dan status approval-nya."
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => void query.refetch()} loading={query.isFetching}>
              Muat ulang
            </Button>
            {user?.role === 'Requester' && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/prs/new')}>
                Buat PR
              </Button>
            )}
          </>
        }
      />

      <Card size="small">
        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            allowClear
            placeholder="Semua status"
            style={{ width: 200 }}
            value={status}
            onChange={(value) => {
              setStatus(value)
              setPage(1)
            }}
            options={PR_STATUS_FILTER.map((value) => ({ value, label: statusLabel(value) }))}
          />
          <Input.Search
            allowClear
            placeholder="Cari nomor atau judul"
            style={{ width: 280 }}
            onSearch={(value) => {
              setSearch(value)
              setPage(1)
            }}
          />
        </Space>

        <Table
          rowKey="id"
          loading={query.isLoading}
          columns={columns}
          dataSource={query.data?.items ?? []}
          scroll={{ x: 900 }}
          pagination={{
            current: page,
            pageSize: query.data?.per_page ?? 10,
            total: query.data?.total ?? 0,
            showSizeChanger: false,
            showTotal: (total) => `${total} PR`,
            onChange: setPage,
          }}
        />
      </Card>
    </div>
  )
}
