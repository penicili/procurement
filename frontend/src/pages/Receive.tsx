import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Typography,
} from 'antd'
import { CheckCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { api } from '../api'
import { notify } from '../notify'
import { formatMoney } from '../format'
import { PageHeader } from '../components/PageHeader'
import { CONDITION_LABEL, statusLabel } from '../labels'
import type { PODetail as PODetailData } from '../types'

interface ReceiveItemForm {
  po_item_id: number
  qty_received: number
  qty_rejected: number
  condition: string
  note?: string
}

interface ReceiveFormValues {
  received_date: Dayjs
  delivery_note_no?: string
  is_service: boolean
  notes?: string
  items: ReceiveItemForm[]
}

export function Receive() {
  const { id } = useParams()
  const poId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<ReceiveFormValues>()
  const [saving, setSaving] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['po', poId],
    queryFn: () => api.get<PODetailData>(`/pos/${poId}`),
  })

  const watchedItems = Form.useWatch('items', form)
  const isService = Form.useWatch('is_service', form)

  if (isLoading || !data) {
    return (
      <div className="page">
        <PageHeader back title="Memuat PO..." />
        <Card loading />
      </div>
    )
  }

  const { po } = data
  const items = po.items ?? []

  if (!['ISSUED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
    return (
      <div className="page">
        <PageHeader back title={`Penerimaan — ${po.number}`} subtitle={po.vendor?.name} />
        <Alert
          type="warning"
          showIcon
          message="PO ini tidak dapat menerima barang"
          description={
            po.status === 'RECEIVED' || po.status === 'CLOSED'
              ? 'Seluruh qty PO sudah diterima atau PO sudah ditutup. Periksa daftar GRN untuk riwayat penerimaan.'
              : `PO berstatus ${statusLabel(po.status)}. Penerimaan hanya dapat dicatat untuk PO yang sudah diterbitkan (ISSUED) atau diterima sebagian (PARTIALLY_RECEIVED).`
          }
          action={
            <Button onClick={() => navigate(`/pos/${po.id}`)}>Kembali ke PO</Button>
          }
        />
      </div>
    )
  }

  const initialItems: ReceiveItemForm[] = items.map((item) => ({
    po_item_id: item.id,
    qty_received: item.remaining_qty > 0 ? item.remaining_qty : 0,
    qty_rejected: 0,
    condition: 'GOOD',
    note: undefined,
  }))

  const receivedValue = items.reduce((sum, item, index) => {
    const qty = Number(watchedItems?.[index]?.qty_received ?? 0)
    return sum + qty * item.unit_price
  }, 0)

  const submit = async (values: ReceiveFormValues) => {
    setSaving(true)
    try {
      const payload = {
        po_id: poId,
        received_date: values.received_date.format('YYYY-MM-DD'),
        delivery_note_no: values.delivery_note_no,
        is_service: !!values.is_service,
        notes: values.notes,
        items: values.items.map((item) => ({
          po_item_id: item.po_item_id,
          qty_received: item.qty_received ?? 0,
          qty_rejected: item.qty_rejected ?? 0,
          condition: item.condition,
          note: item.note,
        })),
      }
      const grn = await api.post<{ id: number; number: string }>('/grns', payload)
      await api.post(`/grns/${grn.id}/post`)
      notify.success(`GRN ${grn.number} diposting. Stok diteruskan ke aplikasi gudang.`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['po', poId] }),
        queryClient.invalidateQueries({ queryKey: ['pos'] }),
        queryClient.invalidateQueries({ queryKey: ['grns'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      navigate(`/pos/${poId}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        back
        title={`Terima barang — ${po.number}`}
        subtitle="Catat qty diterima, qty ditolak, dan kondisi barang. GRN langsung diposting."
        extra={
          <Button onClick={() => navigate(`/pos/${poId}`)} disabled={saving}>
            Batal
          </Button>
        }
      />

      <Alert
        type="info"
        showIcon
        message="Penerimaan bertahap diperbolehkan"
        description="Qty diterima kumulatif tidak boleh melebihi qty PO. Nilai barang diterima akan memindahkan commitment menjadi realisasi budget."
      />

      <Card size="small" loading={isLoading}>
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          initialValues={{
            received_date: dayjs(),
            is_service: false,
            delivery_note_no: '',
            items: initialItems,
          }}
          disabled={saving}
        >
          <Row gutter={16}>
            <Col xs={24} md={6}>
              <Form.Item name="received_date" label="Tanggal terima" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="delivery_note_no" label="Nomor surat jalan">
                <Input placeholder="DO/2026/10/001" />
              </Form.Item>
            </Col>
            <Col xs={24} md={5}>
              <Form.Item name="is_service" label="Jenis" valuePropName="checked">
                <Switch checkedChildren="Jasa / BAST" unCheckedChildren="Barang" />
              </Form.Item>
            </Col>
            <Col xs={24} md={5}>
              <Form.Item label="Nilai diterima">
                <div className="amount" style={{ paddingTop: 6, fontSize: 16 }}>
                  {formatMoney(receivedValue)}
                </div>
              </Form.Item>
            </Col>
          </Row>

          {isService && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="Mode jasa / BAST"
              description="Untuk jasa, qty mewakili volume pekerjaan yang diselesaikan. Pastikan berita acara serah terima sudah diterima."
            />
          )}

          <Divider titlePlacement="start" plain>
            Item PO
          </Divider>

          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {items.map((item, index) => (
              <Card key={item.id} size="small" styles={{ body: { padding: 12 } }}>
                <Row gutter={[10, 8]} align="bottom">
                  <Col xs={24} md={8}>
                    <div style={{ fontWeight: 600 }}>{item.description}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Dipesan {item.qty} {item.uom} · sudah diterima {item.received_qty} · sisa{' '}
                      <b>{item.remaining_qty}</b>
                    </div>
                  </Col>
                  <Col xs={8} md={3}>
                    <Form.Item
                      name={['items', index, 'qty_received']}
                      label="Diterima"
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber min={0} max={item.remaining_qty} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={8} md={3}>
                    <Form.Item
                      name={['items', index, 'qty_rejected']}
                      label="Ditolak"
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={8} md={3}>
                    <Form.Item name={['items', index, 'condition']} label="Kondisi" style={{ marginBottom: 0 }}>
                      <Select
                        options={Object.entries(CONDITION_LABEL).map(([value, label]) => ({ value, label }))}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={7}>
                    <Form.Item name={['items', index, 'note']} label="Catatan discrepancy" style={{ marginBottom: 0 }}>
                      <Input placeholder="Wajib bila ada qty ditolak" />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>
            ))}
          </Space>

          <Form.Item name="notes" label="Catatan penerimaan" style={{ marginTop: 12 }}>
            <Input.TextArea rows={2} placeholder="Kondisi umum, berita acara, atau instruksi retur." />
          </Form.Item>

          <Space>
            <Button
              type="primary"
              htmlType="submit"
              icon={<CheckCircleOutlined />}
              loading={saving}
              disabled={receivedValue <= 0}
            >
              Posting GRN
            </Button>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              GRN akan tercatat sebagai dokumen penerimaan resmi dan tidak dapat diubah setelah diposting.
            </Typography.Text>
          </Space>
        </Form>
      </Card>
    </div>
  )
}
