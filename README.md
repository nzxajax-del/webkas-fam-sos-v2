# WEBKAS FAM SOS V2

Fondasi website kas baru untuk Fam SOS.

## Hosting Netlify
- Build command: `npm run build`
- Publish directory: `dist`
- Konfigurasi ada di `netlify.toml`.
- Hubungkan repository GitHub ini ke Netlify agar deployment otomatis mengikuti branch `main`.

## Environment variables
Set di Netlify Site configuration → Environment variables:
- `VITE_SUPABASE_URL=https://lzciyzibqbujshoizlbu.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = publishable/anon key dari proyek Supabase V2.

Gunakan hanya key publishable/anon di frontend. Jangan pernah memasukkan service-role key, secret, password, atau token administratif ke repository atau variabel `VITE_*`.

## Status aplikasi
Saat ini UI masih mode persiapan. Client Supabase baru disiapkan; login, skema database, RLS, transaksi, pembayaran, upload bukti, dan kalkulasi kas belum aktif. Jangan gunakan untuk transaksi nyata sebelum keamanan backend dan tes regresi selesai.

## Referensi
Lihat [MASTER_BLUEPRINT.md](./MASTER_BLUEPRINT.md) untuk batasan keamanan, aturan bisnis kas, dan urutan implementasi.
