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
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import { FileAddOutlined, PlusOutlined, ReloadOutlined, SendOutlined, TrophyOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { api } from '../api'
import { useAuth } from '../auth'
import { notify } from '../notify'
import { formatDate, formatMoney } from '../format'
import { PageHeader } from '../components/PageHeader'
import { StatusTag } from '../components/StatusTag'
import { TimelineCard } from '../components/DocTimeline'
import { METHOD_LABEL } from '../labels'
import type { PurchaseOrder, Quotation, QuotationItem, RFQDetail as RFQDetailData } from '../types'

interface QuotationFormValues {
  vendor_id: number
  lead_time_days: number
  warranty?: string
  valid_until?: Dayjs | null
  notes?: string
  items: Array<{ unit_price: number }>
}

interface POFormValues {
  delivery_date?: Dayjs | null
  delivery_address?: string
  terms?: string
  notes?: string
}

export function RFQDetail() {
  const { id } = useParams()
  const rfqId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { modal } = AntApp.useApp()
  const [busy, setBusy] = useState(false)
  const [quotationOpen, setQuotationOpen] = useState(false)
  const [savingQuotation, setSavingQuotation] = useState(false)
  const [poOpen, setPoOpen] = useState(false)
  const [savingPo, setSavingPo] = useState(false)
  const [quotationForm] = Form.useForm<QuotationFormValues>()
  const [poForm] = Form.useForm<POFormValues>()

  const { data, isLoading } = useQuery({
    queryKey: ['rfq', rfqId],
    queryFn: () => api.get<RFQDetailData>(`/rfqs/${rfqId}`),
  })

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['rfq', rfqId] }),
      queryClient.invalidateQueries({ queryKey: ['rfqs'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ])
  }

  const watchedPrices = Form.useWatch('items', quotationForm)

  if (isLoading || !data) {
    return (
      <div className="page">
        <PageHeader back title="Memuat RFQ..." />
        <Card loading />
      </div>
    )
  }

  const { rfq, comparison, timeline } = data
  const pr = rfq.pr
  const prItems = pr?.items ?? []
  const quotedVendorIds = new Set(comparison.map((q) => q.vendor?.id))
  const availableVendors = (rfq.vendors ?? []).filter((vendor) => !quotedVendorIds.has(vendor.id))
  const selected = comparison.find((q) => q.status === 'SELECTED')
  const minimumQuotations = rfq.method === 'DIRECT' ? 1 : 2
  const canManage = !!user && ['Procurement Officer', 'Procurement Manager'].includes(user.role)
  const canAward = user?.role === 'Procurement Manager'

  const quotationTotal = (watchedPrices ?? []).reduce(
    (sum, row, index) => sum + Number(row?.unit_price ?? 0) * Number(prItems[index]?.qty ?? 0),
    0,
  )

  const issueRfq = async () => {
    setBusy(true)
    try {
      await api.post(`/rfqs/${rfqId}/issue`)
      notify.success('RFQ diterbitkan ke vendor')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const openQuotation = () => {
    quotationForm.setFieldsValue({
      vendor_id: undefined as unknown as number,
      lead_time_days: 7,
      warranty: '12 bulan',
      valid_until: dayjs().add(30, 'day'),
      notes: undefined,
      items: prItems.map((item) => ({ unit_price: item.estimated_price })),
    })
    setQuotationOpen(true)
  }

  const saveQuotation = async (values: QuotationFormValues) => {
    setSavingQuotation(true)
    try {
      await api.post(`/rfqs/${rfqId}/quotations`, {
        vendor_id: values.vendor_id,
        lead_time_days: values.lead_time_days,
        warranty: values.warranty,
        valid_until: values.valid_until ? values.valid_until.format('YYYY-MM-DD') : null,
        notes: values.notes,
        items: prItems.map((item, index) => ({
          pr_item_id: item.id,
          qty: item.qty,
          unit_price: values.items[index]?.unit_price ?? 0,
        })),
      })
      notify.success('Quotation tersimpan')
      setQuotationOpen(false)
      await refresh()
    } finally {
      setSavingQuotation(false)
    }
  }

  const award = (quotation: Quotation) => {
    modal.confirm({
      title: `Tetapkan ${quotation.vendor?.name} sebagai pemenang?`,
      content: `Nilai penawaran ${formatMoney(quotation.total)}. Quotation lain akan ditandai ditolak dan RFQ menjadi AWARDED.`,
      okText: 'Tetapkan pemenang',
      onOk: async () => {
        await api.post(`/rfqs/${rfqId}/award`, { quotation_id: quotation.id })
        notify.success('Pemenang ditetapkan')
        await refresh()
      },
    })
  }

  const openPo = () => {
    poForm.setFieldsValue({
      delivery_date: dayjs().add(7, 'day'),
      delivery_address: 'Gudang pusat, Jl. Jenderal Sudirman No. 1, Jakarta',
      terms: 'Pembayaran 30 hari setelah invoice diverifikasi',
      notes: undefined,
    })
    setPoOpen(true)
  }

  const savePo = async (values: POFormValues) => {
    if (!selected) return
    setSavingPo(true)
    try {
      const po = await api.post<PurchaseOrder>('/pos', {
        quotation_id: selected.id,
        delivery_date: values.delivery_date ? values.delivery_date.format('YYYY-MM-DD') : null,
        delivery_address: values.delivery_address,
        terms: values.terms,
        notes: values.notes,
      })
      notify.success(`PO ${po.number} dibuat`)
      setPoOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['pos'] })
      navigate(`/pos/${po.id}`)
    } finally {
      setSavingPo(false)
    }
  }

  const quotationColumns: TableProps<Quotation>['columns'] = [
    {
      title: 'Vendor',
      render: (_, row) => (
        <div>
          <Space size={6}>
            <span style={{ fontWeight: 600 }}>{row.vendor?.name}</span>
            {row.is_cheapest && <Tag color="gold">Termurah</Tag>}
          </Space>
          <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            Garansi {row.warranty ?? '—'} · berlaku s/d {formatDate(row.valid_until)}
          </div>
        </div>
      ),
    },
    {
      title: 'Total penawaran',
      dataIndex: 'total',
      align: 'right',
      width: 150,
      render: (value: number) => <span className="amount">{formatMoney(value)}</span>,
    },
    {
      title: 'Lead time',
      dataIndex: 'lead_time_days',
      width: 100,
      render: (value: number) => `${value} hari`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (value: string) => <StatusTag status={value} />,
    },
    {
      title: 'Aksi',
      width: 90,
      render: (_, row) =>
        canAward && rfq.status === 'ISSUED' ? (
          <Button type="link" size="small" icon={<TrophyOutlined />} onClick={() => award(row)}>
            Pilih
          </Button>
        ) : null,
    },
  ]

  const quotationItemColumns: TableProps<QuotationItem>['columns'] = [
    { title: 'Deskripsi', dataIndex: 'description' },
    { title: 'Qty', dataIndex: 'qty', width: 80, align: 'right' },
    {
      title: 'Harga satuan',
      dataIndex: 'unit_price',
      width: 150,
      align: 'right',
      render: (value: number) => <span className="amount">{formatMoney(value)}</span>,
    },
    {
      title: 'Subtotal',
      dataIndex: 'subtotal',
      width: 160,
      align: 'right',
      render: (value: number) => <span className="amount">{formatMoney(value)}</span>,
    },
  ]

  return (
    <div className="page">
      <PageHeader
        back
        title={
          <Space wrap size={10}>
            <span>{rfq.number}</span>
            <StatusTag status={rfq.status} />
          </Space>
        }
        subtitle={pr ? `${pr.number} — ${pr.title}` : 'RFQ'}
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={busy}>
              Muat ulang
            </Button>
            {canManage && rfq.status === 'DRAFT' && (
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={busy}
                onClick={() =>
                  modal.confirm({
                    title: 'Terbitkan RFQ?',
                    content: 'Vendor yang diundang akan tercatat menerima permintaan penawaran.',
                    okText: 'Terbitkan',
                    onOk: issueRfq,
                  })
                }
              >
                Terbitkan RFQ
              </Button>
            )}
            {canManage && rfq.status === 'ISSUED' && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openQuotation}
                disabled={availableVendors.length === 0}
              >
                Input quotation
              </Button>
            )}
            {canManage && rfq.status === 'AWARDED' && selected && (
              <Button type="primary" icon={<FileAddOutlined />} onClick={openPo}>
                Buat PO
              </Button>
            )}
          </>
        }
      />

      {rfq.status === 'ISSUED' && comparison.length < minimumQuotations && (
        <Alert
          type="warning"
          showIcon
          message={`Quotation terkumpul ${comparison.length} dari minimal ${minimumQuotations}`}
          description="Pemenang belum dapat ditetapkan sebelum jumlah quotation memenuhi aturan sourcing."
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card title="Informasi RFQ" size="small">
              <Descriptions
                column={{ xs: 1, md: 2 }}
                size="small"
                items={[
                  {
                    key: 'pr',
                    label: 'Purchase Request',
                    children: pr ? <Link to={`/prs/${pr.id}`}>{pr.number}</Link> : '—',
                  },
                  {
                    key: 'method',
                    label: 'Metode sourcing',
                    children: <Tag color="geekblue">{METHOD_LABEL[rfq.method] ?? rfq.method}</Tag>,
                  },
                  { key: 'deadline', label: 'Batas quotation', children: formatDate(rfq.deadline) },
                  {
                    key: 'value',
                    label: 'Nilai estimasi PR',
                    children: <span className="amount">{formatMoney(pr?.total_estimated ?? 0)}</span>,
                  },
                ]}
              />
              {rfq.notes && (
                <div style={{ marginTop: 8 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Catatan
                  </Typography.Text>
                  <div style={{ whiteSpace: 'pre-line' }}>{rfq.notes}</div>
                </div>
              )}
            </Card>

            <Card title="Vendor diundang" size="small">
              <Space wrap>
                {(rfq.vendors ?? []).map((vendor) => (
                  <Tag key={vendor.id} color={quotedVendorIds.has(vendor.id) ? 'green' : 'default'}>
                    {vendor.name}
                  </Tag>
                ))}
                {(rfq.vendors ?? []).length === 0 && (
                  <Typography.Text type="secondary">Belum ada vendor diundang.</Typography.Text>
                )}
              </Space>
            </Card>

            <Card title="Comparison matrix" size="small">
              <Table
                rowKey="id"
                size="small"
                loading={isLoading}
                columns={quotationColumns}
                dataSource={comparison}
                pagination={false}
                scroll={{ x: 720 }}
                locale={{ emptyText: 'Belum ada quotation masuk' }}
                expandable={{
                  expandedRowRender: (row) => (
                    <Table
                      rowKey="id"
                      size="small"
                      columns={quotationItemColumns}
                      dataSource={row.items ?? []}
                      pagination={false}
                    />
                  ),
                  rowExpandable: (row) => (row.items ?? []).length > 0,
                }}
              />
              {selected && (
                <Alert
                  type="success"
                  showIcon
                  style={{ marginTop: 12 }}
                  message={`Pemenang: ${selected.vendor?.name}`}
                  description={`Nilai ${formatMoney(selected.total)} · lead time ${selected.lead_time_days} hari. Buat PO untuk melanjutkan.`}
                />
              )}
            </Card>
          </Space>
        </Col>

        <Col xs={24} xl={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card title="Item yang diminta" size="small">
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {prItems.map((item) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>
                      {item.description}
                      <span className="muted">
                        {' '}
                        · {item.qty} {item.uom}
                      </span>
                    </span>
                    <span className="amount">{formatMoney(item.subtotal)}</span>
                  </div>
                ))}
              </Space>
            </Card>
            <TimelineCard items={timeline} />
          </Space>
        </Col>
      </Row>

      <Modal
        title="Input quotation vendor"
        open={quotationOpen}
        onCancel={() => setQuotationOpen(false)}
        onOk={() => quotationForm.submit()}
        confirmLoading={savingQuotation}
        okText="Simpan quotation"
        width={760}
        destroyOnHidden
      >
        <Form form={quotationForm} layout="vertical" onFinish={saveQuotation}>
          <Row gutter={12}>
            <Col xs={24} md={10}>
              <Form.Item
                name="vendor_id"
                label="Vendor"
                rules={[{ required: true, message: 'Vendor wajib dipilih' }]}
              >
                <Select
                  placeholder="Pilih vendor yang diundang"
                  options={availableVendors.map((vendor) => ({
                    value: vendor.id,
                    label: `${vendor.name} · ${vendor.category ?? '-'}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={8} md={4}>
              <Form.Item name="lead_time_days" label="Lead time (hari)" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={8} md={5}>
              <Form.Item name="warranty" label="Garansi">
                <Input placeholder="12 bulan" />
              </Form.Item>
            </Col>
            <Col xs={8} md={5}>
              <Form.Item name="valid_until" label="Berlaku s/d">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Typography.Text strong>Harga penawaran per item</Typography.Text>
          <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 8 }}>
            {prItems.map((item, index) => (
              <Row key={item.id} gutter={8} align="middle">
                <Col span={11}>
                  <div style={{ fontSize: 13 }}>{item.description}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {item.qty} {item.uom} · estimasi {formatMoney(item.estimated_price)}
                  </div>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name={['items', index, 'unit_price']}
                    rules={[{ required: true, message: 'Harga wajib' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber<number>
                      min={0}
                      style={{ width: '100%' }}
                      addonBefore="Rp"
                      formatter={(value) => `${value ?? 0}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                      parser={(value) => Number((value ?? '').replace(/\./g, ''))}
                    />
                  </Form.Item>
                </Col>
                <Col span={5} style={{ textAlign: 'right' }}>
                  <span className="amount">
                    {formatMoney(Number(watchedPrices?.[index]?.unit_price ?? 0) * Number(item.qty))}
                  </span>
                </Col>
              </Row>
            ))}
          </Space>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <Typography.Text>
              Total penawaran <span className="amount">{formatMoney(quotationTotal)}</span>
            </Typography.Text>
          </div>

          <Form.Item name="notes" label="Catatan" style={{ marginTop: 8 }}>
            <Input.TextArea rows={2} placeholder="Termin, syarat pengiriman, hasil negosiasi." />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Buat Purchase Order"
        open={poOpen}
        onCancel={() => setPoOpen(false)}
        onOk={() => poForm.submit()}
        confirmLoading={savingPo}
        okText="Buat PO"
        destroyOnHidden
      >
        <Form form={poForm} layout="vertical" onFinish={savePo}>
          {selected && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={`${selected.vendor?.name} · ${formatMoney(selected.total)}`}
              description="Harga dan vendor dikunci dari quotation pemenang."
            />
          )}
          <Form.Item name="delivery_date" label="Tanggal pengiriman">
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="delivery_address" label="Alamat pengiriman">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="terms" label="Syarat & kondisi">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="notes" label="Catatan internal">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
