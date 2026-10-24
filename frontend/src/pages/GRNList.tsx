import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { App as AntApp, Button, Card, Select, Space, Table, Tag } from 'antd'
import type { TableProps } from 'antd'
import { CheckOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons'
import { api } from '../api'
import { useAuth } from '../auth'
import { notify } from '../notify'
import { formatDate, formatMoney } from '../format'
import { PageHeader } from '../components/PageHeader'
import { StatusTag } from '../components/StatusTag'
import { statusLabel } from '../labels'
import type { GRN, Paged } from '../types'

export function GRNList() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { modal } = AntApp.useApp()
  const [status, setStatus] = useState<string | undefined>()
  const [page, setPage] = useState(1)
  const [busyId, setBusyId] = useState<number | null>(null)

  const query = useQuery({
    queryKey: ['grns', { status, page }],
    queryFn: () => api.get<Paged<GRN>>('/grns', { status, page, per_page: 10 }),
  })

  const canManage = !!user && ['Warehouse', 'Procurement Officer', 'Procurement Manager'].includes(user.role)

  const runAction = async (grn: GRN, action: 'post' | 'cancel') => {
    setBusyId(grn.id)
    try {
      await api.post(`/grns/${grn.id}/${action}`)
      notify.success(action === 'post' ? `GRN ${grn.number} diposting` : `GRN ${grn.number} dibatalkan`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['grns'] }),
        queryClient.invalidateQueries({ queryKey: ['pos'] }),
        queryClient.invalidateQueries({ queryKey: ['po', grn.po_id] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    } finally {
      setBusyId(null)
    }
  }

  const columns: TableProps<GRN>['columns'] = [
    {
      title: 'Nomor GRN',
      dataIndex: 'number',
      width: 152,
      render: (value: string) => (
        <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{value}</span>
      ),
    },
    {
      title: 'PO',
      width: 148,
      render: (_, row) => (
        <Link
          to={`/pos/${row.po_id}`}
          style={{ fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          {row.po_number ?? `#${row.po_id}`}
        </Link>
      ),
    },
    {
      title: 'Tgl. terima',
      dataIndex: 'received_date',
      width: 118,
      render: (value: string | null) => (
        <span style={{ whiteSpace: 'nowrap' }}>{formatDate(value)}</span>
      ),
    },
    {
      title: 'Surat jalan',
      dataIndex: 'delivery_note_no',
      width: 106,
      render: (value: string | null) => value ?? '—',
    },
    {
      title: 'Jenis',
      dataIndex: 'is_service',
      width: 86,
      render: (value: boolean) => (value ? <Tag color="purple">Jasa</Tag> : <Tag>Barang</Tag>),
    },
    {
      title: 'Nilai diterima',
      dataIndex: 'value',
      align: 'right',
      width: 132,
      render: (value: number) => <span className="amount">{formatMoney(value)}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 112,
      render: (value: string) => <StatusTag status={value} />,
    },
    {
      title: 'Aksi',
      width: 140,
      render: (_, row) =>
        canManage && row.status === 'DRAFT' ? (
          <Space size={4}>
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              loading={busyId === row.id}
              onClick={() =>
                modal.confirm({
                  title: `Posting GRN ${row.number}?`,
                  content:
                    'Setelah diposting, qty diterima menambah penerimaan PO dan nilai barang berpindah dari commitment ke realisasi budget.',
                  okText: 'Posting',
                  onOk: () => runAction(row, 'post'),
                })
              }
            >
              Posting
            </Button>
            <Button
              danger
              size="small"
              icon={<CloseOutlined />}
              disabled={busyId === row.id}
              onClick={() =>
                modal.confirm({
                  title: `Batalkan GRN ${row.number}?`,
                  content: 'GRN draft yang dibatalkan tidak dapat diposting lagi.',
                  okText: 'Batalkan',
                  okButtonProps: { danger: true },
                  onOk: () => runAction(row, 'cancel'),
                })
              }
            >
              Batal
            </Button>
          </Space>
        ) : null,
    },
    {
      title: 'Penerima',
      dataIndex: ['receiver', 'name'],
      width: 118,
      render: (value: string | undefined) => (
        <span style={{ whiteSpace: 'nowrap' }}>{value ?? '—'}</span>
      ),
      responsive: ['lg'],
    },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Penerimaan Barang (GRN)"
        subtitle="Catatan penerimaan barang/jasa yang menjadi dasar 3-way match dan realisasi budget."
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
            options={['DRAFT', 'POSTED', 'CANCELLED'].map((value) => ({
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
          scroll={{ x: 1118 }}
          expandable={{
            expandedRowRender: (row) => (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={row.items ?? []}
                columns={[
                  { title: 'Item PO', dataIndex: 'description' },
                  { title: 'Diterima', dataIndex: 'qty_received', width: 110, align: 'right' },
                  { title: 'Ditolak', dataIndex: 'qty_rejected', width: 110, align: 'right' },
                  {
                    title: 'Kondisi',
                    dataIndex: 'condition',
                    width: 150,
                  },
                  {
                    title: 'Catatan',
                    dataIndex: 'note',
                    render: (value: string | null) => value ?? '—',
                  },
                ]}
              />
            ),
            rowExpandable: (row) => (row.items ?? []).length > 0,
          }}
          pagination={{
            current: page,
            pageSize: query.data?.per_page ?? 10,
            total: query.data?.total ?? 0,
            showSizeChanger: false,
            showTotal: (total) => `${total} GRN`,
            onChange: setPage,
          }}
        />
      </Card>
    </div>
  )
}
