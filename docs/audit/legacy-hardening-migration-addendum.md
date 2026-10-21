# Addendum audit: hardening migrasi legacy (read-only)

Tanggal: 21 Oktober 2026  
Sumber: `supabase/migrations/20261019120000_harden_daily_dues_and_payment_settlement.sql` pada repository lama. Hanya dibaca; tidak dijalankan.

## Temuan tambahan

- Migrasi menambah `dues_start_date` pada `member_profiles`. Anggota aktif saat rollout diinisialisasi pada tanggal WIB saat migrasi; anggota yang baru diaktifkan mulai pada tanggal aktivasi. Komentar migrasi menyatakan tunggakan historis tidak boleh direkayasa ketika tanggal aktivasi tidak dapat dipastikan.
- Saat pembayaran berubah menjadi `approved`, migrasi mengunci wallet untuk mengurutkan settlement terhadap proses tagihan harian. Pembayaran dialokasikan terlebih dahulu ke tunggakan (`least(arrears, amount))); sisanya baru menambah saldo wallet. Ini sesuai prinsip pembayaran menutup tunggakan lebih dulu, setidaknya pada jalur trigger yang ditinjau.
- `process_daily_dues` versi hardening menggunakan default tanggal kemarin menurut Asia/Jakarta dan memproses hari yang hilang sejak `dues_start_date`. Ia melewati tanggal yang sudah tercatat dan menolak menjalankan catch-up bila mendeteksi celah historis tertentu pada log.
- Cron yang didefinisikan bernama `webkas-daily-dues-wib`, jadwal UTC `1 17 * * *`, yang dimaksudkan berjalan pukul 00:01 WIB dan menagih hari kalender sebelumnya.
- Fungsi pemrosesan harian dibatasi agar hanya `service_role` yang dapat mengeksekusi.

## Hal yang belum dibuktikan

- Keberadaan migrasi di GitHub tidak membuktikan bahwa migrasi tersebut berhasil diterapkan ke database live atau bahwa cron masih aktif di proyek lama.
- Ini belum mencakup semua migrasi inti, RLS, fungsi registrasi/login, Edge Functions, Storage, atau seluruh jalur perubahan status pembayaran.
- Model wallet ini tetap perlu dipetakan terhadap aturan NextPay dan “Belum bayar dari” yang diminta pengguna sebelum dipakai sebagai implementasi V2.

## Keputusan V2

Jangan menyalin atau menjalankan migrasi legacy secara langsung. Gunakan temuan ini sebagai bahan desain, lalu buat tes regresi eksplisit untuk: saldo cukup; saldo kurang; pembayaran tepat sebesar tunggakan; pembayaran lebih besar dari tunggakan; pembayaran parsial; approval berulang; tanggal harian yang sama diproses ulang; catch-up beberapa hari; dan anggota baru/aktivasi ulang.
