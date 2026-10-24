# Frontend — Procurement P2P

SPA React 19 + TypeScript + Vite + Ant Design + TanStack Query. Bagian ini disajikan oleh Flask
dari origin yang sama, jadi semua request API memakai path relatif `/api` dan session cookie.

Panduan lengkap (setup, akun demo, arsitektur) ada di [`../README.md`](../README.md).

## Perintah

```bash
npm ci          # install dependency (sekali)
npm run dev     # dev server di :5173, proxy /api → :5000
npm run build   # build produksi ke dist/
npm run lint    # oxlint
```

Saat `npm run dev`, jalankan juga API di terminal lain:

```bash
uv run flask --app app run --port 5000 --debug
```

## Struktur

```
src/
├─ api.ts             # fetch wrapper + ApiError
├─ auth.tsx           # AuthProvider, useAuth, RequireAuth
├─ types.ts           # tipe payload API
├─ format.ts          # format uang/tanggal/persentase (id-ID)
├─ labels.ts          # label status & kondisi
├─ components/        # AppLayout, PageHeader, StatusTag, timeline approval
└─ pages/             # satu file per halaman, di-lazy-load dari App.tsx
```

Konvensi singkat:

- Semua angka uang diformat lewat `formatMoney` (Rupiah, pemisah ribuan titik).
- Total selalu berasal dari server; UI hanya menampilkan.
- Setiap aksi transisi memakai `modal.confirm` dan meng-invalidate query terkait agar status
  dokumen langsung sinkron.
- Route di-lazy-load (`React.lazy`) supaya halaman awal tetap ringan.
