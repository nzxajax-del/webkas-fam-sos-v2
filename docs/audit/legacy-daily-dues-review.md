# Audit read-only: legacy daily dues migration

Tanggal pemeriksaan: 21 Oktober 2026  
Sumber: repository lama `vergilwebkas-eng/webkas-fam-sos`, file `supabase/migrations/202610190001_wallets_daily_dues.sql` dan `supabase/migrations/20261019120000_harden_daily_dues_and_payment_settlement.sql`.

## Batasan

Dokumen ini adalah hasil pembacaan kode sumber saja. SQL tidak dijalankan pada proyek lama maupun V2. Nama tabel dan perilaku dari migrasi perlu dibandingkan dengan semua migrasi terdahulu dan skema live sebelum migrasi baru disusun.

## Perilaku yang tampak pada migrasi wallet/daily dues

- `member_wallets` menyimpan `balance` dan `arrears` sebagai nilai non-negatif terpisah.
- `wallet_transactions` mencatat jenis `payment_credit`, `daily_deduction`, `arrears_accrual`, atau `admin_adjustment`.
- `daily_dues_log` mencatat per anggota per tanggal, dengan batas unik `(member_id, due_date)` untuk mencegah proses tanggal yang sama tercatat dua kali.
- `process_daily_dues(date)` mengambil tarif `dues_settings.daily_amount` dengan fallback 1000, lalu memproses anggota berstatus aktif.
- Jika saldo setidaknya sebesar tarif harian, saldo berkurang sebesar tarif dan tunggakan tidak bertambah.
- Jika saldo kurang dari tarif, saldo menjadi nol dan kekurangan tarif ditambahkan ke tunggakan.
- Fungsi tersebut dilewati untuk anggota yang sudah memiliki catatan pada tanggal itu.
- Persetujuan pembayaran memicu pencatatan ke `cash_ledger` dan menambahkan nominal pembayaran ke saldo wallet.

## Risiko/perbedaan yang wajib diuji sebelum digunakan

- Logika dalam migrasi ini tampak sebagai model wallet saldo-plus dan tunggakan terpisah. Itu belum otomatis sama dengan semua aturan NextPay / “Belum bayar dari” yang diminta untuk V2.
- Pembayaran yang disetujui dalam fungsi yang dibaca menambahkan jumlah penuh ke saldo wallet; penanganan tunggakan terlebih dahulu perlu diperiksa pada migrasi hardening dan semua jalur approval agar tidak terjadi penghitungan ganda.
- Harus dipastikan siapa yang memanggil `process_daily_dues`, zona waktu tanggal, perlindungan terhadap panggilan ganda, serta apakah cron live benar-benar ada.
- RLS, role admin dari `app_metadata`, fungsi account-profile, validasi unggahan, dan kebijakan Storage harus diaudit terpisah.
- Tidak ada skema, data, atau aturan yang disalin/diterapkan ke Supabase V2 oleh pemeriksaan ini.

## Langkah berikut

1. Baca penuh migrasi hardening dan semua migrasi inti yang tersedia.
2. Bentuk tes regresi untuk saldo cukup, saldo kurang, pembayaran parsial, tunggakan lama, proses tanggal sama dua kali, dan perubahan tanggal.
3. Baru desain migrasi V2 yang baru; jangan jalankan migrasi legacy secara langsung.
