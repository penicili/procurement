import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { api } from '../api'
import { useAuth } from '../auth'
import { notify } from '../notify'
import { formatMoney, percent } from '../format'
import { PageHeader } from '../components/PageHeader'
import type { Budget, CatalogItem, Department, Vendor } from '../types'

type DialogKind = 'budget' | 'vendor' | 'item' | null

const moneyParser = (value: string | undefined) => Number((value ?? '').replace(/\./g, ''))
const moneyFormatter = (value: number | string | undefined) =>
  `${value ?? 0}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

export function MasterData() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [saving, setSaving] = useState(false)
  const [budgetForm] = Form.useForm()
  const [vendorForm] = Form.useForm()
  const [itemForm] = Form.useForm()

  const budgetsQuery = useQuery({ queryKey: ['budgets'], queryFn: () => api.get<Budget[]>('/budgets') })
  const vendorsQuery = useQuery({ queryKey: ['vendors'], queryFn: () => api.get<Vendor[]>('/vendors') })
  const itemsQuery = useQuery({ queryKey: ['items'], queryFn: () => api.get<CatalogItem[]>('/items') })
  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<Department[]>('/departments'),
  })

  const canBudget = !!user && ['Finance', 'Procurement Manager'].includes(user.role)
  const canCatalog = !!user && ['Procurement Officer', 'Procurement Manager'].includes(user.role)

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
      queryClient.invalidateQueries({ queryKey: ['vendors'] }),
      queryClient.invalidateQueries({ queryKey: ['items'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ])
  }

  const closeDialog = () => {
    setDialog(null)
    budgetForm.resetFields()
    vendorForm.resetFields()
    itemForm.resetFields()
  }

  const submitBudget = async (values: Record<string, unknown>) => {
    setSaving(true)
    try {
      await api.post('/budgets', values)
      notify.success('Budget baru ditambahkan')
      closeDialog()
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const submitVendor = async (values: Record<string, unknown>) => {
    setSaving(true)
    try {
      await api.post('/vendors', values)
      notify.success('Vendor baru ditambahkan')
      closeDialog()
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const submitItem = async (values: Record<string, unknown>) => {
    setSaving(true)
    try {
      await api.post('/items', values)
      notify.success('Item katalog baru ditambahkan')
      closeDialog()
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const budgetColumns: TableProps<Budget>['columns'] = [
    {
      title: 'Kode',
      dataIndex: 'code',
      width: 170,
      render: (value: string) => <span style={{ fontWeight: 600 }}>{value}</span>,
    },
    { title: 'Nama budget', dataIndex: 'name', ellipsis: true },
    {
      title: 'Departemen',
      dataIndex: ['department', 'name'],
      width: 180,
      render: (value: string | undefined) => (
        <span style={{ whiteSpace: 'nowrap' }}>{value ?? '—'}</span>
      ),
    },
    { title: 'Tahun', dataIndex: 'fiscal_year', width: 80, align: 'center' },
    {
      title: 'Pagu',
      dataIndex: 'allocated',
      width: 160,
      align: 'right',
      render: (value: number) => <span className="amount">{formatMoney(value)}</span>,
    },
    {
      title: 'Terpakai',
      width: 200,
      render: (_, row) => {
        const used = row.committed + row.spent
        return (
          <div>
            <Progress
              percent={percent(used, row.allocated)}
              size="small"
              strokeColor={used / row.allocated > 0.9 ? '#dc2626' : '#4f46e5'}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              Commit {formatMoney(row.committed)} · Realisasi {formatMoney(row.spent)}
            </span>
          </div>
        )
      },
    },
    {
      title: 'Tersedia',
      dataIndex: 'available',
      width: 160,
      align: 'right',
      render: (value: number) => (
        <Tag color={value > 0 ? 'green' : 'red'} style={{ marginInlineEnd: 0 }}>
          {formatMoney(value)}
        </Tag>
      ),
    },
  ]

  const vendorColumns: TableProps<Vendor>['columns'] = [
    {
      title: 'Kode',
      dataIndex: 'code',
      width: 130,
      render: (value: string) => <span style={{ fontWeight: 600 }}>{value}</span>,
    },
    { title: 'Nama vendor', dataIndex: 'name', ellipsis: true },
    { title: 'Kategori', dataIndex: 'category', width: 170, render: (value: string | null) => value ?? '—' },
    { title: 'Kontak', dataIndex: 'contact_name', width: 170, render: (value: string | null) => value ?? '—' },
    {
      title: 'Telepon',
      dataIndex: 'contact_phone',
      width: 150,
      render: (value: string | null) => value ?? '—',
    },
    {
      title: 'Rating',
      dataIndex: 'rating',
      width: 90,
      align: 'center',
      render: (value: number | null) => (value ? value.toFixed(1) : '—'),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (value: string) => (
        <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>{value === 'ACTIVE' ? 'Aktif' : value}</Tag>
      ),
    },
  ]

  const itemColumns: TableProps<CatalogItem>['columns'] = [
    {
      title: 'Kode',
      dataIndex: 'code',
      width: 130,
      render: (value: string) => <span style={{ fontWeight: 600 }}>{value}</span>,
    },
    { title: 'Nama item', dataIndex: 'name', ellipsis: true },
    { title: 'Kategori', dataIndex: 'category', width: 180, render: (value: string | null) => value ?? '—' },
    { title: 'UoM', dataIndex: 'uom', width: 90 },
    {
      title: 'Harga estimasi',
      dataIndex: 'estimated_price',
      width: 180,
      align: 'right',
      render: (value: number) => <span className="amount">{formatMoney(value)}</span>,
    },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Master Data"
        subtitle="Budget, vendor, dan katalog item yang dipakai sebagai referensi dokumen pengadaan."
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => void refresh()}>
              Muat ulang
            </Button>
            {dialog === null && canBudget && (
              <Button icon={<PlusOutlined />} onClick={() => setDialog('budget')}>
                Budget
              </Button>
            )}
            {dialog === null && canCatalog && (
              <>
                <Button icon={<PlusOutlined />} onClick={() => setDialog('vendor')}>
                  Vendor
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setDialog('item')}>
                  Item
                </Button>
              </>
            )}
          </>
        }
      />

      <Card size="small">
        <Tabs
          items={[
            {
              key: 'budgets',
              label: `Budget (${budgetsQuery.data?.length ?? 0})`,
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  loading={budgetsQuery.isLoading}
                  columns={budgetColumns}
                  dataSource={budgetsQuery.data ?? []}
                  pagination={false}
                  scroll={{ x: 1100 }}
                />
              ),
            },
            {
              key: 'vendors',
              label: `Vendor (${vendorsQuery.data?.length ?? 0})`,
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  loading={vendorsQuery.isLoading}
                  columns={vendorColumns}
                  dataSource={vendorsQuery.data ?? []}
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                  scroll={{ x: 950 }}
                />
              ),
            },
            {
              key: 'items',
              label: `Katalog item (${itemsQuery.data?.length ?? 0})`,
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  loading={itemsQuery.isLoading}
                  columns={itemColumns}
                  dataSource={itemsQuery.data ?? []}
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                  scroll={{ x: 800 }}
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="Tambah budget"
        open={dialog === 'budget'}
        onCancel={closeDialog}
        onOk={() => budgetForm.submit()}
        confirmLoading={saving}
        okText="Simpan"
        destroyOnHidden
      >
        <Form form={budgetForm} layout="vertical" onFinish={submitBudget}>
          <Form.Item name="code" label="Kode budget" rules={[{ required: true, message: 'Wajib diisi' }]}>
            <Input placeholder="BDG-IT-2026-02" />
          </Form.Item>
          <Form.Item name="name" label="Nama" rules={[{ required: true, message: 'Wajib diisi' }]}>
            <Input placeholder="Belanja perangkat IT" />
          </Form.Item>
          <Form.Item
            name="department_id"
            label="Departemen"
            rules={[{ required: true, message: 'Pilih departemen' }]}
          >
            <Select
              options={(departmentsQuery.data ?? []).map((dept) => ({
                value: dept.id,
                label: `${dept.code} · ${dept.name}`,
              }))}
            />
          </Form.Item>
          <Space size={12} style={{ width: '100%' }}>
            <Form.Item name="fiscal_year" label="Tahun" initialValue={2026} style={{ width: 120 }}>
              <InputNumber min={2020} max={2100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="allocated"
              label="Pagu"
              rules={[{ required: true, message: 'Wajib diisi' }]}
              style={{ flex: 1 }}
            >
              <InputNumber<number>
                min={0}
                style={{ width: '100%' }}
                addonBefore="Rp"
                formatter={moneyFormatter}
                parser={moneyParser}
              />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <Modal
        title="Tambah vendor"
        open={dialog === 'vendor'}
        onCancel={closeDialog}
        onOk={() => vendorForm.submit()}
        confirmLoading={saving}
        okText="Simpan"
        destroyOnHidden
      >
        <Form form={vendorForm} layout="vertical" onFinish={submitVendor}>
          <Space size={12} style={{ width: '100%' }}>
            <Form.Item
              name="code"
              label="Kode vendor"
              rules={[{ required: true, message: 'Wajib diisi' }]}
              style={{ width: 180 }}
            >
              <Input placeholder="VND-009" />
            </Form.Item>
            <Form.Item
              name="name"
              label="Nama vendor"
              rules={[{ required: true, message: 'Wajib diisi' }]}
              style={{ flex: 1 }}
            >
              <Input placeholder="PT Sumber Teknologi" />
            </Form.Item>
          </Space>
          <Space size={12} style={{ width: '100%' }}>
            <Form.Item name="category" label="Kategori" style={{ flex: 1 }}>
              <Input placeholder="IT Hardware" />
            </Form.Item>
            <Form.Item name="npwp" label="NPWP" style={{ flex: 1 }}>
              <Input placeholder="01.234.567.8-901.000" />
            </Form.Item>
          </Space>
          <Form.Item name="address" label="Alamat">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space size={12} style={{ width: '100%' }}>
            <Form.Item name="contact_name" label="Kontak" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="contact_email" label="Email" style={{ flex: 1 }}>
              <Input type="email" />
            </Form.Item>
            <Form.Item name="contact_phone" label="Telepon" style={{ width: 170 }}>
              <Input />
            </Form.Item>
          </Space>
          <Form.Item name="status" label="Status" initialValue="ACTIVE">
            <Select
              options={[
                { value: 'ACTIVE', label: 'Aktif' },
                { value: 'INACTIVE', label: 'Tidak aktif' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Tambah item katalog"
        open={dialog === 'item'}
        onCancel={closeDialog}
        onOk={() => itemForm.submit()}
        confirmLoading={saving}
        okText="Simpan"
        destroyOnHidden
      >
        <Form form={itemForm} layout="vertical" onFinish={submitItem}>
          <Space size={12} style={{ width: '100%' }}>
            <Form.Item
              name="code"
              label="Kode item"
              rules={[{ required: true, message: 'Wajib diisi' }]}
              style={{ width: 180 }}
            >
              <Input placeholder="ITM-013" />
            </Form.Item>
            <Form.Item
              name="name"
              label="Nama item"
              rules={[{ required: true, message: 'Wajib diisi' }]}
              style={{ flex: 1 }}
            >
              <Input placeholder="Monitor 27 inch QHD" />
            </Form.Item>
          </Space>
          <Space size={12} style={{ width: '100%' }}>
            <Form.Item name="category" label="Kategori" style={{ flex: 1 }}>
              <Input placeholder="IT Hardware" />
            </Form.Item>
            <Form.Item name="uom" label="UoM" initialValue="pcs" style={{ width: 100 }}>
              <Input />
            </Form.Item>
            <Form.Item
              name="estimated_price"
              label="Harga estimasi"
              rules={[{ required: true, message: 'Wajib diisi' }]}
              style={{ width: 220 }}
            >
              <InputNumber<number>
                min={0}
                style={{ width: '100%' }}
                addonBefore="Rp"
                formatter={moneyFormatter}
                parser={moneyParser}
              />
            </Form.Item>
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Item aktif langsung dapat dipilih saat membuat Purchase Request.
          </Typography.Text>
        </Form>
      </Modal>
    </div>
  )
}
