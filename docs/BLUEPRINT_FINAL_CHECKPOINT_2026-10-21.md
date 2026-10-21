# WEBKAS FAM SOS V2 — Blueprint Final & Checkpoint
Tanggal acuan: 21 Oktober 2026
Status: pra-launch; belum dinyatakan production-ready.

## 1. Identitas dan stack
- Repository: https://github.com/nzxajax-del/webkas-fam-sos-v2 (branch `main`)
- Frontend: React + Vite; build `npm run build`, output `dist`.
- Runtime website: https://webkas-fam-sos-v2.nzxajax.workers.dev/
- Backend: Supabase project ref `lzciyzibqbujshoizlbu`, region ap-southeast-1, PostgreSQL 17.
- Supabase URL: https://lzciyzibqbujshoizlbu.supabase.co
- Cloudflare Worker: `webkas-fam-sos-v2`.
- Jangan masukkan service-role key, token, password, atau secret ke source/frontend/dokumen.

## 2. Riwayat keputusan final yang masih berlaku
- Website V2 terpisah; jangan mengubah website/database lama atau mengimpor data lama tanpa instruksi.
- Bahasa Indonesia, responsif mobile, login username/password; pendaftaran anggota menunggu persetujuan admin dan menyertakan screenshot administrasi.
- Pendaftaran wajib nomor HP/WA; tidak ada konfirmasi WA. Nomor bisa diketuk untuk menelepon. Nomor di pengaturan profil bersifat opsional.
- Profil anggota di chat menampilkan data profil yang diizinkan termasuk nomor telepon, saldo dan tunggakan; tidak menampilkan riwayat pembayaran lengkap.
- Chat realtime, polling fallback hanya saat menu chat terbuka dan tab terlihat; batas pesan 2.000 karakter. Notifikasi badge untuk chat belum dibaca, pendaftaran pending, dan pengajuan pembayaran pending. Dashboard lain tidak boleh auto-refresh akibat aktivitas pembayaran.
- Tombol chat refresh ikon saja; tombol tong sampah ikon saja, khusus admin dan harus meminta konfirmasi.
- Peringkat: P1 Pemula, P2 Member, P3 Member Senior, P4 Staff, P5 Wakil, P6 OG, P7 VIP. Nama jabatan tidak dicetak pada simbol pangkat.
- P1/P2/P3 tidak bebas KAS; P4 membayar setengah tarif harian; P5/P6/P7 bebas KAS. Perubahan tarif berlaku efektif hari berikutnya.
- Penghapusan riwayat pembayaran yang selesai hanya menghapus catatan approved/rejected dan baris transaksi kredit terkait, tidak mengubah saldo/tunggakan; pengajuan pending dilindungi.
- Cleanup otomatis database: threshold 80% dari kuota 500 MiB (400 MiB), diperiksa setiap 15 menit; cooldown 24 jam. Saat threshold terlampaui, pesan chat dan riwayat pembayaran approved/rejected dapat dihapus. Pending, saldo, tunggakan, dan transaksi finansial tidak boleh ikut dihapus. Storage bucket memiliki kuota terpisah.
- Jadwal harian KAS WIB: cron `1 17 * * *` UTC = 00:01 WIB; processor harus tetap tunduk pada safety lock.
- Operasi kas harus tetap terkunci sampai seluruh uji regresi lulus; jangan mengubah `cash_operations_enabled` ke true hanya demi tes.

## 3. Fitur/struktur utama
- React/Vite frontend di `src/`; Edge Function pendaftaran di `supabase/functions/member-register/index.ts`; migrasi DB di `supabase/migrations/`.
- Supabase Auth, `member_profiles`, `member_wallets`, `wallet_transactions`, `payment_submissions`, `chat_messages`, branding/settings, RLS dan bucket Storage privat.
- Edge Function pendaftaran memvalidasi username/password/nomor HP, bukti administrasi JPG/PNG/WEBP, membuat akun pending, dan menyimpan nomor ke profil.
- Admin mengelola persetujuan anggota, pengajuan pembayaran, profil, branding, tarif, serta chat.
- Pengawasan kuota DB menampilkan penggunaan, status cleanup, jumlah pesan dan indikator kuota.

## 4. Checkpoint kode
- Branch rollback pra-perbaikan: `checkpoint/prelaunch-20261021` (baseline commit `66682faec0fcc4fe9b7fa088edb9770393572a51`).
- Branch checkpoint perbaikan chat/source: `checkpoint/chat-fix-20261021` (commit `4ac43bfc2227db12589d8f5d2519dd007bbd56b6`).
- Riwayat GitHub commits di branch `main` menjadi catatan perubahan; sebelum perubahan besar, buat branch `checkpoint/<nama>-YYYYMMDD` dari commit main yang sudah diuji.
- Rollback kode: bandingkan checkpoint, lalu revert commit yang bermasalah; jangan reset paksa atau menimpa database hanya karena rollback kode.

## 5. Checkpoint data database — batas penting
Checkpoint branch Git **tidak** mencadangkan data Supabase. Dalam koneksi kerja ini tidak tersedia operasi untuk membuat/unduh dump penuh database atau Storage secara langsung; jadi backup data eksternal belum terverifikasi dibuat.
Sebelum launch dan sebelum migrasi/perubahan berisiko:
1. Buka Supabase Dashboard project V2 → Database → Backups (jika tersedia pada plan), lalu buat/unduh backup sesuai opsi plan.
2. Jika backup restore point tidak tersedia, ekspor data tabel penting melalui SQL Editor/Table Editor ke file lokal terenkripsi: `member_profiles`, `member_wallets`, `wallet_transactions`, `payment_submissions`, pengaturan kas/branding, dan metadata yang diperlukan. Jangan ekspor kata sandi/token. Simpan salinan terpisah dari project Supabase.
3. Catat waktu, commit Git, migration version, ukuran DB, jumlah baris per tabel, dan lokasi backup. Simpan file backup di tempat privat; jangan commit data anggota/keuangan ke repo publik.
4. Sebelum restore, hentikan perubahan data, buat backup kondisi terkini, restore hanya melalui prosedur teruji, lalu cocokkan jumlah baris, saldo, tunggakan, dan transaksi. Jangan jalankan restore tanpa pemeriksaan.
5. Bucket Storage (bukti pendaftaran/pembayaran/foto profil) perlu backup terpisah; backup SQL saja tidak menyimpan file objek.

## 6. Temuan dan pekerjaan pra-launch
- Perbaikan terbaru: handler refresh chat memberi status berhasil/gagal dan menangani klik secara eksplisit; tombol clear chat bertipe button, admin-only, dan tetap meminta konfirmasi melalui RPC `admin_clear_chat_messages`.
- Source `member-register` di GitHub sebelumnya memiliki deklarasi/validasi/penulisan `phoneNumber` ganda; sudah dirapikan. Periksa build dan deployment setelah commit ini.
- Audit browser end-to-end, pengujian negatif otorisasi, akses file Storage, dan pengujian kas menyeluruh masih perlu diselesaikan.
- Pastikan build dan deployment workflow berstatus sukses serta uji tombol refresh dan clear chat pada website live memakai akun admin/anggota yang sesuai.
- Advisor sebelumnya menandai leaked-password protection belum aktif dan beberapa fungsi SECURITY DEFINER perlu uji otorisasi negatif; tinjau sebelum launch.
- Jangan mengaktifkan operasi kas otomatis sebelum menguji KAS/ADM, pembayaran parsial, NextPay, idempotensi approval, tanggal WIB, saldo/tunggakan, dan cron.

## 7. Perintah/alur kerja ringkas
```bash
git checkout main
git pull
npm ci
npm run build
```
Alur: ubah source → cek build → commit/push `main` → cek GitHub Actions build/deploy → verifikasi website live → uji login/registrasi/chat → backup database dan Storage → baru lanjut tes kas secara terkendali.
