import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Space, Spin } from 'antd'
import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons'
import { api } from '../api'
import { formatDate, formatMoney } from '../format'
import { statusLabel } from '../labels'
import type { PODetail as PODetailData } from '../types'

export function POPrint() {
  const { id } = useParams()
  const poId = Number(id)
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['po', poId],
    queryFn: () => api.get<PODetailData>(`/pos/${poId}`),
  })

  if (isLoading || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" tip="Memuat dokumen PO..." />
      </div>
    )
  }

  const { po } = data
  const items = po.items ?? []

  return (
    <div style={{ background: '#eef0f5', minHeight: '100vh', paddingBottom: 40 }}>
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 24px',
          background: '#fff',
          borderBottom: '1px solid #e6e8ef',
        }}
      >
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/pos/${poId}`)}>
            Kembali ke PO
          </Button>
          <span className="muted">Pratinjau dokumen · status {statusLabel(po.status)}</span>
        </Space>
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
          Cetak / Simpan PDF
        </Button>
      </div>

      {['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(po.status) && (
        <div className="no-print" style={{ maxWidth: '210mm', margin: '16px auto 0' }}>
          <Alert
            type="warning"
            showIcon
            message="PO belum diterbitkan"
            description="Dokumen ini adalah pratinjau. PO resmi sebaiknya dicetak setelah status ISSUED."
          />
        </div>
      )}
      {po.status === 'CANCELLED' && (
        <div className="no-print" style={{ maxWidth: '210mm', margin: '16px auto 0' }}>
          <Alert
            type="error"
            showIcon
            message="PO dibatalkan"
            description="Dokumen ini tidak lagi berlaku dan tidak boleh dipakai sebagai dasar penerimaan barang."
          />
        </div>
      )}

      <div className="print-sheet">
        <div className="print-head">
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.4 }}>PT NUSANTARA DEMO</div>
            <div style={{ fontSize: 12 }}>Jl. Jenderal Sudirman No. 1, Jakarta 10220</div>
            <div style={{ fontSize: 12 }}>procurement@nusantara.test · (021) 555-0100</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>PURCHASE ORDER</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{po.number}</div>
            <div style={{ fontSize: 12 }}>Tanggal: {formatDate(po.created_at)}</div>
            <div style={{ fontSize: 12 }}>Status: {statusLabel(po.status)}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, fontSize: 12 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Kepada:</div>
            <div style={{ fontWeight: 600 }}>{po.vendor?.name}</div>
            <div>{po.vendor?.address ?? '-'}</div>
            <div>UP: {po.vendor?.contact_name ?? '-'}</div>
            <div>{po.vendor?.contact_phone ?? '-'}</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Dikirim ke:</div>
            <div>Gudang Pusat</div>
            <div style={{ whiteSpace: 'pre-line' }}>{po.delivery_address ?? '-'}</div>
            <div>Jadwal kirim: {formatDate(po.delivery_date)}</div>
            <div>Ref. PR: {po.pr_number}</div>
          </div>
        </div>

        <table className="print-table" style={{ marginTop: 20 }}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>No</th>
              <th>Deskripsi</th>
              <th style={{ width: 70, textAlign: 'right' }}>Qty</th>
              <th style={{ width: 55 }}>UoM</th>
              <th style={{ width: 110, textAlign: 'right' }}>Harga</th>
              <th style={{ width: 130, textAlign: 'right' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id}>
                <td>{index + 1}</td>
                <td>{item.description}</td>
                <td style={{ textAlign: 'right' }}>{item.qty.toLocaleString('id-ID')}</td>
                <td>{item.uom}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(item.unit_price)}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(item.subtotal)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>
                TOTAL
              </td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(po.total)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 16, fontSize: 12 }}>
          <div style={{ fontWeight: 700 }}>Syarat &amp; kondisi</div>
          <div style={{ whiteSpace: 'pre-line' }}>{po.terms ?? 'Pembayaran sesuai kesepakatan.'}</div>
          {po.notes && (
            <>
              <div style={{ fontWeight: 700, marginTop: 8 }}>Catatan</div>
              <div style={{ whiteSpace: 'pre-line' }}>{po.notes}</div>
            </>
          )}
        </div>

        <div className="print-sign">
          <div>
            <div>Dibuat oleh</div>
            <div className="line">Procurement Officer</div>
          </div>
          <div>
            <div>Disetujui oleh</div>
            <div className="line">Procurement Manager</div>
          </div>
          <div>
            <div>Diterima vendor</div>
            <div className="line">{po.vendor?.name}</div>
          </div>
        </div>

        <div style={{ marginTop: 32, fontSize: 10, color: '#6b7280' }}>
          Dokumen ini dihasilkan oleh aplikasi Procurement P2P. Penerimaan barang dicatat melalui GRN, dan
          pembayaran diproses di aplikasi finance (di luar ruang lingkup).
        </div>
      </div>
    </div>
  )
}
