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
- Fungsi `member-register` membuat akun member berstatus menunggu persetujuan. Jangan berikan role admin melalui browser atau metadata pendaftaran.

## Status fitur
Sudah disiapkan:
- UI Bahasa Indonesia yang responsif untuk ponsel.
- Login username/kata sandi dan pendaftaran anggota.
- Status pending/ditolak serta dashboard baca-saja untuk saldo, tunggakan, ADM, NextPay, dan riwayat pengajuan.
- Tujuh tabel aplikasi dengan RLS dan grant database berprinsip least privilege.
- Bucket bukti pembayaran privat, dibatasi 5 MB dan JPG/PNG/WEBP.
- Security Advisor terbaru bersih (`lints: []`).

Belum diaktifkan:
- Provisioning akun admin pertama.
- Approval/rejection pembayaran yang mengubah ledger secara atomik.
- Pengiriman bukti pembayaran dari UI.
- Pemotongan kas harian otomatis dan perhitungan NextPay/tunggakan.
- Build CI dan deployment Netlify terbaru belum diverifikasi.

**Jangan gunakan untuk transaksi kas nyata dulu.** Perhitungan kas/NextPay harus dipetakan dengan lengkap dari implementasi lama dan tes regresi sebelum settlement diaktifkan.

## Dokumentasi
Baca [MASTER BLUEPRINT](./MASTER_BLUEPRINT.md) untuk seluruh keputusan, audit, batasan, dan urutan implementasi.
