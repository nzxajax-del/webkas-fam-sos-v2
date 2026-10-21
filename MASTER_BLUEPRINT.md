# MASTER BLUEPRINT — WEBKAS FAM SOS V2

Versi: 1.8 (21 Oktober 2026)

## Keputusan hosting
- Hosting statis: Netlify (menggantikan rencana Vercel).
- Repository: `nzxajax-del/webkas-fam-sos-v2`, branch `main`.
- Build command: `npm run build`; publish directory: `dist`.
- `netlify.toml` menyediakan fallback SPA `/*` ke `/index.html`.
- `package.json` menetapkan Node.js minimal 22.12.0, React 19, dan Vite 7.
- Continuous deployment harus diverifikasi di akun Netlify. Konektor Netlify tidak tersedia saat blueprint diperbarui; otorisasi pemilik akun mungkin diperlukan.

## Status repository per 21 Oktober 2026
- Fondasi Vite/React dan modul Supabase client telah disiapkan.
- Aplikasi masih halaman persiapan UI; login, autentikasi, data anggota, transaksi, pembayaran, upload bukti, dan kalkulasi kas belum diimplementasikan.
- Build lokal belum berhasil diverifikasi dari lingkungan pemeriksaan; jangan menyebut build atau deploy berhasil sampai ada hasil nyata.
- Repo terdeteksi public pada audit sebelumnya. Jangan commit rahasia; pertimbangkan visibilitas private jika sesuai.
- Workflow GitHub Actions `.github/workflows/build.yml` diperbaiki pada commit `e55cf84553cf6d37324f98826b7205105d83a91b`: cache npm dihapus karena belum ada lockfile. Workflow memakai Node 22, `npm install`, dan `npm run build`. Hasil run CI belum diverifikasi.

## Backend Supabase V2
- Proyek terpisah: `https://lzciyzibqbujshoizlbu.supabase.co`; status proyek ACTIVE_HEALTHY, PostgreSQL 17, region Singapore.
- Awal audit: belum ada tabel aplikasi atau migrasi.
- Fungsi `public.rls_auto_enable()` didefinisikan sebagai event-trigger function SECURITY DEFINER dengan `search_path=pg_catalog`. Event trigger `ensure_rls` berjalan pada `ddl_command_end` untuk pembuatan tabel. Fungsinya mengaktifkan RLS pada tabel baru di schema public.
- **Perbaikan keamanan telah diterapkan dan diverifikasi:** migrasi `restrict_rls_auto_enable_execution` mencabut EXECUTE dari PUBLIC, anon, authenticated, dan service_role; ACL yang tersisa hanya pemilik `postgres`. Event trigger tetap aktif sebagai mekanisme internal database. Security Advisor setelah perubahan mengembalikan `lints: []`.
- Migrasi keamanan tercatat di Supabase dengan versi `20261021004747`. Belum ada tabel aplikasi.
- Jangan memasang service-role key di frontend, GitHub, atau Netlify environment yang dibundel ke browser. Hanya publishable/anon key yang boleh digunakan di frontend.
- Proyek/database lama tidak boleh diubah atau dihapus. Akses ke database lama belum tersedia; gunakan kode lama hanya sebagai referensi sampai backend lama dapat diaudit.

## Batasan keamanan dan perubahan
- Jangan masukkan service-role key, password, token, atau secret ke frontend, commit, atau file publik.
- Semua variabel `VITE_*` terpapar ke browser; hanya nilai publik boleh ditempatkan di sana.
- Terapkan autentikasi, role/ownership, RLS, validasi server-side, storage privat, dan pengujian sebelum mengaktifkan transaksi nyata.
- Jangan mengubah saldo, ledger, NextPay, tunggakan, atau ADM sebelum perilaku lama dipetakan dan tes regresi dijalankan.

## Aturan bisnis kas wajib dipertahankan
- Transaksi adalah sumber kebenaran.
- Pisahkan Kas Lebih, NextPay, dan Tunggakan.
- Pembayaran menutup tunggakan terlebih dahulu, lalu kewajiban ke depan sesuai logika lama yang telah diverifikasi.
- NextPay hanya maju berdasarkan kewajiban yang benar-benar tertutup.
- Saldo lama tidak boleh dihitung dua kali.
- Aturan kerja terbaru: 1K = 1 hari; verifikasi terhadap kode lama sebelum migrasi.
- Perubahan tanggal harus menghitung anggota jatuh tempo tanpa tagihan ganda.
- Jika NextPay lewat tanpa pembayaran, tunggakan bertambah sesuai mekanisme yang diverifikasi.
- Pembayaran sebagian mengurangi tunggakan dan menggeser “Belum bayar dari” sesuai hari yang dilunasi.
- Tampilkan Total Tunggakan Kas; dahulukan tunggakan 7K ke atas.
- Jangan tampilkan “Rekap Penerimaan Hari Ini” atau “Belum Ada Transaksi”.
- Pertahankan bagian ADM Belum Lunas; ADM yang lunas tidak tampil lagi kecuali ada transaksi baru yang relevan.
- Jangan tampilkan anggota berikut di rekap: `Een_Style`, `Meppoodeajax_Style`, `Son_Style`, `Boyz_Friendshipszone`, `Memetgangster_Newyork`, `Ambon_Dosq`, `Test`.
- Ganti `Nyonya_Kayyin` menjadi `Queen_Style` dengan menjaga riwayat.
- `Alex_Dominator` ADM 10K ditandai lunas.

## Fitur target
- Admin utama: buat/hapus akun anggota; setujui/tolak pendaftaran; audit aksi administratif.
- Anggota: login/logout, lihat status sendiri, ajukan pembayaran dengan bukti, lihat status pending/diterima/ditolak.
- Admin: tinjau bukti dan setujui/tolak; ledger hanya berubah lewat alur yang telah diuji.
- Tidak ada akses lintas anggota; pengguna tidak boleh menetapkan role atau status aktif sendiri.
- UI Bahasa Indonesia, responsif untuk Android, tanpa slogan login.
- Footer: `©Designed by Vergil D Ajax`; hilangkan `STREET OF STYLE FAMILY · 2026`.
- Hapus placeholder `ADM_SOS`.

## Ketentuan pemisahan proyek Supabase
- Supabase V2 ref `lzciyzibqbujshoizlbu` adalah proyek baru terpisah.
- Supabase lama ref `jjnmaylxjzgixnrqopro` hanya referensi; jangan ubah/hapus dan jangan jadikan target V2.
- Jangan meminta pengguna mengulangi ref/URL lama yang sudah tercatat. Jika akses lama ditolak, tandai bagian yang belum diverifikasi dan lanjutkan dengan sumber kode yang dapat dibaca.

## Audit kode lama — batas pengetahuan
- Repository lama `vergilwebkas-eng/webkas-fam-sos` berhasil dibaca sebagian secara read-only. Source menyebut tabel `member_profiles`, `dues_settings`, `payment_submissions`, `cash_ledger`, dan `member_wallets`; ini petunjuk, bukan bukti skema aktual.
- Migration lama yang dapat dibaca menunjukkan `member_wallets.balance` dan `arrears` terpisah; `wallet_transactions` menjadi jejak transaksi; `daily_dues_log` dengan unique `(member_id,due_date)` mencegah pemrosesan ganda; pembayaran dialokasikan ke tunggakan dahulu lalu saldo wallet; job harian ditujukan pada 00:01 WIB untuk memproses hari sebelumnya.
- Kode/migrasi lama tidak cukup untuk membuktikan seluruh skema live, RLS, auth, trigger, dan semua jalur approval. Akses ke Supabase lama ditolak oleh konektor. Jangan menyalin schema atau mengarang rumus yang belum terbukti.
- Ada regression plan di `docs/qa/kas-regression-test-plan.md`; wajib dijalankan sebelum perubahan kas dianggap selesai.

## Urutan implementasi
1. Verifikasi repo, workflow, dan build.
2. Audit source dan backend lama yang bisa diakses tanpa mutasi.
3. Desain schema V2, ownership, RLS, auth, dan storage.
4. Buat migrasi V2 dan validasi security advisor.
5. Implementasikan Auth, role/ownership, storage, dan validasi.
6. Implementasikan alur pembayaran dan ledger setelah pemetaan aturan serta tes.
7. Verifikasi build, Netlify deployment, dan URL live.
8. Catat semua keputusan, perubahan, error, perbaikan, dan hasil uji di blueprint.

## Status paling baru
- Perbaikan ACL `rls_auto_enable()` berhasil diterapkan dan diverifikasi; Security Advisor kini bersih.
- Workflow build sudah diperbaiki untuk menghindari ketergantungan cache pada lockfile yang belum ada; hasil run CI masih belum diverifikasi.
- Belum ada schema aplikasi, auth, bucket bukti, atau transaksi aktif. Belum ada klaim bahwa build/deploy sudah lolos.
