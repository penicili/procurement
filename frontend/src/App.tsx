import { lazy, Suspense } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { Button, Result, Spin } from 'antd'
import { RequireAuth } from './auth'
import { AppLayout } from './components/AppLayout'

const Login = lazy(async () => ({ default: (await import('./pages/Login')).Login }))
const Dashboard = lazy(async () => ({ default: (await import('./pages/Dashboard')).Dashboard }))
const PRList = lazy(async () => ({ default: (await import('./pages/PRList')).PRList }))
const PRForm = lazy(async () => ({ default: (await import('./pages/PRForm')).PRForm }))
const PRDetail = lazy(async () => ({ default: (await import('./pages/PRDetail')).PRDetail }))
const Approvals = lazy(async () => ({ default: (await import('./pages/Approvals')).Approvals }))
const RFQList = lazy(async () => ({ default: (await import('./pages/RFQList')).RFQList }))
const RFQDetail = lazy(async () => ({ default: (await import('./pages/RFQDetail')).RFQDetail }))
const POList = lazy(async () => ({ default: (await import('./pages/POList')).POList }))
const PODetail = lazy(async () => ({ default: (await import('./pages/PODetail')).PODetail }))
const POPrint = lazy(async () => ({ default: (await import('./pages/POPrint')).POPrint }))
const Receive = lazy(async () => ({ default: (await import('./pages/Receive')).Receive }))
const GRNList = lazy(async () => ({ default: (await import('./pages/GRNList')).GRNList }))
const InvoiceList = lazy(async () => ({ default: (await import('./pages/InvoiceList')).InvoiceList }))
const InvoiceDetail = lazy(async () => ({
  default: (await import('./pages/InvoiceDetail')).InvoiceDetail,
}))
const MasterData = lazy(async () => ({ default: (await import('./pages/MasterData')).MasterData }))
const Reports = lazy(async () => ({ default: (await import('./pages/Reports')).Reports }))

function PageFallback() {
  return (
    <div style={{ minHeight: 240, display: 'grid', placeItems: 'center' }}>
      <Spin size="large" tip="Memuat halaman..." />
    </div>
  )
}

function NotFound() {
  return (
    <Result
      status="404"
      title="Halaman tidak ditemukan"
      subTitle="Tautan yang Anda buka tidak tersedia atau sudah dipindahkan."
      extra={
        <Link to="/">
          <Button type="primary">Kembali ke dashboard</Button>
        </Link>
      }
    />
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/pos/:id/print"
          element={
            <RequireAuth>
              <POPrint />
            </RequireAuth>
          }
        />

        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/prs" element={<PRList />} />
          <Route path="/prs/new" element={<PRForm />} />
          <Route path="/prs/:id" element={<PRDetail />} />
          <Route path="/prs/:id/edit" element={<PRForm />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/rfqs" element={<RFQList />} />
          <Route path="/rfqs/:id" element={<RFQDetail />} />
          <Route path="/pos" element={<POList />} />
          <Route path="/pos/:id" element={<PODetail />} />
          <Route path="/pos/:id/receive" element={<Receive />} />
          <Route path="/grns" element={<GRNList />} />
          <Route path="/invoices" element={<InvoiceList />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/master" element={<MasterData />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
