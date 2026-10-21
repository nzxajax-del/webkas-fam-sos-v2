# MASTER BLUEPRINT — WEBKAS FAM SOS V2

Versi: 1.1 (21 Oktober 2026)

## Keputusan hosting
- Hosting statis: Netlify (menggantikan rencana Vercel).
- Repository: `nzxajax-del/webkas-fam-sos-v2`, branch `main`.
- Build command: `npm run build`.
- Publish directory: `dist`.
- `netlify.toml` menyediakan fallback SPA `/*` ke `/index.html`.
- Continuous deployment diaktifkan dengan menghubungkan repository GitHub dari akun Netlify. Koneksi akun Netlify belum dapat dilakukan dari konektor yang tersedia; otorisasi pemilik akun mungkin diperlukan.

## Backend
- Proyek Supabase V2: `https://lzciyzibqbujshoizlbu.supabase.co`.
- Hasil audit sebelumnya: proyek aktif, tetapi tabel `public`, migrasi, bucket storage, dan Edge Functions belum ada.
- Fungsi `public.rls_auto_enable()` pernah mendapat peringatan advisor karena `SECURITY DEFINER` dan executable oleh `anon` serta `authenticated`. Jangan mengubahnya sebelum evaluasi terkontrol.
- Jangan mengubah atau menghapus proyek/database lama. Gunakan hanya sebagai referensi setelah akses dan perilakunya dapat diperiksa.

## Batasan keamanan dan perubahan
- Jangan memasukkan service-role key, password, token, atau secret ke frontend, commit, atau file publik.
- `VITE_*` variables terpapar ke browser; hanya nilai publik yang boleh ditempatkan di sana.
- Sebelum membuat skema, mulai dari inspeksi read-only, desain RLS, ownership, validasi unggahan bukti pembayaran, serta kebijakan storage.
- Jangan mengaktifkan login/transaksi nyata sebelum auth, RLS, dan kebijakan database diuji.
- Jangan mengubah logika kas, saldo, ledger, NextPay, tunggakan, atau ADM sebelum audit implementasi lama dan regression tests.

## Aturan KAS yang wajib dipertahankan setelah audit kode lama
- Transaksi adalah sumber kebenaran.
- Pisahkan Kas Lebih, NextPay, dan Tunggakan.
- Pembayaran menyelesaikan tunggakan terlebih dahulu lalu kewajiban ke depan mengikuti logika lama.
- NextPay hanya maju saat kewajiban benar-benar tertutup pembayaran.
- Hindari penghitungan saldo lama dua kali.
- Patokan yang diminta: 1K = 1 hari; tanggal laporan memicu perhitungan anggota jatuh tempo tanpa double-charge.
- Pembayaran sebagian mengurangi tunggakan dan memajukan tanggal “Belum bayar dari” sesuai hari yang terbayar.
- Tampilkan Total Tunggakan Kas dan prioritaskan tunggakan 7K ke atas.
- Jangan tampilkan “Rekap Penerimaan Hari Ini” atau “Belum Ada Transaksi”.
- Bagian ADM Belum Lunas tetap ada; ADM yang lunas tidak ditampilkan lagi kecuali ada transaksi baru yang relevan.
- Jangan tampilkan anggota berikut dalam rekap: `Een_Style`, `Meppoodeajax_Style`, `Son_Style`, `Boyz_Friendshipszone`, `Memetgangster_Newyork`, `Ambon_Dosq`, `Test`.
- Ubah `Nyonya_Kayyin` menjadi `Queen_Style` dengan riwayat tetap terjaga.
- `Alex_Dominator` ADM 10K ditandai lunas.
- Data historis contoh bukan data live; verifikasi sumber sebelum migrasi.

## Fitur tujuan
- Login anggota dan admin menggunakan auth yang aman; anggota hanya dapat melihat datanya sendiri.
- Anggota dapat mengirim permintaan pembayaran beserta bukti gambar dan melihat status pending/diterima/ditolak.
- Admin dapat meninjau bukti, menerima/menolak, dan setiap perubahan ledger mengikuti aturan kas lama yang sudah diaudit.
- Admin utama dapat membuat/menghapus akun anggota serta menyetujui/menolak registrasi. Pengguna tidak boleh menetapkan role atau status aktif sendiri.
- UI bahasa Indonesia, responsif untuk Android, login sederhana tanpa slogan.
- Hapus placeholder akun `ADM_SOS`.
- Footer: `©Designed by Vergil D Ajax`; hapus `STREET OF STYLE FAMILY · 2026`.
- Nama/link yang diinginkan: `WebsiteKasVergilDAjax` (ketersediaan domain belum diverifikasi).

## Status saat blueprint ini ditulis
- Repository sebelumnya hanya berisi README; scaffold Vite/React dan konfigurasi Netlify sedang ditambahkan.
- Ini masih layar persiapan, bukan aplikasi kas yang siap dipakai.
- Build dan deployment harus diverifikasi sebelum menyatakan sukses.
- Langkah deployment yang masih memerlukan pemilik akun: login ke Netlify, otorisasi GitHub, pilih repository `nzxajax-del/webkas-fam-sos-v2`, branch `main`. Setelah terhubung, konfigurasi build berasal dari `netlify.toml`.
