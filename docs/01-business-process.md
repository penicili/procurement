# Proses Bisnis Pengadaan (Procurement / Procure-to-Pay)

Dokumen ini menjelaskan hasil riset proses bisnis pengadaan yang menjadi dasar perancangan
aplikasi. Ruang lingkup mengikuti brief: **dari request sampai barang/jasa diterima di gudang**.
Aplikasi gudang (stok, penempatan, opname) dan aplikasi pembayaran **di luar** ruang lingkup.

- Diagram proses: [`02-bpmn.md`](./02-bpmn.md)
- Model data: [`04-er-model.md`](./04-er-model.md)
- WBS: [`03-wbs.xlsx`](./03-wbs.xlsx) (sumber: `scripts/build_wbs.py`)

---

## 1. Ringkasan

Pengadaan (procurement) adalah rangkaian aktivitas untuk memastikan barang/jasa yang dibutuhkan
perusahaan diperoleh dengan **harga wajar, vendor yang tepat, sesuai spesifikasi, tepat waktu, dan
dapat dipertanggungjawabkan**. Rangkaian ini sering disebut **P2P (Procure-to-Pay)**. Karena
pembayaran di luar ruang lingkup, aplikasi ini menangani **P2R (Procure-to-Receive)** ditambah
**verifikasi invoice** sebagai titik serah terima ke fungsi finance.

Inti permasalahan yang diselesaikan:

| Masalah umum | Penanganan di aplikasi |
|---|---|
| Permintaan lewat chat/email, tidak terlacak | Purchase Request (PR) berstatus, bernomor, dan berjejak audit |
| Approval tidak konsisten / "bolong" | Approval matrix berbasis nominal dan role, wajib berurutan |
| Harga tidak bisa dibandingkan | RFQ + quotation + comparison matrix per vendor |
| Barang datang tidak sesuai PO | GRN per baris, partial receipt, pencatatan discrepancy |
| Invoice dibayar tanpa bukti terima | 3-way match (PO – GRN – Invoice) + toleransi |
| Budget bocor | Commitment budget saat PR disetujui, realisasi saat barang diterima |
| Sulit diaudit | Activity log immutable untuk setiap transisi status |

## 2. Ruang Lingkup

### 2.1 In scope

1. Master data pendukung: departemen, budget, vendor, item/UoM, user & role.
2. Purchase Request (PR): pembuatan, pengajuan, approval berjenjang, revisi, pembatalan.
3. Sourcing: pemilihan metode, RFQ, undangan vendor, quotation, perbandingan, penetapan pemenang.
4. Purchase Order (PO): pembuatan dari quotation pemenang, approval, penerbitan, pembatalan.
5. Penerimaan barang/jasa: GRN (Goods Receipt Note), partial receipt, inspeksi, discrepancy,
   BAST untuk jasa.
6. Verifikasi invoice: pencatatan invoice vendor, 3-way match, verifikasi, sengketa.
7. Pelaporan: status pipeline, spend per departemen/kategori, cycle time, riwayat vendor.
8. Audit trail & notifikasi in-app.

### 2.2 Out of scope (eksplisit)

| Di luar scope | Alasan / batas serah terima |
|---|---|
| Aplikasi gudang (stok, rak, opname, stock opname) | Aplikasi berhenti pada status "diterima"; data diteruskan ke sistem gudang |
| Pembayaran (payment run, transfer, jurnal) | Aplikasi berhenti pada status invoice `VERIFIED` / `HANDED_OFF` |
| Portal vendor (login vendor, submit quotation sendiri) | Quotation diinput Procurement Officer; dicatat sebagai future work |
| Akuntansi pajak (PPN/PPh), multi-currency | Harga dalam IDR, belum termasuk pajak |
| E-procurement marketplace / e-katalog pemerintah | Di luar cakupan brief |

## 3. Stakeholder & Role

Role dipisahkan agar setiap aksi punya pertanggungjawaban jelas (separation of duties).

| Role | Tanggung jawab utama | Hak akses kunci |
|---|---|---|
| **Requester** | Mengidentifikasi kebutuhan, membuat & merevisi PR | Buat/edit PR miliknya, submit, lihat status |
| **Dept Head** | Menyetujui kebutuhan dari sisi bisnis & prioritas | Approve/reject PR level 1 |
| **Finance / Budget Controller** | Memastikan budget tersedia dan commitment terkendali | Approve/reject PR (budget check), lihat laporan spend |
| **Procurement Officer** | Menjalankan sourcing, input quotation, menyusun PO & GRN | Kelola RFQ/quotation, buat PO, catat GRN, input invoice |
| **Procurement Manager** | Menyetujui metode, pemenang vendor, dan PO | Approve/reject PR/PO, tetapkan pemenang |
| **Director** | Menyetujui pengadaan bernilai besar | Approve/reject di atas threshold |
| **Warehouse / Receiving** | Menerima fisik, inspeksi, mencatat discrepancy | Post GRN, tandai retur |
| **Vendor** (eksternal, tanpa login) | Mengirim quotation, mengirim barang/jasa | Direpresentasikan sebagai data master |

RACI ringkas:

| Aktivitas | Requester | Dept Head | Finance | Proc. Officer | Proc. Manager | Director | Warehouse |
|---|---|---|---|---|---|---|---|
| Buat & submit PR | R/A | I | I | I | I | – | – |
| Approval kebutuhan | C | A/R | C | I | I | I (besar) | – |
| Cek budget & commitment | I | I | A/R | I | I | I | – |
| Tentukan metode sourcing | I | C | C | R | A | I (besar) | – |
| RFQ & evaluasi quotation | – | – | C | R | A | I | – |
| Terbitkan PO | – | I | I | R | A | I (besar) | I |
| Terima barang & inspeksi | I | – | – | C | I | – | A/R |
| Verifikasi invoice (3-way match) | – | – | A | R | C | – | C |

## 4. Proses Bisnis End-to-End

### Tahap 1 — Identifikasi kebutuhan & pembuatan PR

- **Aktor:** Requester
- **Input:** kebutuhan operasional, spesifikasi, quantity, estimasi harga, budget code, tanggal butuh.
- **Aktivitas:** memilih budget, mengisi item (dari katalog atau bebas), melampirkan spesifikasi
  (opsional), lalu submit.
- **Output:** PR berstatus `SUBMITTED` dengan nomor `PR/YYYY/MM/NNNN`.
- **Aturan:**
  - PR minimal 1 item, quantity > 0, estimasi harga ≥ 0.
  - Budget harus aktif pada tahun fiskal berjalan dan berada di departemen requester.
  - PR `DRAFT` dapat diubah; setelah `SUBMITTED` tidak dapat diubah (harus reject/revisi).

### Tahap 2 — Approval berjenjang & budget check

- **Aktor:** Dept Head → Finance → Procurement Manager → (Director bila > threshold).
- **Aktivitas:** setiap approver melihat detail PR, riwayat budget, dan dapat approve/reject
  dengan catatan. Approval berjalan **berurutan** sesuai matrix.
- **Output:** `APPROVED` atau `REJECTED`.
- **Aturan:**
  - Matrix berdasarkan **nilai estimasi PR** (lihat §5.1).
  - Reject di level mana pun menghentikan proses; PR kembali ke Requester untuk revisi
    (`REJECTED → DRAFT`).
  - Saat level terakhir approve: **budget commitment** ditambahkan sebesar nilai PR.
  - Approval harus oleh role yang sesuai; satu user tidak boleh menyetujui dua level berturut-turut
    (dijaga oleh matrix role).

### Tahap 3 — Penentuan metode sourcing

- **Aktor:** Procurement Officer (usul), Procurement Manager (setuju).
- **Aktivitas:** menilai nilai, urgensi, ketersediaan vendor, dan jenis barang.
- **Output:** metode `DIRECT`, `RFQ`, atau `TENDER`.
- **Aturan:** lihat §5.2. Penunjukan langsung wajib menyertakan justifikasi tertulis.

### Tahap 4 — RFQ, quotation, dan evaluasi

- **Aktor:** Procurement Officer, Vendor (eksternal), Procurement Manager.
- **Aktivitas:**
  1. Officer membuat RFQ dari PR yang sudah `APPROVED`, mengundang minimal 3 vendor.
  2. Quotation vendor diinput (harga satuan, lead time, garansi, masa berlaku).
  3. Sistem menyusun **comparison matrix** (total harga, lead time, garansi, skor vendor).
  4. Negosiasi dicatat; pemenang ditetapkan.
- **Output:** RFQ `AWARDED`, quotation `SELECTED`.
- **Aturan:**
  - Minimal 2 quotation masuk untuk dapat di-award (3 diundang, 2 cukup untuk dibandingkan).
  - Vendor berstatus `BLACKLISTED` tidak boleh diundang.
  - Total quotation dihitung ulang di server (tidak dipercaya dari client).

### Tahap 5 — Pembuatan & penerbitan PO

- **Aktor:** Procurement Officer, Procurement Manager, Finance, Director.
- **Aktivitas:** PO dibuat dari quotation pemenang (harga & vendor terkunci), diajukan, di-approve,
  lalu diterbitkan ke vendor. Vendor mengonfirmasi ( acknowledgement dicatat manual).
- **Output:** PO `ISSUED`, nomor `PO/YYYY/MM/NNNN`.
- **Aturan:**
  - Satu PR dapat memiliki lebih dari satu PO (pengadaan bertahap), tetapi satu quotation hanya
    boleh menjadi satu PO.
  - Total PO = total quotation pemenang; perubahan harga setelah PO terbit harus melalui revisi
    (dicatat di activity log) atau pembatalan + PO baru.
  - Approval PO memakai matrix terpisah (§5.1).

### Tahap 6 — Pengiriman & penerimaan barang

- **Aktor:** Vendor, Warehouse/Receiving.
- **Aktivitas:** vendor mengirim barang dengan surat jalan; warehouse memeriksa kuantitas, kondisi,
  dan kesesuaian spesifikasi; mencatat GRN per baris PO.
- **Output:** GRN `POSTED`, PO menjadi `PARTIALLY_RECEIVED` atau `RECEIVED`.
- **Aturan:**
  - **Partial receipt diperbolehkan**; akumulasi qty diterima tidak boleh melebihi qty PO.
  - Baris yang tidak sesuai dicatat qty diterima vs qty ditolak + alasan (rusak/salah spesifikasi/
    kurang kirim).
  - Qty ditolak tidak menambah received dan harus diselesaikan lewat pengiriman pengganti atau
    pembatalan sisa.
  - Untuk jasa, digunakan **BAST** (berita acara serah terima) dengan mekanisme status yang sama.
  - Saat GRN diposting: nilai barang diterima memindahkan **committed → spent** pada budget.

### Tahap 7 — Verifikasi invoice (3-way match)

- **Aktor:** Procurement Officer (input), Finance (verifikasi).
- **Aktivitas:** invoice vendor dicatat, lalu dicocokkan dengan PO dan GRN.
- **Output:** invoice `VERIFIED` (siap dibayar oleh aplikasi finance) atau `DISPUTED`.
- **Aturan:**
  - Nilai invoice ≤ nilai barang/jasa yang sudah diterima (GRN `POSTED`) + toleransi 2% (minimal
    Rp10.000). Invoice dicatat pada level header (nomor, tanggal, nilai total), sehingga
    pencocokan dilakukan terhadap **nilai kumulatif yang diterima**, bukan per baris qty.
  - PO harus berstatus `PARTIALLY_RECEIVED`, `RECEIVED`, atau `CLOSED`.
  - Invoice untuk barang yang belum diterima → `DISPUTED`, bukan ditolak permanen; match dapat
    dihitung ulang setelah GRN baru diposting.
  - Invoice `VERIFIED` dianggap **handoff** ke aplikasi pembayaran (out of scope).

### Tahap 8 — Penutupan & evaluasi

- **Aktivitas:** PO ditutup saat seluruh qty diterima (atau sisa dibatalkan), PR ditutup saat seluruh
  PO terkait selesai, evaluasi vendor diperbarui (ketepatan waktu, kualitas, discrepancy rate).
- **Output:** PO `CLOSED`, PR `CLOSED`, laporan spend & cycle time.

## 5. Aturan Bisnis

### 5.1 Approval matrix (nilai dalam IDR)

**Purchase Request**

| Nilai | Level 1 | Level 2 | Level 3 | Level 4 |
|---|---|---|---|---|
| ≤ 10.000.000 | Dept Head | Finance | – | – |
| 10.000.001 – 100.000.000 | Dept Head | Finance | Proc. Manager | – |
| > 100.000.000 | Dept Head | Finance | Proc. Manager | Director |

**Purchase Order**

| Nilai | Level 1 | Level 2 | Level 3 |
|---|---|---|---|
| ≤ 10.000.000 | Proc. Manager | – | – |
| 10.000.001 – 100.000.000 | Proc. Manager | Finance | – |
| > 100.000.000 | Proc. Manager | Finance | Director |

### 5.2 Metode sourcing

| Nilai | Metode default | Vendor minimal |
|---|---|---|
| ≤ 10.000.000 | Pembelian langsung (`DIRECT`) | 1 |
| 10.000.001 – 100.000.000 | RFQ (`RFQ`) | 3 diundang, 2 quotation |
| > 100.000.000 | Tender/RFQ (`TENDER`) | 3 diundang, 2 quotation |

Pengecualian **penunjukan langsung** (tetap `DIRECT` untuk nilai berapa pun) hanya bila:
barang hanya dijual oleh satu distributor resmi, keadaan darurat operasional, atau kelanjutan
kontrak. Wajib justifikasi dan persetujuan Procurement Manager.

### 5.3 Budget

```
available = allocated - committed - spent
```

- `committed` bertambah saat PR disetujui penuh. Commitment **menempel pada PR** (bukan PO), sehingga
  pembatalan PO tidak merilis commitment; commitment dirilis saat PR dibatalkan, atau saat PR
  ditutup otomatis dan masih ada sisa nilai yang belum direalisasikan.
- `spent` bertambah saat GRN diposting (nilai barang yang benar-benar diterima), dan pada saat yang
  sama `committed` berkurang sebesar nilai tersebut.
- PR tidak boleh disetujui bila `available < total estimasi`.

### 5.4 Penerimaan & discrepancy

- `qty_received` kumulatif per baris PO ≤ `qty_ordered`.
- `qty_rejected` dicatat terpisah beserta kondisi (DAMAGED, WRONG_SPEC, SHORT) dan catatan.
- PO selesai bila seluruh baris memenuhi `qty_ordered`; jika sisa dibatalkan, PO boleh `CLOSED`
  dengan catatan.

### 5.5 3-way match

Invoice dicatat pada level header (nilai total), sehingga pencocokan memakai **nilai kumulatif
barang/jasa yang sudah diterima** dari GRN `POSTED`:

```
match = po.status IN (PARTIALLY_RECEIVED, RECEIVED, CLOSED)
        AND received_value > 0
        AND amount_invoice <= received_value + max(2% x received_value, Rp10.000)
```

- Toleransi: 2% (dapat dikonfigurasi), minimal Rp 10.000 untuk menutup pembulatan.
- Selisih di luar toleransi → `DISPUTED` dengan alasan yang tercatat.
- `CLOSED` tetap boleh diverifikasi bila penerimaan sudah pernah diposting (mis. sisa qty
  dibatalkan).

### 5.6 Penomoran dokumen

Format `{TYPE}/{YYYY}/{MM}/{NNNN}`, counter per tipe per bulan, dibuat di dalam transaksi database
agar tidak duplikat. Contoh: `PR/2026/10/0003`, `PO/2026/10/0001`.

## 6. Exception & Edge Cases

| Kasus | Perilaku sistem |
|---|---|
| Approver tidak tersedia | Belum ada delegasi otomatis; dicatat sebagai future work, sementara admin dapat mengganti role user |
| Budget tidak cukup saat approval Finance | Finance reject dengan catatan; PR dapat direvisi nilainya |
| PR disetujui tetapi pengadaan dibatalkan | PR `CANCELLED` → commitment dirilis; PO `CANCELLED` saja tidak merilis commitment karena masih menempel pada PR |
| Vendor mengirim melebihi qty PO | Ditolak di level validasi GRN (tidak bisa disimpan) |
| Barang datang bertahap | GRN berkali-kali, status PO `PARTIALLY_RECEIVED` |
| Barang rusak / salah spesifikasi | Qty ditolak + alasan; PO tetap partial; pengiriman pengganti dicatat GRN baru |
| Invoice datang sebelum barang | Tidak bisa diverifikasi (`DISPUTED`/menunggu GRN) |
| Harga invoice naik > 2% | `DISPUTED`, butuh persetujuan/negosiasi ulang |
| PO dibatalkan setelah ada GRN | Tidak diizinkan; sisa qty harus ditutup lewat mekanisme penerimaan |
| Dua user approve bersamaan | Transisi status memakai guard + commit tunggal; approve kedua ditolak |

## 7. Lifecycle Status

| Dokumen | Status |
|---|---|
| PR | `DRAFT` → `SUBMITTED` → `APPROVED` / `REJECTED` / `CANCELLED` → `CLOSED` |
| RFQ | `DRAFT` → `ISSUED` → `AWARDED` / `CANCELLED` |
| PO | `DRAFT` → `PENDING_APPROVAL` → `APPROVED` → `ISSUED` → `PARTIALLY_RECEIVED` → `RECEIVED` → `CLOSED` (atau `CANCELLED`) |
| GRN | `DRAFT` → `POSTED` (atau `CANCELLED`) |
| Invoice | `RECEIVED` → `MATCHED` → `VERIFIED` → `HANDED_OFF` / `DISPUTED` |

Transisi tidak sah (mis. `DRAFT` → `ISSUED`) ditolak oleh state machine dan tidak menghasilkan
perubahan data. Setiap transisi yang sah menulis satu baris `activity_logs`.

## 8. Data & Integrasi

- **Master:** department, budget, vendor, item, user.
- **Transaksi:** PR (+items), RFQ (+vendors, quotations, quotation items), PO (+items), GRN (+items),
  invoice.
- **Kontrol:** approval rules & steps, document sequences, activity logs, notifications.
- **Handoff keluar:**
  - ke **gudang**: nomor GRN, item, qty diterima, tanggal, kondisi.
  - ke **finance**: nomor invoice, PO, GRN, nilai terverifikasi.

## 9. Interpretasi Brief & Asumsi

1. **Fitur wajib "live chat widget ↔ web app ↔ mobile app" tidak diterapkan.** Brief bagian
   Procurement hanya mensyaratkan Web App (Python) dan database; tidak ada mobile app maupun live
   chat pada spesifikasi. Kalimat tersebut identik dengan brief Helpdesk dan dianggap sisa template.
   Yang dibangun: notifikasi in-app; chat realtime/SSE disiapkan sebagai pekerjaan lanjutan.
2. **Fitur opsional AI/Computer Vision tidak diimplementasikan** pada iterasi ini; dicatat di WBS
   sebagai backlog (kandidat: OCR surat jalan untuk prefill GRN).
3. Vendor belum punya portal; quotation diinput Procurement Officer berdasarkan dokumen/email.
4. Mata uang tunggal IDR, harga belum termasuk pajak.
5. Single company / single tenant.
6. Approval bersifat sekuensial (bukan paralel) agar mudah diaudit.
7. Aplikasi gudang dan pembayaran adalah sistem terpisah (brief).

## 10. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Data master tidak lengkap saat demo | Seed data + akun demo per role |
| Approver melihat dokumen yang bukan haknya | Filter query per role & departemen di API |
| Perhitungan uang tidak konsisten | `Numeric(18,2)` + `Decimal` di seluruh layer, total dihitung server |
| Dokumen berubah setelah disetujui | Guard status + activity log immutable |
| Reviewer tidak bisa menjalankan app | README langkah setup, `Makefile`, seed deterministik |

## 11. Referensi Konsep

- Procure-to-Pay (P2P) dan 3-way match sebagai kontrol internal standar.
- Pemisahan tugas (segregation of duties) pada approval dan penerimaan barang.
- Prinsip pengadaan: transparan, adil, akuntabel, efektif-efisien (praktik umum pengadaan korporat
  dan pengadaan publik di Indonesia).
