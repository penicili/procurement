import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Select, Space, Table, Tag } from 'antd'
import type { TableProps } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { api } from '../api'
import { formatDate } from '../format'
import { PageHeader } from '../components/PageHeader'
import { StatusTag } from '../components/StatusTag'
import { METHOD_LABEL, statusLabel } from '../labels'
import type { Paged, RFQ } from '../types'

export function RFQList() {
  const [status, setStatus] = useState<string | undefined>()
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['rfqs', { status, page }],
    queryFn: () => api.get<Paged<RFQ>>('/rfqs', { status, page, per_page: 10 }),
  })

  const columns: TableProps<RFQ>['columns'] = [
    {
      title: 'Nomor RFQ',
      dataIndex: 'number',
      width: 185,
      render: (value: string, row) => (
        <Link to={`/rfqs/${row.id}`} style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
          {value}
        </Link>
      ),
    },
    {
      title: 'PR',
      width: 170,
      render: (_, row) => (row.pr ? <Link to={`/prs/${row.pr.id}`}>{row.pr.number}</Link> : '—'),
    },
    {
      title: 'Judul',
      ellipsis: true,
      render: (_, row) => row.pr?.title ?? '—',
    },
    {
      title: 'Metode',
      dataIndex: 'method',
      width: 150,
      render: (value: string) => <Tag color="geekblue">{METHOD_LABEL[value] ?? value}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 170,
      render: (value: string) => <StatusTag status={value} />,
    },
    {
      title: 'Quotation',
      dataIndex: 'quotation_count',
      width: 100,
      align: 'center',
      render: (value: number) => <Tag>{value}</Tag>,
    },
    {
      title: 'Deadline',
      dataIndex: 'deadline',
      width: 130,
      render: (value: string | null) => formatDate(value),
    },
  ]

  return (
    <div className="page">
      <PageHeader
        title="RFQ & Quotation"
        subtitle="Permintaan penawaran, perbandingan vendor, dan penetapan pemenang."
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
            style={{ width: 200 }}
            value={status}
            onChange={(value) => {
              setStatus(value)
              setPage(1)
            }}
            options={['DRAFT', 'ISSUED', 'AWARDED', 'CANCELLED'].map((value) => ({
              value,
              label: statusLabel(value),
            }))}
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
            showTotal: (total) => `${total} RFQ`,
            onChange: setPage,
          }}
        />
      </Card>
    </div>
  )
}
