import { useEffect, useMemo, useState } from 'react'
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
  Typography,
} from 'antd'
import { DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { api } from '../api'
import { useAuth } from '../auth'
import { notify } from '../notify'
import { formatMoney } from '../format'
import { PageHeader } from '../components/PageHeader'
import type { Budget, CatalogItem, PRDetail as PRDetailData } from '../types'

interface ItemForm {
  item_id?: number | null
  description: string
  qty: number
  uom: string
  estimated_price: number
}

interface PRFormValues {
  title: string
  budget_id: number
  needed_date?: Dayjs | null
  justification?: string
  items: ItemForm[]
}

const EMPTY_ITEM: ItemForm = { item_id: null, description: '', qty: 1, uom: 'pcs', estimated_price: 0 }

export function PRForm() {
  const { id } = useParams()
  const prId = id ? Number(id) : null
  const isEdit = prId !== null
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [form] = Form.useForm<PRFormValues>()
  const [saving, setSaving] = useState(false)

  const budgetsQuery = useQuery({ queryKey: ['budgets'], queryFn: () => api.get<Budget[]>('/budgets') })
  const itemsQuery = useQuery({ queryKey: ['items'], queryFn: () => api.get<CatalogItem[]>('/items') })
  const detailQuery = useQuery({
    queryKey: ['pr', prId],
    queryFn: () => api.get<PRDetailData>(`/prs/${prId}`),
    enabled: isEdit,
  })

  useEffect(() => {
    if (!detailQuery.data) return
    const pr = detailQuery.data.pr
    form.setFieldsValue({
      title: pr.title,
      budget_id: pr.budget?.id,
      needed_date: pr.needed_date ? dayjs(pr.needed_date) : null,
      justification: pr.justification ?? undefined,
      items: (pr.items ?? []).map((item) => ({
        item_id: item.item_id,
        description: item.description,
        qty: item.qty,
        uom: item.uom,
        estimated_price: item.estimated_price,
      })),
    })
  }, [detailQuery.data, form])

  const watchedItems = Form.useWatch('items', form)

  const total = useMemo(
    () =>
      (watchedItems ?? []).reduce(
        (sum, item) => sum + Number(item?.qty ?? 0) * Number(item?.estimated_price ?? 0),
        0,
      ),
    [watchedItems],
  )

  const catalog = itemsQuery.data ?? []
  const budgets = budgetsQuery.data ?? []

  const onItemPick = (index: number, itemId: number | undefined) => {
    const picked = catalog.find((entry) => entry.id === itemId)
    if (!picked) return
    const current = form.getFieldValue('items') as ItemForm[]
    form.setFieldValue(['items', index, 'description'], picked.name)
    form.setFieldValue(['items', index, 'uom'], picked.uom)
    form.setFieldValue(['items', index, 'estimated_price'], picked.estimated_price)
    if (!current?.[index]?.qty) form.setFieldValue(['items', index, 'qty'], 1)
  }

  const submit = async (values: PRFormValues) => {
    setSaving(true)
    try {
      const payload = {
        title: values.title,
        budget_id: values.budget_id,
        needed_date: values.needed_date ? values.needed_date.format('YYYY-MM-DD') : null,
        justification: values.justification,
        items: values.items.map((item) => ({
          item_id: item.item_id ?? null,
          description: item.description,
          qty: item.qty,
          uom: item.uom,
          estimated_price: item.estimated_price,
        })),
      }
      if (isEdit) {
        await api.put(`/prs/${prId}`, payload)
        notify.success('PR berhasil diperbarui')
        await queryClient.invalidateQueries({ queryKey: ['pr', prId] })
        navigate(`/prs/${prId}`)
      } else {
        const created = await api.post<{ id: number }>('/prs', payload)
        notify.success('Draft PR berhasil dibuat')
        await queryClient.invalidateQueries({ queryKey: ['prs'] })
        navigate(`/prs/${created.id}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const loading = budgetsQuery.isLoading || (isEdit && detailQuery.isLoading)

  return (
    <div className="page">
      <PageHeader
        back
        title={isEdit ? 'Ubah Purchase Request' : 'Buat Purchase Request'}
        subtitle="Simpan sebagai draft, lalu ajukan approval dari halaman detail."
        extra={
          <Button onClick={() => navigate(-1)} disabled={saving}>
            Batal
          </Button>
        }
      />

      <Alert
        type="info"
        showIcon
        message="PR selalu dimulai sebagai draft"
        description="Approval berjalan berurutan sesuai nilai PR: Dept Head → Finance → (Procurement Manager) → (Director). Budget baru ter-commit saat approval terakhir disetujui."
      />

      <Card loading={loading} size="small">
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          initialValues={{ items: [EMPTY_ITEM] }}
          disabled={saving || user?.role !== 'Requester'}
        >
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="title"
                label="Judul pengadaan"
                rules={[{ required: true, message: 'Judul wajib diisi' }]}
              >
                <Input placeholder="Contoh: Pengadaan laptop tim engineering" />
              </Form.Item>
            </Col>
            <Col xs={24} md={7}>
              <Form.Item
                name="budget_id"
                label="Budget"
                rules={[{ required: true, message: 'Budget wajib dipilih' }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Pilih budget"
                  options={budgets.map((budget) => ({
                    value: budget.id,
                    label: `${budget.code} · tersedia ${formatMoney(budget.available)}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={5}>
              <Form.Item name="needed_date" label="Tanggal dibutuhkan">
                <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="justification" label="Justifikasi / catatan kebutuhan">
            <Input.TextArea
              rows={2}
              maxLength={500}
              showCount
              placeholder="Alasan kebutuhan, kondisi saat ini, dan ekspektasi hasil."
            />
          </Form.Item>

          <Divider titlePlacement="start" plain style={{ marginTop: 0 }}>
            Item yang diminta
          </Divider>

          <Form.List
            name="items"
            rules={[
              {
                validator: async (_, value) => {
                  if (!value || value.length < 1) throw new Error('Minimal satu item')
                },
              },
            ]}
          >
            {(fields, { add, remove }, { errors }) => (
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {fields.map((field, index) => (
                  <Card key={field.key} size="small" styles={{ body: { padding: 12 } }}>
                    <Row gutter={[10, 8]} align="bottom">
                      <Col xs={24} md={5}>
                        <Form.Item name={[index, 'item_id']} label="Katalog (opsional)" style={{ marginBottom: 0 }}>
                          <Select
                            allowClear
                            showSearch
                            placeholder="Pilih item"
                            optionFilterProp="label"
                            options={catalog.map((item) => ({
                              value: item.id,
                              label: `${item.name} · ${item.category ?? '-'}`,
                            }))}
                            onChange={(value) => onItemPick(index, value)}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={7}>
                        <Form.Item
                          name={[index, 'description']}
                          label="Deskripsi"
                          rules={[{ required: true, message: 'Deskripsi wajib diisi' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="Contoh: Laptop 14 inch i7" />
                        </Form.Item>
                      </Col>
                      <Col xs={8} md={2}>
                        <Form.Item
                          name={[index, 'qty']}
                          label="Qty"
                          rules={[{ required: true, message: 'Qty wajib' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber min={0.01} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={8} md={2}>
                        <Form.Item name={[index, 'uom']} label="UoM" style={{ marginBottom: 0 }}>
                          <Input placeholder="pcs" />
                        </Form.Item>
                      </Col>
                      <Col xs={8} md={4}>
                        <Form.Item
                          name={[index, 'estimated_price']}
                          label="Harga satuan"
                          rules={[{ required: true, message: 'Harga wajib' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber<number>
                            min={0}
                            style={{ width: '100%' }}
                            formatter={(value) => `${value ?? 0}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                            parser={(value) => Number((value ?? '').replace(/\./g, ''))}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={4}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            minHeight: 32,
                          }}
                        >
                          <div>
                            <div className="muted" style={{ fontSize: 11 }}>
                              Subtotal
                            </div>
                            <span className="amount">
                              {formatMoney(
                                Number(watchedItems?.[index]?.qty ?? 0) *
                                  Number(watchedItems?.[index]?.estimated_price ?? 0),
                              )}
                            </span>
                          </div>
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => remove(field.name)}
                            disabled={fields.length === 1}
                            aria-label="Hapus item"
                          />
                        </div>
                      </Col>
                    </Row>
                  </Card>
                ))}

                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add(EMPTY_ITEM)} block>
                  Tambah item
                </Button>
                <Form.ErrorList errors={errors} />
              </Space>
            )}
          </Form.List>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 16,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Total dihitung ulang di server saat PR disimpan.
            </Typography.Text>
            <Typography.Text>
              Total estimasi <span className="amount" style={{ fontSize: 16 }}>{formatMoney(total)}</span>
            </Typography.Text>
          </div>

          <Space style={{ marginTop: 16 }}>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
              {isEdit ? 'Simpan perubahan' : 'Simpan draft'}
            </Button>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Setelah tersimpan, buka detail PR untuk mengajukan approval.
            </Typography.Text>
          </Space>
        </Form>
      </Card>

      {user?.role !== 'Requester' && (
        <Alert type="warning" showIcon message="Hanya Requester yang dapat membuat PR." />
      )}
    </div>
  )
}
