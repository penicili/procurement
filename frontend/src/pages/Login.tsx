import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button, Divider, Form, Input, Typography } from 'antd'
import { CheckCircleFilled, LockOutlined, MailOutlined } from '@ant-design/icons'
import { useAuth } from '../auth'

interface LoginForm {
  email: string
  password: string
}

const DEMO_ACCOUNTS = [
  { role: 'Requester (IT)', email: 'rina@demo.test', name: 'Rina Wijaya' },
  { role: 'Requester (GA)', email: 'dewi@demo.test', name: 'Dewi Lestari' },
  { role: 'Dept Head (IT)', email: 'bayu@demo.test', name: 'Bayu Santoso' },
  { role: 'Dept Head (GA)', email: 'hendra@demo.test', name: 'Hendra Gunawan' },
  { role: 'Finance', email: 'sari@demo.test', name: 'Sari Utami' },
  { role: 'Procurement Officer', email: 'andi@demo.test', name: 'Andi Pratama' },
  { role: 'Procurement Manager', email: 'maya@demo.test', name: 'Maya Kartika' },
  { role: 'Director', email: 'direktur@demo.test', name: 'Darmawan Putra' },
  { role: 'Warehouse', email: 'gudang@demo.test', name: 'Gito Saputra' },
]

export function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form] = Form.useForm<LoginForm>()
  const [submitting, setSubmitting] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (user) return <Navigate to={from} replace />

  const onFinish = async (values: LoginForm) => {
    setSubmitting(true)
    try {
      await login(values.email, values.password)
      navigate(from, { replace: true })
    } catch {
      // error sudah ditampilkan oleh global mutation handler
    } finally {
      setSubmitting(false)
    }
  }

  const fill = (email: string) => {
    form.setFieldsValue({ email, password: 'demo1234' })
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-logo">P2P</div>
          <h1>Procurement Management</h1>
          <p>
            Dari permintaan departemen sampai barang diterima di gudang — dengan approval berjenjang,
            perbandingan vendor, dan verifikasi invoice tiga arah.
          </p>
          <ul className="brand-points">
            <li>
              <CheckCircleFilled /> Purchase Request &amp; approval matrix
            </li>
            <li>
              <CheckCircleFilled /> RFQ, quotation, dan comparison matrix
            </li>
            <li>
              <CheckCircleFilled /> PO, penerimaan bertahap, discrepancy
            </li>
            <li>
              <CheckCircleFilled /> 3-way match PO – GRN – Invoice
            </li>
          </ul>
          <div className="brand-foot">Flask REST API + React SPA · demo environment</div>
        </div>

        <div className="login-form">
          <Typography.Title level={3} style={{ marginBottom: 0 }}>
            Masuk ke aplikasi
          </Typography.Title>
          <Typography.Text type="secondary" style={{ marginBottom: 16 }}>
            Gunakan akun demo di bawah, password <code>demo1234</code>.
          </Typography.Text>

          <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
            <Form.Item
              name="email"
              label="Email"
              rules={[{ required: true, message: 'Email wajib diisi' }, { type: 'email' }]}
            >
              <Input prefix={<MailOutlined />} placeholder="nama@demo.test" autoComplete="username" />
            </Form.Item>
            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: true, message: 'Password wajib diisi' }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="demo1234" autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
              Masuk
            </Button>
          </Form>

          <Divider plain style={{ margin: '20px 0 12px', fontSize: 12, color: '#9ca3af' }}>
            AKUN DEMO — KLIK UNTUK MENGISI
          </Divider>

          <div className="demo-grid">
            {DEMO_ACCOUNTS.map((account) => (
              <Button key={account.email} className="demo-btn" onClick={() => fill(account.email)}>
                <div>
                  <div className="demo-role">{account.role}</div>
                  <div className="demo-email">{account.email}</div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
