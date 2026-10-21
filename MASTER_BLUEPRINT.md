# MASTER BLUEPRINT — WEBKAS FAM SOS V2

Versi blueprint: 3.0  
Tanggal status: 21 Oktober 2026  
Bahasa aplikasi: Indonesia  
Zona waktu bisnis: Asia/Jakarta (WIB)

## 1. Identitas proyek dan batasan

- Repository aktif: https://github.com/nzxajax-del/webkas-fam-sos-v2
- Branch aktif: `main`
- Hosting target: https://webkas-fam-sos-v2.netlify.app
- Build: `npm run build`; output: `dist`; SPA fallback ada di `netlify.toml`.
- Stack: React 19, Vite 7, Supabase Auth/Postgres/Storage/Edge Functions.
- Supabase V2 aktif: project ref `lzciyzibqbujshoizlbu`; URL `https://lzciyzibqbujshoizlbu.supabase.co`; region Singapore; PostgreSQL 17.
- Proyek lama Supabase ref `jjnmaylxjzgixnrqopro` dan repo `vergilwebkas-eng/webkas-fam-sos` hanya referensi read-only. Jangan ubah, hapus, atau deploy ke proyek lama.
- Jangan impor data anggota/transaksi lama sampai skema live lama dan pemetaan aturan ke V2 benar-benar diverifikasi.
- Repository public; jangan commit password, token bootstrap plaintext, service-role key, atau rahasia. Hanya publishable/anon key boleh masuk ke frontend.

## 2. Aturan bisnis kas yang wajib dipertahankan

- Ledger transaksi adalah sumber kebenaran. Kas Lebih/saldo prabayar, NextPay, tunggakan, dan ADM adalah konsep terpisah.
- Tarif default KAS: 1.000 unit = 1K per hari. ADM default anggota baru: 10.000 unit = 10K.
- Pembayaran KAS menutup tunggakan lebih dahulu; sisa pembayaran masuk saldo prabayar. Pembayaran ADM hanya mengurangi ADM terutang.
- NextPay hanya bergerak sesuai kewajiban yang benar-benar ditutup. Pembayaran parsial tunggakan mengurangi tunggakan dan menggeser `unpaid_from` sesuai hari yang dilunasi; contoh tunggakan 5K dari tanggal 02, bayar 3K → sisa 2K dan tanggal bergeser ke 05.
- Saldo lama tidak boleh dihitung dua kali. Proses harian harus idempoten per anggota/tanggal, mencatat ledger, memeriksa celah histori, dan berhenti jika data NextPay/saldo tidak konsisten.
- Tanggal rekap mengikuti WIB. Perubahan tanggal maju harus memproses hari yang tertinggal sampai sehari sebelum tanggal rekap baru. Tanggal tidak boleh mundur otomatis.
- Total tunggakan KAS harus ditampilkan; anggota dengan tunggakan minimal 7K diprioritaskan di bagian atas. Bagian ADM Belum Lunas tetap ada; ADM lunas tidak ditampilkan sebagai belum lunas.
- Jangan tampilkan “Rekap Penerimaan Hari Ini” atau “Belum Ada Transaksi”.
- Nama yang tidak ditampilkan pada rekap: `Een_Style`, `Meppoodeajax_Style`, `Son_Style`, `Boyz_Friendshipszone`, `Memetgangster_Newyork`, `Ambon_Dosq`, `Test`.
- Ganti `Nyonya_Kayyin` menjadi `Queen_Style` sambil menjaga riwayat. `Alex_Dominator` ADM 10K sudah lunas dalam aturan data lama. Perubahan data lama ini belum diimpor ke V2.
- Perubahan tarif tidak boleh menghitung ulang kewajiban lama. V2 memakai histori tarif efektif dan menolak perubahan tarif saat anggota aktif masih punya saldo prabayar, tunggakan, atau NextPay masa depan.

## 3. Status aplikasi yang sudah diimplementasikan

### Anggota dan autentikasi
- Login username/kata sandi; email Auth internal memakai pola `username@login.webkas-fam-sos.invalid`.
- Pendaftaran anggota lewat Edge Function `member-register`; akun baru selalu role `member`, status `pending`, dan harus disetujui admin.
- Halaman status pendaftaran pending/ditolak dan dashboard anggota.
- Dashboard menampilkan saldo prabayar, tunggakan, ADM, NextPay, serta riwayat pengajuan.
- Pengajuan pembayaran KAS/ADM dan unggah bukti privat JPG/PNG/WEBP maksimal 5 MB sudah dibuat di UI, tetapi submit masih terkunci oleh safety lock.
- Bukti dibaca lewat signed URL sementara; tidak ada bucket bukti publik.

### Admin
- Bootstrap admin pertama satu kali melalui token hash di schema privat; akun admin pertama belum dibuat. Token plaintext tidak disimpan di repo.
- Antrean pendaftaran anggota: setujui/tolak melalui RPC admin.
- Antrean pembayaran: buka bukti, setujui/tolak melalui RPC settlement atomik. Persetujuan kas terkunci sampai regresi lulus; penolakan tetap tersedia.
- Manajemen anggota: edit nama tampilan dan pengecualian KAS, dengan audit log.
- Pengaturan tarif KAS dan ADM default.
- Ringkasan total tunggakan, prioritas tunggakan 7K ke atas, ADM belum lunas, NextPay, dan tanggal “Belum bayar dari”.
- Laporan 100 transaksi terbaru dan audit aktivitas admin.
- Ekspor CSV anggota, transaksi, dan audit.
- Tanggal rekap bisa dimajukan melalui RPC yang menjalankan catch-up, tetapi kontrol UI tetap disabled saat safety lock aktif.
- Koreksi saldo/ledger manual dan pembuatan akun langsung oleh admin belum tersedia; jangan mengubah saldo lewat SQL/browser tanpa ledger dan audit.

### Keamanan backend
- RLS aktif untuk tabel aplikasi di schema public; bucket `payment-proofs` privat.
- Akses lintas anggota dibatasi. Role/status tidak dapat dinaikkan lewat metadata pendaftaran atau direct table update.
- Approval pembayaran mengunci submission dan wallet serta menulis status, saldo, ledger, dan audit dalam satu transaksi.
- Fungsi pemrosesan harian hanya tersedia untuk service role atau scheduler database tepercaya; anon/authenticated tidak dapat menjalankannya.
- Security Advisor terbaru mengembalikan `lints: []`.

## 4. Status mesin tagihan harian

Mesin harian telah dibuat di database, tetapi **belum dijadwalkan dan belum boleh dianggap tervalidasi untuk uang nyata**.

- `member_profiles.dues_start_date` diinisialisasi saat anggota diaktifkan.
- `dues_rate_history` menyimpan tarif berdasarkan tanggal efektif.
- `daily_dues_log` memiliki batas unik per `(member_id, due_date)`.
- Fungsi catch-up memproses tanggal secara berurutan, mengurangi saldo prabayar untuk kewajiban yang tercakup, mencatat kekurangan sebagai tunggakan, menulis `wallet_transactions`, dan berhenti jika menemukan celah histori atau saldo/NextPay yang tidak konsisten.
- Jika tanggal sudah tercakup oleh NextPay, saldo prabayar dikonsumsi tanpa memajukan NextPay kedua kalinya.
- Pemroses default dirancang memproses sampai kemarin menurut WIB dan memajukan `report_date` ke hari ini secara atomik, dengan audit log.
- Perubahan report date tidak boleh mundur dan tidak boleh maju ke masa depan.
- Rate change ditolak jika masih ada saldo prabayar, tunggakan, NextPay masa depan, atau tanggal rekap belum catch-up.
- Fungsi harian menolak bekerja ketika `dues_settings.cash_operations_enabled=false`. Approval pembayaran juga diblokir oleh trigger database saat flag false.
- **Belum ada cron job**. Pemeriksaan extension menunjukkan `pg_cron` dan `pg_net` belum terpasang. Jangan memasang/menjadwalkan job atau membuka flag sampai tes simulasi lulus.

## 5. Status database saat pemeriksaan terakhir

- `dues_settings.report_date = 2026-10-21`
- `daily_amount = 1000`
- `adm_default = 10000`
- `cash_operations_enabled = false`
- Auth users: 0; member profiles: 0; payment submissions: 0; ledger entries: 0.
- Histori tarif awal memiliki satu baris efektif mulai 2026-10-21.
- Tidak ada data kas nyata atau anggota lama yang diimpor.
- Pemeriksaan processor sebelum safety guard terakhir dilakukan saat database kosong dan menghasilkan 0 baris; setelah guard dipasang, pemanggilan service-role saat flag false menghasilkan error yang diharapkan. Ini bukan pengganti tes regresi end-to-end.

## 6. Migrasi Supabase V2 yang diterapkan

Migration history langsung diperiksa. File dengan versi yang sama harus tetap ada di `supabase/migrations/`.

- `20261021004747_restrict_rls_auto_enable_execution`
- `20261021004923_v2_secure_foundation`
- `20261021004959_harden_private_admin_predicate`
- `20261021005020_optimize_rls_auth_checks`
- `20261021005119_add_member_login_username`
- `20261021005411_restrict_table_grants`
- `20261021005937_lock_payment_status_until_atomic_review`
- `20261021010042_atomic_payment_review`
- `20261021010100_expose_guarded_review_rpc`
- `20261021010345_secure_member_registration_review`
- `20261021011042_one_time_admin_bootstrap`
- `20261021011213_cash_operations_safety_lock`
- `20261021012233_admin_console_settings_and_member_management`
- `20261021012756_advance_next_pay_when_arrears_are_settled`
- `20261021013142_idempotent_daily_dues_processor`
- `20261021013228_guard_daily_rate_changes_with_open_obligations`
- `20261021013255_add_private_rate_history_admin_policy`
- `20261021013445_guard_daily_processor_until_enabled`
- `20261021013603_auto_advance_report_date_in_daily_processor`
- `20261021013619_guard_settings_and_report_date_wib`
- `20261021013635_allow_trusted_db_scheduler_for_daily_dues`
- `20261021013828_index_rate_history_created_by`
- `20261021014246_fix_fractional_arrears_payment_nextpay`

## 7. Build dan deployment

- GitHub Actions build untuk source frontend terbaru telah lulus pada commit `5b70dcf3f19171fd83c6c1c33b4fdda1b2aa0672`, run https://github.com/nzxajax-del/webkas-fam-sos-v2/actions/runs/39528100594.
- Dokumentasi/test-plan commits berikutnya memicu build workflow baru; status run harus dilihat sebelum menyatakan commit terbaru lulus.
- Netlify URL target: https://webkas-fam-sos-v2.netlify.app. Konektor Netlify tidak tersedia dan URL tidak dapat diverifikasi dari alat pemeriksaan ini; jangan klaim deployment terbaru sudah live tanpa bukti.
- `src/lib/supabase.js` berisi URL V2 dan publishable key publik sebagai fallback. `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` boleh menjadi override. Jangan pernah memakai service-role key pada browser.
- Edge Function `member-register` aktif versi 2; service-role key hanya dibaca dari environment function di server.

## 8. Pengujian dan release gate

Rencana lengkap: `docs/qa/kas-regression-test-plan.md` (kasus 1–48). **Belum dijalankan end-to-end pada lingkungan simulasi** karena tidak tersedia test project terisolasi di sesi ini.

Wajib lulus sebelum operasi kas dibuka:
1. Partial arrears, pelunasan penuh, saldo prabayar, NextPay dan `unpaid_from`.
2. Proses harian tanggal sama berulang, catch-up multi-hari, celah histori, anggota baru/pengecualian.
3. Rate history dan perubahan tarif; report date WIB, catch-up dan larangan tanggal mundur/masa depan.
4. Dua approval bersamaan, approval berulang, penolakan tanpa mutasi ledger.
5. RLS, akses bukti privat, role admin, bootstrap token satu kali, upload/orphan cleanup.
6. Build frontend dan verifikasi deployment Netlify.
7. Jadwalkan cron setelah extension/scheduler tersedia dan tes lulus; job harus memakai WIB 00:01 dan memproses hari sebelumnya.

## 9. Satu langkah pemilik yang tetap diperlukan

Admin pertama belum dibuat dan database belum memiliki Auth user. Pemilik harus membuka website V2 yang terbaru, mendaftar dengan username/kata sandi pilihannya, login saat status pending, lalu memakai token bootstrap satu kali yang sudah diberikan secara terpisah di percakapan penyiapan. Token tidak boleh dimasukkan ke repository atau dokumen publik. Setelah admin utama aktif, admin dapat menyetujui anggota berikutnya.

## 10. Prinsip kerja berikutnya

- Lanjutkan hanya di repo `nzxajax-del/webkas-fam-sos-v2` dan Supabase `lzciyzibqbujshoizlbu`.
- Jangan ubah sistem lama.
- Jangan impor data lama sebelum mapping selesai.
- Jangan aktifkan `cash_operations_enabled`, jangan jadwalkan cron, dan jangan menyebut proyek siap produksi sampai seluruh tes regresi lulus dan Netlify deployment terbaru terbukti aktif.


## Smoke-test update — 21 October 2026
- Transactional SQL smoke tests passed for prepaid daily deduction, arrears accrual, exempt members, same-date idempotency, fractional arrears payment settlement, gap detection without wallet mutation, and the disabled cash-operations interlock. Test fixtures were rolled back; database remains free of test members/transactions.
- The tests exposed a NextPay edge case when the arrears amount was fractional (for example 500 units) and the submitted payment was one full daily rate. The prior logic floored arrears-paid days and prepaid days separately, resulting in zero NextPay advancement. Migration `20261021014000_fix_fractional_arrears_payment_nextpay` fixes this by advancing NextPay based on full days represented by the entire KAS payment while retaining the arrears-day count for unpaid_from.
- These smoke tests do not cover concurrency, full RLS/storage, the whole UI, or Netlify deployment. Cash operations remain disabled; cron remains unscheduled.
