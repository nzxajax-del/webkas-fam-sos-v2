# WEBKAS FAM SOS V2

Website kas baru Fam SOS dengan hosting Netlify, frontend React/Vite, dan backend Supabase V2 terpisah.

## Hosting Netlify
- Build command: `npm run build`
- Publish directory: `dist`
- Konfigurasi SPA ada di `netlify.toml`.
- Repository: [nzxajax-del/webkas-fam-sos-v2](https://github.com/nzxajax-del/webkas-fam-sos-v2), branch `main`.
- Deployment otomatis memerlukan repository ini terhubung ke situs Netlify.

## Supabase V2
- Project ref: `lzciyzibqbujshoizlbu`
- URL: `https://lzciyzibqbujshoizlbu.supabase.co`
- Frontend memakai public publishable key fallback di `src/lib/supabase.js`; `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` dapat digunakan untuk override.
- Publishable key memang dirancang untuk browser. **Jangan pernah** memasukkan service-role key, password, atau secret ke frontend, GitHub, atau variabel `VITE_*`.
- Migrasi database berada di `supabase/migrations/`; source Edge Function pendaftaran berada di `supabase/functions/member-register/index.ts`.
- Fungsi `member-register` membuat akun member berstatus menunggu persetujuan. Role admin tidak dapat dipilih saat pendaftaran.

## Fitur yang sudah diimplementasikan
- UI Bahasa Indonesia responsif untuk ponsel.
- Login username/kata sandi dan pendaftaran anggota.
- Status pending/ditolak dan antrean persetujuan pendaftaran untuk admin.
- Dashboard anggota untuk saldo, tunggakan, ADM, NextPay, dan riwayat pengajuan.
- Pengajuan KAS/ADM dengan bukti privat JPG/PNG/WEBP maksimal 5 MB.
- Antrean bukti pembayaran untuk admin, URL bukti sementara, serta RPC keputusan admin.
- Persetujuan KAS menggunakan satu transaksi database: bayar tunggakan terlebih dahulu, sisa masuk saldo ke depan, transaksi dan audit log ditulis bersama.
- Pembayaran ADM hanya mengurangi sisa ADM; status lunas tidak boleh melampaui nilai ADM yang tersisa.
- RLS aktif dan grant tabel dibatasi. Security Advisor terakhir menghasilkan `lints: []`.
- Pengguna tidak dapat mengubah status pembayaran, status pendaftaran, role, ledger, atau daily dues log secara langsung lewat tabel.

## Batasan yang masih harus dituntaskan
- Belum ada akun admin pertama; database saat ini belum memiliki pengguna Auth. Pemilik harus mendaftar dengan username/kata sandi pilihannya, login, lalu memasukkan kode bootstrap satu kali yang diberikan terpisah. Kode tidak disimpan di repository dan hanya dapat digunakan sekali.
- Kalkulasi kas harian otomatis dan cron belum diaktifkan. NextPay/tunggakan harus melewati regression tests sebelum dijalankan harian.
- GitHub Actions build berhasil untuk commit kode `89965a907a3b22bbe3d667da44f3769c06f17576`; pemeriksaan untuk commit dokumentasi sesudahnya masih berjalan. Deployment Netlify terbaru tetap belum diverifikasi. Jangan menyatakan aplikasi lolos build atau live sudah diperbarui tanpa hasil nyata.
- Settlement RPC telah diterapkan, tetapi perlu uji terisolasi terhadap skenario tunggakan, pembayaran parsial, ADM, dan pengajuan ganda sebelum digunakan untuk kas nyata.

**Jangan gunakan untuk transaksi kas nyata dulu** sampai akun admin aman tersedia, build/deploy diverifikasi, dan tes regresi settlement serta daily dues lulus.

## Dokumentasi
- [MASTER BLUEPRINT](./MASTER_BLUEPRINT.md)
- [Audit logika kas lama](./docs/audit/legacy-daily-dues-review.md)
- [Tambahan audit hardening lama](./docs/audit/legacy-hardening-migration-addendum.md)
- [Rencana tes regresi](./docs/qa/kas-regression-test-plan.md)
