import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DollarOutlined,
  InboxOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { api } from '../api'
import { useAuth } from '../auth'
import { notify } from '../notify'
import { formatDate, formatDateTime, formatMoney, percent } from '../format'
import { PageHeader } from '../components/PageHeader'
import { StatusTag } from '../components/StatusTag'
import { ApprovalSteps } from '../components/ApprovalSteps'
import { TimelineCard } from '../components/DocTimeline'
import { CONDITION_LABEL } from '../labels'
import type {
  GRN,
  Invoice,
  POItem,
  PODetail as PODetailData,
} from '../types'

interface InvoiceFormValues {
  number: string
  invoice_date: Dayjs
  due_date?: Dayjs | null
  amount: number
  notes?: string
}

export function PODetail() {
  const { id } = useParams()
  const poId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { modal } = AntApp.useApp()
  const [busy, setBusy] = useState(false)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [savingInvoice, setSavingInvoice] = useState(false)
  const [invoiceForm] = Form.useForm<InvoiceFormValues>()

  const { data, isLoading } = useQuery({
    queryKey: ['po', poId],
    queryFn: () => api.get<PODetailData>(`/pos/${poId}`),
  })

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['po', poId] }),
      queryClient.invalidateQueries({ queryKey: ['pos'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ])
  }

  const runAction = async (path: string, success: string) => {
    setBusy(true)
    try {
      await api.post(`/pos/${poId}${path}`)
      notify.success(success)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  if (isLoading || !data) {
    return (
      <div className="page">
        <PageHeader back title="Memuat PO..." />
        <Card loading />
      </div>
    )
  }

  const { po, approvals, timeline, received_value, receipts, invoices } = data
  const canProcurement = !!user && ['Procurement Officer', 'Procurement Manager'].includes(user.role)
  const canReceive = !!user && ['Warehouse', 'Procurement Officer', 'Procurement Manager'].includes(user.role)
  const canInvoice = !!user && ['Procurement Officer', 'Procurement Manager', 'Finance'].includes(user.role)
  const canCancel = canProcurement && ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED'].includes(po.status)
  const canClose = user?.role === 'Procurement Manager' && ['PARTIALLY_RECEIVED', 'RECEIVED'].includes(po.status)

  const openInvoice = () => {
    invoiceForm.setFieldsValue({
      number: '',
      invoice_date: dayjs(),
      due_date: dayjs().add(30, 'day'),
      amount: received_value > 0 ? received_value : po.total,
      notes: undefined,
    })
    setInvoiceOpen(true)
  }

  const saveInvoice = async (values: InvoiceFormValues) => {
    setSavingInvoice(true)
    try {
      const response = await api.post<{ invoice: Invoice; match: { matched: boolean } }>('/invoices', {
        po_id: poId,
        number: values.number,
        invoice_date: values.invoice_date.format('YYYY-MM-DD'),
        due_date: values.due_date ? values.due_date.format('YYYY-MM-DD') : null,
        amount: values.amount,
        notes: values.notes,
      })
      notify.success(
        response.match.matched
          ? 'Invoice tercatat dan lolos 3-way match'
          : 'Invoice tercatat, tetapi belum lolos 3-way match',
      )
      setInvoiceOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['invoices'] })
      navigate(`/invoices/${response.invoice.id}`)
    } finally {
      setSavingInvoice(false)
    }
  }

  const itemColumns: TableProps<POItem>['columns'] = [
    { title: '#', width: 44, render: (_, __, index) => index + 1 },
    { title: 'Deskripsi', dataIndex: 'description', ellipsis: true },
    {
      title: 'Qty',
      dataIndex: 'qty',
      width: 84,
      align: 'right',
      render: (value: number, row) => `${value} ${row.uom}`,
    },
    {
      title: 'Harga satuan',
      dataIndex: 'unit_price',
      width: 128,
      align: 'right',
      render: (value: number) => <span className="amount">{formatMoney(value)}</span>,
    },
    {
      title: 'Subtotal',
      dataIndex: 'subtotal',
      width: 136,
      align: 'right',
      render: (value: number) => <span className="amount">{formatMoney(value)}</span>,
    },
    {
      title: 'Penerimaan',
      dataIndex: 'received_qty',
      width: 160,
      align: 'right',
      render: (value: number, row) => (
        <Space size={6}>
          <span style={{ whiteSpace: 'nowrap' }}>
            {value} / {row.qty}
          </span>
          {row.remaining_qty > 0 ? (
            <Tag color="gold" style={{ marginInlineEnd: 0, whiteSpace: 'nowrap' }}>
              sisa {row.remaining_qty}
            </Tag>
          ) : (
            <Tag color="green" style={{ marginInlineEnd: 0 }}>
              lengkap
            </Tag>
          )}
        </Space>
      ),
    },
  ]

  const receiptColumns: TableProps<GRN>['columns'] = [
    { title: 'Nomor', dataIndex: 'number' },
    { title: 'Tanggal', dataIndex: 'received_date', render: (v: string | null) => formatDate(v) },
    { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    {
      title: 'Nilai',
      dataIndex: 'value',
      align: 'right',
      render: (v: number) => <span className="amount">{formatMoney(v)}</span>,
    },
    { title: 'Penerima', dataIndex: ['receiver', 'name'], responsive: ['lg'] },
  ]

  const invoiceColumns: TableProps<Invoice>['columns'] = [
    {
      title: 'Nomor',
      dataIndex: 'number',
      render: (value: string, row) => <Link to={`/invoices/${row.id}`}>{value}</Link>,
    },
    { title: 'Tanggal', dataIndex: 'invoice_date', render: (v: string | null) => formatDate(v) },
    {
      title: 'Nilai',
      dataIndex: 'amount',
      align: 'right',
      render: (v: number) => <span className="amount">{formatMoney(v)}</span>,
    },
    { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
  ]

  const progress = percent(po.total - (po.items ?? []).reduce((sum, item) => sum + item.remaining_qty * item.unit_price, 0), po.total)

  return (
    <div className="page">
      <PageHeader
        back
        title={
          <Space wrap size={10}>
            <span>{po.number}</span>
            <StatusTag status={po.status} />
          </Space>
        }
        subtitle={`${po.vendor?.name ?? 'Vendor'} · ${po.pr_number ?? ''}`}
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={busy}>
              Muat ulang
            </Button>
            <Button icon={<PrinterOutlined />} onClick={() => navigate(`/pos/${poId}/print`)}>
              Cetak
            </Button>
            {canProcurement && po.status === 'DRAFT' && (
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() =>
                  modal.confirm({
                    title: 'Ajukan PO untuk approval?',
                    content: `Approval PO mengikuti nilai ${formatMoney(po.total)}.`,
                    okText: 'Ajukan',
                    onOk: () => runAction('/submit', 'PO diajukan untuk approval'),
                  })
                }
              >
                Ajukan approval
              </Button>
            )}
            {canProcurement && po.status === 'APPROVED' && (
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() =>
                  modal.confirm({
                    title: 'Terbitkan PO ke vendor?',
                    content: 'Setelah terbit, vendor dapat mengirim barang dan gudang dapat mencatat penerimaan.',
                    okText: 'Terbitkan',
                    onOk: () => runAction('/issue', 'PO diterbitkan'),
                  })
                }
              >
                Terbitkan PO
              </Button>
            )}
            {canReceive && ['ISSUED', 'PARTIALLY_RECEIVED'].includes(po.status) && (
              <Button type="primary" icon={<InboxOutlined />} onClick={() => navigate(`/pos/${poId}/receive`)}>
                Terima barang
              </Button>
            )}
            {canInvoice && ['ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED'].includes(po.status) && (
              <Button icon={<DollarOutlined />} onClick={openInvoice}>
                Catat invoice
              </Button>
            )}
            {canClose && (
              <Button
                icon={<CheckCircleOutlined />}
                onClick={() =>
                  modal.confirm({
                    title: 'Tutup PO?',
                    content:
                      po.status === 'PARTIALLY_RECEIVED'
                        ? 'Sisa qty yang belum diterima akan dianggap tidak akan dikirim.'
                        : 'PO akan ditandai selesai.',
                    okText: 'Tutup PO',
                    onOk: () => runAction('/close', 'PO ditutup'),
                  })
                }
              >
                Tutup PO
              </Button>
            )}
            {canCancel && (
              <Button
                danger
                icon={<CloseCircleOutlined />}
                onClick={() =>
                  modal.confirm({
                    title: 'Batalkan PO?',
                    content:
                      'PO yang dibatalkan tidak dapat diterima. Commitment budget tetap menempel pada PR sampai PR ditutup/dibatalkan.',
                    okText: 'Batalkan PO',
                    okButtonProps: { danger: true },
                    onOk: () => runAction('/cancel', 'PO dibatalkan'),
                  })
                }
              >
                Batalkan
              </Button>
            )}
          </>
        }
      />

      {po.status === 'APPROVED' && (
        <Alert type="info" showIcon message="PO sudah disetujui" description="Terbitkan PO agar vendor dapat mengirim dan gudang dapat menerima barang." />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card title="Informasi PO" size="small">
              <Descriptions
                column={{ xs: 1, md: 2 }}
                size="small"
                items={[
                  {
                    key: 'pr',
                    label: 'Purchase Request',
                    children: <Link to={`/prs/${po.pr_id}`}>{po.pr_number}</Link>,
                  },
                  { key: 'vendor', label: 'Vendor', children: po.vendor?.name ?? '—' },
                  {
                    key: 'total',
                    label: 'Nilai PO',
                    children: <span className="amount">{formatMoney(po.total)}</span>,
                  },
                  { key: 'delivery', label: 'Jadwal kirim', children: formatDate(po.delivery_date) },
                  { key: 'issued', label: 'Diterbitkan', children: formatDateTime(po.issued_at) },
                  {
                    key: 'received_value',
                    label: 'Nilai diterima',
                    children: <span className="amount">{formatMoney(received_value)}</span>,
                  },
                  { key: 'address', label: 'Alamat kirim', children: po.delivery_address ?? '—', span: 2 },
                  { key: 'terms', label: 'Syarat', children: po.terms ?? '—', span: 2 },
                ]}
              />
              <div style={{ marginTop: 8 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Progres penerimaan nilai
                </Typography.Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, height: 8, background: '#eef0f5', borderRadius: 999 }}>
                    <div
                      style={{
                        width: `${progress}%`,
                        height: 8,
                        borderRadius: 999,
                        background: progress >= 100 ? '#059669' : '#4f46e5',
                      }}
                    />
                  </div>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {progress}%
                  </span>
                </div>
              </div>
            </Card>

            <Card title="Item PO" size="small">
              <Table
                rowKey="id"
                size="small"
                columns={itemColumns}
                dataSource={po.items ?? []}
                pagination={false}
                tableLayout="fixed"
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={4} align="right">
                      <Typography.Text strong>Total PO</Typography.Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <span className="amount">{formatMoney(po.total)}</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} colSpan={1} />
                  </Table.Summary.Row>
                )}
              />
            </Card>

            <Card title="Penerimaan barang (GRN)" size="small">
              <Table
                rowKey="id"
                size="small"
                columns={receiptColumns}
                dataSource={receipts}
                pagination={false}
                locale={{ emptyText: 'Belum ada penerimaan' }}
                expandable={{
                  expandedRowRender: (row) => (
                    <Table
                      rowKey="id"
                      size="small"
                      pagination={false}
                      dataSource={row.items ?? []}
                      columns={[
                        { title: 'Item', dataIndex: 'description' },
                        { title: 'Diterima', dataIndex: 'qty_received', width: 100, align: 'right' },
                        { title: 'Ditolak', dataIndex: 'qty_rejected', width: 100, align: 'right' },
                        {
                          title: 'Kondisi',
                          dataIndex: 'condition',
                          width: 140,
                          render: (value: string) => CONDITION_LABEL[value] ?? value,
                        },
                        { title: 'Catatan', dataIndex: 'note', render: (value: string | null) => value ?? '—' },
                      ]}
                    />
                  ),
                  rowExpandable: (row) => (row.items ?? []).length > 0,
                }}
              />
            </Card>

            <Card title="Invoice" size="small">
              <Table
                rowKey="id"
                size="small"
                columns={invoiceColumns}
                dataSource={invoices}
                pagination={false}
                locale={{ emptyText: 'Belum ada invoice' }}
              />
            </Card>
          </Space>
        </Col>

        <Col xs={24} xl={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card title="Approval PO" size="small">
              <ApprovalSteps steps={approvals} />
            </Card>
            <TimelineCard items={timeline} />
          </Space>
        </Col>
      </Row>

      <Modal
        title="Catat invoice vendor"
        open={invoiceOpen}
        onCancel={() => setInvoiceOpen(false)}
        onOk={() => invoiceForm.submit()}
        confirmLoading={savingInvoice}
        okText="Simpan & cek 3-way match"
        destroyOnHidden
      >
        <Form form={invoiceForm} layout="vertical" onFinish={saveInvoice}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={`Nilai barang diterima: ${formatMoney(received_value)}`}
            description="Invoice akan otomatis dicocokkan dengan PO dan GRN. Toleransi harga 2% (min. Rp10.000)."
          />
          <Form.Item
            name="number"
            label="Nomor invoice vendor"
            rules={[{ required: true, message: 'Nomor invoice wajib diisi' }]}
          >
            <Input placeholder="INV/EXT/2026/0004" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="invoice_date" label="Tanggal invoice" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="due_date" label="Jatuh tempo">
                <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="amount" label="Nilai invoice" rules={[{ required: true }]}>
            <InputNumber<number>
              min={1}
              style={{ width: '100%' }}
              addonBefore="Rp"
              formatter={(value) => `${value ?? 0}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => Number((value ?? '').replace(/\./g, ''))}
            />
          </Form.Item>
          <Form.Item name="notes" label="Catatan">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
