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
  Divider,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import {
  EditOutlined,
  FileAddOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { api } from '../api'
import { useAuth } from '../auth'
import { notify } from '../notify'
import { formatDate, formatDateTime, formatMoney } from '../format'
import { PageHeader } from '../components/PageHeader'
import { StatusTag } from '../components/StatusTag'
import { ApprovalSteps } from '../components/ApprovalSteps'
import { TimelineCard } from '../components/DocTimeline'
import { METHOD_LABEL, statusLabel } from '../labels'
import type { PRDetail as PRDetailData, PRItem, RFQ, Vendor } from '../types'

interface RFQFormValues {
  vendor_ids: number[]
  method: string
  deadline?: Dayjs | null
  justification?: string
}

function defaultMethod(total: number): string {
  if (total <= 10_000_000) return 'DIRECT'
  if (total <= 100_000_000) return 'RFQ'
  return 'TENDER'
}

export function PRDetail() {
  const { id } = useParams()
  const prId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { modal } = AntApp.useApp()
  const [busy, setBusy] = useState(false)
  const [rfqOpen, setRfqOpen] = useState(false)
  const [creatingRfq, setCreatingRfq] = useState(false)
  const [rfqForm] = Form.useForm<RFQFormValues>()

  const { data, isLoading } = useQuery({
    queryKey: ['pr', prId],
    queryFn: () => api.get<PRDetailData>(`/prs/${prId}`),
  })

  const vendorsQuery = useQuery({
    queryKey: ['vendors'],
    queryFn: () => api.get<Vendor[]>('/vendors'),
    enabled: rfqOpen,
  })

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pr', prId] }),
      queryClient.invalidateQueries({ queryKey: ['prs'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['approvals'] }),
    ])
  }

  const runAction = async (path: string, success: string) => {
    setBusy(true)
    try {
      await api.post(`/prs/${prId}${path}`)
      notify.success(success)
      await refreshAll()
    } finally {
      setBusy(false)
    }
  }

  if (isLoading || !data) {
    return (
      <div className="page">
        <PageHeader back title="Memuat PR..." />
        <Card loading />
      </div>
    )
  }

  const { pr, approvals, timeline, rfqs, purchase_orders } = data
  const isOwner = user?.id === pr.requester?.id
  const canEdit = isOwner && ['DRAFT', 'REJECTED'].includes(pr.status)
  const canSubmit = isOwner && pr.status === 'DRAFT'
  const canRevise = isOwner && pr.status === 'REJECTED'
  const canCancel =
    (isOwner || user?.role === 'Procurement Manager') &&
    ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(pr.status)
  const canClose = user?.role === 'Procurement Manager' && pr.status === 'APPROVED'
  const hasActiveRfq = rfqs.some((rfq) => rfq.status !== 'CANCELLED')
  const canCreateRfq =
    !!user &&
    ['Procurement Officer', 'Procurement Manager'].includes(user.role) &&
    pr.status === 'APPROVED' &&
    !hasActiveRfq

  const itemColumns: TableProps<PRItem>['columns'] = [
    { title: '#', width: 50, render: (_, __, index) => index + 1 },
    { title: 'Deskripsi', dataIndex: 'description' },
    { title: 'Qty', dataIndex: 'qty', width: 90, align: 'right', render: (v: number) => v.toLocaleString('id-ID') },
    { title: 'UoM', dataIndex: 'uom', width: 80 },
    {
      title: 'Harga satuan',
      dataIndex: 'estimated_price',
      width: 160,
      align: 'right',
      render: (value: number) => <span className="amount">{formatMoney(value)}</span>,
    },
    {
      title: 'Subtotal',
      dataIndex: 'subtotal',
      width: 170,
      align: 'right',
      render: (value: number) => <span className="amount">{formatMoney(value)}</span>,
    },
  ]

  const openRfqModal = () => {
    rfqForm.setFieldsValue({
      method: defaultMethod(pr.total_estimated),
      deadline: dayjs().add(7, 'day'),
      vendor_ids: [],
      justification: undefined,
    })
    setRfqOpen(true)
  }

  const createRfq = async (values: RFQFormValues) => {
    setCreatingRfq(true)
    try {
      const rfq = await api.post<RFQ>('/rfqs', {
        pr_id: prId,
        vendor_ids: values.vendor_ids,
        method: values.method,
        deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : null,
        justification: values.justification,
      })
      notify.success(`RFQ ${rfq.number} dibuat`)
      setRfqOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['rfqs'] })
      navigate(`/rfqs/${rfq.id}`)
    } finally {
      setCreatingRfq(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        back
        title={
          <Space wrap size={10}>
            <span>{pr.number}</span>
            <StatusTag status={pr.status} />
          </Space>
        }
        subtitle={pr.title}
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => void refreshAll()} loading={busy}>
              Muat ulang
            </Button>
            {canEdit && (
              <Button icon={<EditOutlined />} onClick={() => navigate(`/prs/${prId}/edit`)}>
                Ubah
              </Button>
            )}
            {canRevise && (
              <Button
                onClick={() =>
                  modal.confirm({
                    title: 'Revisi PR ini?',
                    content: 'PR dikembalikan ke draft dan approval lama dihapus. Anda dapat mengubah item lalu mengajukan ulang.',
                    okText: 'Revisi',
                    onOk: () => runAction('/revise', 'PR dikembalikan ke draft'),
                  })
                }
              >
                Revisi
              </Button>
            )}
            {canSubmit && (
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() =>
                  modal.confirm({
                    title: 'Ajukan PR untuk approval?',
                    content: `Approval mengikuti nilai ${formatMoney(pr.total_estimated)}. Pastikan budget dan item sudah benar.`,
                    okText: 'Ajukan',
                    onOk: () => runAction('/submit', 'PR diajukan untuk approval'),
                  })
                }
              >
                Ajukan approval
              </Button>
            )}
            {canCreateRfq && (
              <Button type="primary" icon={<FileAddOutlined />} onClick={openRfqModal}>
                Buat RFQ
              </Button>
            )}
            {canClose && (
              <Button
                onClick={() =>
                  modal.confirm({
                    title: 'Tutup PR?',
                    content: 'PR hanya dapat ditutup bila seluruh PO terkait sudah selesai dan tidak ada penerimaan yang berjalan.',
                    okText: 'Tutup PR',
                    onOk: () => runAction('/close', 'PR ditutup'),
                  })
                }
              >
                Tutup PR
              </Button>
            )}
            {canCancel && (
              <Button
                danger
                onClick={() =>
                  modal.confirm({
                    title: 'Batalkan PR?',
                    content: 'PR yang dibatalkan tidak dapat dilanjutkan. Commitment budget akan dirilis bila PR sudah disetujui.',
                    okText: 'Batalkan PR',
                    okButtonProps: { danger: true },
                    onOk: () => runAction('/cancel', 'PR dibatalkan'),
                  })
                }
              >
                Batalkan
              </Button>
            )}
          </>
        }
      />

      {pr.status === 'APPROVED' && !hasActiveRfq && (
        <Alert
          type="success"
          showIcon
          message="PR disetujui — siap masuk proses sourcing"
          description="Buat RFQ untuk mengundang vendor, atau gunakan pembelian langsung bila nilai ≤ Rp10 juta."
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card title="Informasi PR" size="small">
              <Descriptions column={{ xs: 1, md: 2 }} size="small" items={[
                { key: 'dept', label: 'Departemen', children: pr.department?.name ?? '—' },
                { key: 'requester', label: 'Requester', children: pr.requester?.name ?? '—' },
                {
                  key: 'budget',
                  label: 'Budget',
                  children: pr.budget ? `${pr.budget.code} — ${pr.budget.name}` : '—',
                },
                {
                  key: 'total',
                  label: 'Nilai estimasi',
                  children: <span className="amount">{formatMoney(pr.total_estimated)}</span>,
                },
                { key: 'needed', label: 'Dibutuhkan', children: formatDate(pr.needed_date) },
                { key: 'created', label: 'Dibuat', children: formatDateTime(pr.created_at) },
                { key: 'submitted', label: 'Diajukan', children: formatDateTime(pr.submitted_at) },
                { key: 'approved', label: 'Disetujui', children: formatDateTime(pr.approved_at) },
              ]} />
              {pr.justification && (
                <>
                  <Divider style={{ margin: '12px 0' }} />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Justifikasi
                  </Typography.Text>
                  <div>{pr.justification}</div>
                </>
              )}
            </Card>

            <Card title="Item" size="small">
              <Table
                rowKey="id"
                size="small"
                columns={itemColumns}
                dataSource={pr.items ?? []}
                pagination={false}
                scroll={{ x: 700 }}
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={5} align="right">
                      <Typography.Text strong>Total estimasi</Typography.Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <span className="amount">{formatMoney(pr.total_estimated)}</span>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                )}
              />
            </Card>

            <Card title="Dokumen terkait" size="small">
              {rfqs.length === 0 && purchase_orders.length === 0 ? (
                <Typography.Text type="secondary">Belum ada RFQ atau PO untuk PR ini.</Typography.Text>
              ) : (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {rfqs.map((rfq) => (
                    <div key={`rfq-${rfq.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <Space wrap>
                        <Tag color="blue">RFQ</Tag>
                        <Link to={`/rfqs/${rfq.id}`} style={{ fontWeight: 600 }}>
                          {rfq.number}
                        </Link>
                        <span className="muted">{METHOD_LABEL[rfq.method] ?? rfq.method}</span>
                      </Space>
                      <StatusTag status={rfq.status} />
                    </div>
                  ))}
                  {purchase_orders.map((po) => (
                    <div key={`po-${po.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <Space wrap>
                        <Tag color="purple">PO</Tag>
                        <Link to={`/pos/${po.id}`} style={{ fontWeight: 600 }}>
                          {po.number}
                        </Link>
                        <span className="muted">{po.vendor?.name}</span>
                        <span className="amount">{formatMoney(po.total)}</span>
                      </Space>
                      <StatusTag status={po.status} />
                    </div>
                  ))}
                </Space>
              )}
            </Card>
          </Space>
        </Col>

        <Col xs={24} xl={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card title="Alur approval" size="small">
              <ApprovalSteps steps={approvals} />
              {pr.status === 'REJECTED' && (
                <Alert
                  type="error"
                  showIcon
                  style={{ marginTop: 12 }}
                  message={`PR ditolak pada level ${approvals.find((s) => s.status === 'REJECTED')?.sequence ?? '-'}`}
                  description="Revisi PR untuk mengubah item/nilai lalu ajukan ulang."
                />
              )}
              {pr.status === 'APPROVED' && (
                <Alert
                  type="success"
                  showIcon
                  style={{ marginTop: 12 }}
                  message="Disetujui penuh"
                  description="Budget sudah ter-commit untuk PR ini."
                />
              )}
            </Card>
            <TimelineCard items={timeline} />
          </Space>
        </Col>
      </Row>

      <Modal
        title="Buat RFQ dari PR ini"
        open={rfqOpen}
        onCancel={() => setRfqOpen(false)}
        onOk={() => rfqForm.submit()}
        okText="Buat RFQ"
        confirmLoading={creatingRfq}
        destroyOnHidden
      >
        <Form form={rfqForm} layout="vertical" onFinish={createRfq}>
          <Form.Item
            name="vendor_ids"
            label="Vendor diundang"
            rules={[{ required: true, message: 'Pilih minimal satu vendor' }]}
            extra="RFQ/Tender membutuhkan minimal 3 vendor, kecuali diisi justifikasi."
          >
            <Select
              mode="multiple"
              optionFilterProp="label"
              placeholder="Pilih vendor aktif"
              options={(vendorsQuery.data ?? [])
                .filter((vendor) => vendor.status === 'ACTIVE')
                .map((vendor) => ({
                  value: vendor.id,
                  label: `${vendor.name} · ${vendor.category ?? '-'}`,
                }))}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="method" label="Metode sourcing" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'DIRECT', label: 'Pembelian langsung' },
                    { value: 'RFQ', label: 'RFQ' },
                    { value: 'TENDER', label: 'Tender' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="deadline" label="Batas quotation">
                <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="justification" label="Justifikasi / catatan">
            <Input.TextArea rows={2} placeholder="Wajib bila vendor kurang dari 3 atau pembelian langsung." />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            PR status: {statusLabel(pr.status)} · nilai {formatMoney(pr.total_estimated)}
          </Typography.Text>
        </Form>
      </Modal>
    </div>
  )
}
