# BPMN / Flowchart Proses Pengadaan

Diagram dibuat dengan **Mermaid** (versi teks, mudah di-diff dan direview) sesuai `AGENTS.md`.
Brief merekomendasikan draw.io/excalidraw dan hasil PDF; sumber mermaid tetap disertakan dan
diekspor ke `docs/export/bpmn-procurement.pdf` agar memenuhi format pengumpulan.

- Sumber diagram utama: [`diagrams/bpmn-procurement.mmd`](./diagrams/bpmn-procurement.mmd)
- Ekspor PDF: [`export/bpmn-procurement.pdf`](./export/bpmn-procurement.pdf)
- Render ulang: `uv run python scripts/render_diagrams.py` (butuh koneksi internet ke kroki.io)
  atau `npx @mermaid-js/mermaid-cli -i <file.mmd> -o <file.pdf>`.

## 1. Swimlane BPMN

Setiap lane adalah role. Garis putus-putus menandai serah terima ke sistem yang **di luar**
ruang lingkup (aplikasi gudang dan aplikasi pembayaran).

```mermaid
flowchart TB
  classDef startend fill:#111827,color:#ffffff,stroke:#111827
  classDef task fill:#eef2ff,stroke:#4f46e5,color:#1e1b4b
  classDef decision fill:#fff7ed,stroke:#ea580c,color:#7c2d12
  classDef doc fill:#ecfdf5,stroke:#059669,color:#064e3b
  classDef reject fill:#fef2f2,stroke:#dc2626,color:#7f1d1d
  classDef ext fill:#f3f4f6,stroke:#6b7280,color:#374151

  S([Kebutuhan barang/jasa muncul]):::startend

  subgraph Requester
    A1["Buat draft PR<br/>item, qty, estimasi, budget"]:::task
    A2["Submit PR"]:::task
    A3["Revisi PR"]:::task
  end

  subgraph DeptHead["Dept Head"]
    B1{"Kebutuhan & prioritas disetujui?"}:::decision
  end

  subgraph Finance["Finance / Budget"]
    C1{"Budget tersedia?"}:::decision
    C2["Commit budget<br/>saat PR disetujui penuh"]:::task
    F1["Catat invoice vendor"]:::task
    F2{"3-way match<br/>PO - GRN - Invoice"}:::decision
    F3["Tandai invoice disputed"]:::task
    F4["Verifikasi invoice"]:::task
  end

  subgraph Officer["Procurement Officer"]
    D1["Review kelengkapan & metode sourcing"]:::task
    P1["Direct purchase<br/>pilih vendor"]:::task
    P2["Terbitkan RFQ<br/>minimal 3 vendor"]:::task
    P3["Comparison matrix<br/>harga, lead time, garansi, skor"]:::task
    O1["Buat PO dari quotation pemenang"]:::task
    O2{"Approval PO<br/>sesuai matrix"}:::decision
    O3["Terbitkan PO ke vendor"]:::task
    W1["Terima & inspeksi barang/jasa<br/>GRN atau BAST"]:::doc
  end

  subgraph Manager["Procurement Manager"]
    D2{"Nilai lebih dari Rp100 jt?"}:::decision
    M1{"Pilih metode sourcing"}:::decision
    P4{"Pemenang & justifikasi disetujui?"}:::decision
  end

  subgraph Director
    D3{"Director menyetujui?"}:::decision
  end

  subgraph Vendor["Vendor (eksternal)"]
    V1["Kirim quotation"]:::task
    V2["Konfirmasi PO & kirim barang/jasa"]:::task
  end

  subgraph Warehouse["Warehouse / Receiving"]
    W2{"Sesuai PO & spesifikasi?"}:::decision
    W3["Catat discrepancy<br/>retur / kirim pengganti"]:::task
    W4["Post GRN / BAST"]:::doc
  end

  subgraph Outscope["Sistem lain (out of scope)"]
    G1["Aplikasi gudang<br/>stok & penempatan"]:::ext
    G2["Aplikasi finance<br/>pembayaran"]:::ext
  end

  R1["PR rejected + catatan"]:::reject
  E1([PR ditolak / dibatalkan]):::startend
  CL["Tutup PO & PR<br/>evaluasi vendor"]:::task
  E2([Pengadaan selesai]):::startend

  S --> A1 --> A2 --> B1
  B1 -- "Tolak" --> A3 --> A2
  B1 -- "Setuju" --> C1
  C1 -- "Tidak" --> R1 --> E1
  C1 -- "Ya" --> D1 --> D2
  D2 -- "Ya" --> D3
  D3 -- "Tidak" --> R1
  D3 -- "Ya" --> P1
  D2 -- "Tidak" --> M1
  M1 -- "≤ Rp10 jt" --> P1
  M1 -- "> Rp10 jt" --> P2 --> V1 --> P3
  P1 --> P3 --> P4
  P4 -- "Tidak" --> P3
  P4 -- "Ya" --> O1 --> O2
  O2 -- "Tidak" --> O1
  O2 -- "Ya" --> O3 --> V2 --> W1 --> W2
  W2 -- "Tidak" --> W3 --> V2
  W2 -- "Ya" --> W4 --> C2
  C2 --> F1 --> F2
  F2 -- "Tidak" --> F3 --> F1
  F2 -- "Ya" --> F4 --> G2
  W4 --> CL --> E2
  F4 --> G1
```

Catatan pembacaan:

1. **Jalur utama** (happy path): PR → approval → sourcing → PO → penerimaan → invoice → handoff.
2. **Loop revisi** ada di dua tempat: penolakan PR (kembali ke Requester) dan discrepancy barang
   (kembali ke Vendor untuk penggantian).
3. **Approval PO tidak selalu memerlukan Director**; hanya bila nilai > Rp100 jt.
4. **GRN dan BAST setara secara status**; BAST dipakai untuk pengadaan jasa.
5. **Invoice diverifikasi setelah barang diterima**, bukan setelah PO terbit.

## 2. Flowchart keputusan sourcing

```mermaid
flowchart LR
  classDef decision fill:#fff7ed,stroke:#ea580c,color:#7c2d12
  classDef task fill:#eef2ff,stroke:#4f46e5,color:#1e1b4b
  classDef ext fill:#f3f4f6,stroke:#6b7280,color:#374151

  A{"Nilai estimasi PR"}:::decision
  A -- "≤ Rp10 jt" --> B["Direct purchase<br/>1 vendor"]:::task
  A -- "Rp10 jt - Rp100 jt" --> C["RFQ<br/>min. 3 vendor"]:::task
  A -- "> Rp100 jt" --> D["Tender / RFQ<br/>min. 3 vendor + Director"]:::task
  E{"Pengecualian?<br/>single source / darurat / kontrak"}:::decision
  A -.-> E
  E -- "Ya" --> F["Penunjukan langsung<br/>justifikasi + approval Manager"]:::task
  B --> G["Tetapkan pemenang"]:::task
  C --> G
  D --> G
  F --> G
```

## 3. State machine dokumen

### 3.1 Purchase Request

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> SUBMITTED: submit
  SUBMITTED --> REJECTED: reject (level mana pun)
  REJECTED --> DRAFT: revisi
  SUBMITTED --> APPROVED: approve level terakhir
  DRAFT --> CANCELLED: cancel
  SUBMITTED --> CANCELLED: cancel
  APPROVED --> CANCELLED: cancel (release budget)
  APPROVED --> CLOSED: seluruh PO selesai
  CANCELLED --> [*]
  CLOSED --> [*]
```

### 3.2 Purchase Order

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> PENDING_APPROVAL: submit
  PENDING_APPROVAL --> DRAFT: reject
  PENDING_APPROVAL --> APPROVED: approve level terakhir
  APPROVED --> ISSUED: kirim ke vendor
  ISSUED --> PARTIALLY_RECEIVED: GRN sebagian
  ISSUED --> RECEIVED: GRN penuh
  PARTIALLY_RECEIVED --> RECEIVED: GRN pelunasan
  PARTIALLY_RECEIVED --> CLOSED: sisa dibatalkan
  RECEIVED --> CLOSED: tutup
  DRAFT --> CANCELLED: cancel
  PENDING_APPROVAL --> CANCELLED: cancel
  APPROVED --> CANCELLED: cancel
  CLOSED --> [*]
  CANCELLED --> [*]
```

### 3.3 Invoice

```mermaid
stateDiagram-v2
  [*] --> RECEIVED
  RECEIVED --> MATCHED: 3-way match lolos
  RECEIVED --> DISPUTED: match gagal
  DISPUTED --> RECEIVED: diperbaiki / invoice baru
  MATCHED --> VERIFIED: verifikasi Finance
  VERIFIED --> HANDED_OFF: diteruskan ke finance app
  HANDED_OFF --> [*]
```

## 4. Pemetaan diagram → implementasi

| Elemen diagram | Implementasi |
|---|---|
| Approval matrix | `approval_rules` + `services/approval.py` |
| Commit budget | `services/budget.py: commit()`, `spend()` |
| State & guard | `services/state_machine.py` |
| Comparison matrix | endpoint `/api/rfqs/<id>` (quotations + totals) |
| GRN partial & discrepancy | tabel `goods_receipts`, `goods_receipt_items` |
| 3-way match | `services/matching.py` |
| Audit trail | `activity_logs` ditulis di setiap transisi |
| Handoff gudang/finance | status `POSTED` dan `HANDED_OFF` (tanpa integrasi eksternal) |
