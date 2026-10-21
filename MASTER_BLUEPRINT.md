# MASTER BLUEPRINT — WEBKAS FAM SOS V2

Versi: 1.4 (21 Oktober 2026)

## Keputusan hosting
- Hosting statis: Netlify (menggantikan rencana Vercel).
- Repository: `nzxajax-del/webkas-fam-sos-v2`, branch `main`.
- Build command: `npm run build`.
- Publish directory: `dist`.
- `netlify.toml` menyediakan fallback SPA `/*` ke `/index.html`.
- `package.json` menetapkan Node.js minimal 22.12.0, React 19, dan Vite 7.
- Continuous deployment perlu diaktifkan dengan menghubungkan repository GitHub dari akun Netlify. Koneksi akun Netlify belum dapat dilakukan melalui konektor yang tersedia; otorisasi pemilik akun mungkin diperlukan.

## Status repository per 21 Oktober 2026
- File fondasi berhasil ditulis ke branch `main`: `netlify.toml`, `package.json`, `index.html`, `vite.config.js`, `.gitignore`, `.env.example`, `src/main.jsx`, `src/App.jsx`, `src/index.css`, dan dokumen blueprint ini.
- Aplikasi saat ini hanya berupa halaman persiapan UI. Login, autentikasi, data anggota, transaksi, pembayaran, upload bukti, serta kalkulasi kas belum diimplementasikan.
- Dependensi `@supabase/supabase-js` telah ditambahkan ke `package.json` sebagai persiapan integrasi; belum ada koneksi frontend ke database dan belum ada key yang disimpan.
- Build lokal belum berhasil dijalankan dari lingkungan pemeriksaan karena akses jaringan ke github.com gagal (DNS tidak dapat menyelesaikan host); ini bukan hasil build gagal dan bukan bukti build berhasil. Deploy Netlify juga belum diverifikasi. Jangan menyebut website sudah live sampai build/deploy dan URL benar-benar diperiksa.
- Repo sebelumnya terdeteksi public saat audit. Jangan commit informasi rahasia; pertimbangkan menjadikan repo private jika sesuai kebutuhan.

## Backend
- Proyek Supabase V2: `https://lzciyzibqbujshoizlbu.supabase.co`.
- Hasil audit sebelumnya: proyek aktif, tetapi tabel `public`, migrasi, bucket storage, dan Edge Functions belum ada.
- Fungsi `public.rls_auto_enable()` pernah mendapat peringatan advisor karena `SECURITY DEFINER` dan executable oleh `anon` serta `authenticated`. Jangan mengubahnya sebelum evaluasi terkontrol.
- Jangan mengubah atau menghapus proyek/database lama. Gunakan hanya sebagai referensi setelah akses dan perilakunya dapat diperiksa.

## Batasan keamanan dan perubahan
- Jangan memasukkan service-role key, password, token, atau secret ke frontend, commit, atau file publik.
- Variabel `VITE_*` terpapar ke browser; hanya nilai publik yang boleh ditempatkan di sana.
- Sebelum membuat skema, mulai dari inspeksi read-only, desain RLS, ownership, validasi unggahan bukti pembayaran, serta kebijakan storage.
- Jangan mengaktifkan login/transaksi nyata sebelum autentikasi, RLS, validasi server-side, dan pengujian keamanan selesai.
- Jangan mengubah kalkulasi kas, saldo, ledger, NextPay, tunggakan, atau ADM sebelum mengaudit implementasi lama dan menjalankan tes regresi.

## Aturan bisnis kas yang wajib dipertahankan
- Transaksi adalah sumber kebenaran.
- Pisahkan Kas Lebih, NextPay, dan Tunggakan.
- Pembayaran menutup tunggakan terlebih dahulu, lalu kewajiban ke depan sesuai logika lama yang sudah diaudit.
- NextPay hanya maju berdasarkan kewajiban yang benar-benar tertutup oleh pembayaran.
- Saldo lama tidak boleh dihitung dua kali.
- Aturan kerja terbaru: 1K = 1 hari; konfirmasi perilaku terhadap kode lama sebelum migrasi.
- Perubahan tanggal harus menghitung anggota jatuh tempo sebelum rekap ditampilkan, tanpa tagihan ganda.
- Jika NextPay sudah lewat tanpa pembayaran, tunggakan bertambah sesuai mekanisme lama yang diverifikasi.
- Pembayaran sebagian mengurangi tunggakan dan menggeser tanggal “Belum bayar dari” sesuai hari yang dilunasi.
- Tampilkan Total Tunggakan Kas; dahulukan tunggakan 7K ke atas.
- Jangan tampilkan “Rekap Penerimaan Hari Ini” atau “Belum Ada Transaksi”.
- Pertahankan bagian ADM Belum Lunas; ADM yang lunas tidak tampil lagi kecuali ada transaksi baru yang relevan.
- Jangan tampilkan anggota berikut dalam rekap: `Een_Style`, `Meppoodeajax_Style`, `Son_Style`, `Boyz_Friendshipszone`, `Memetgangster_Newyork`, `Ambon_Dosq`, `Test`.
- Ganti `Nyonya_Kayyin` menjadi `Queen_Style` dengan menjaga riwayat.
- `Alex_Dominator` ADM 10K ditandai lunas.

## Fitur target
- Admin utama: buat/hapus akun anggota; setujui/tolak pendaftaran; audit aksi administratif.
- Anggota: login/logout, lihat status dan kewajiban sendiri, kirim permohonan pembayaran dengan bukti gambar, lihat status pending/diterima/ditolak.
- Admin: tinjau permohonan dan bukti, setujui/tolak secara manual; perubahan ledger hanya mengikuti alur kas lama yang telah diuji.
- Tidak boleh ada akses lintas anggota; pengguna tidak boleh menetapkan role atau status aktifnya sendiri.
- UI Bahasa Indonesia, responsif untuk Android, sederhana, tanpa slogan login.
- Footer: `©Designed by Vergil D Ajax`; hilangkan `STREET OF STYLE FAMILY · 2026`.
- Hapus placeholder akun `ADM_SOS`.

## Urutan implementasi aman
1. Verifikasi repository, struktur, branch, dan build.
2. Dapatkan akses baca yang sah ke database lama untuk audit skema, fungsi, kebijakan, dan rumus kas tanpa mutasi.
3. Dokumentasikan perilaku existing dan siapkan tes regresi.
4. Buat migrasi baru untuk Supabase V2; mulai read-only lalu review sebelum mengeksekusi DDL.
5. Implementasikan Auth, role/ownership, RLS, storage, dan validasi.
6. Implementasikan alur pembayaran dan sambungkan ke ledger hanya setelah uji.
7. Hubungkan GitHub repo ini ke Netlify, build dan deploy, lalu verifikasi URL live.
8. Catat setiap keputusan, perintah, perubahan, error, perbaikan, dan hasil uji di blueprint ini.

## Catatan audit lanjutan
- Repository lama `vergilwebkas-eng/webkas-fam-sos` berhasil dibaca secara read-only melalui GitHub connector; aksesnya hanya baca (tidak ada izin push). Kode `src/App.jsx` menunjukkan nama tabel yang pernah dipakai aplikasi, termasuk `member_profiles`, `dues_settings`, `payment_submissions`, `cash_ledger`, dan `member_wallets`. Ini hanya petunjuk awal, bukan bukti skema database aktual atau aturan kas lengkap.
- File `src/lib/supabase.js` pada repository lama menggunakan `@supabase/supabase-js` dengan variabel `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
- Pemindaian read-only pada `src/App.jsx` lama menemukan pola penggunaan tabel `member_profiles`, `dues_settings`, `payment_submissions`, `cash_ledger`, dan `member_wallets`; saldo dan tunggakan lama ditampilkan sebagai kolom terpisah. Namun, source scan saja belum mengungkap seluruh trigger, RPC, RLS, dan rumus harian server-side, sehingga belum cukup untuk menyalin database atau mengaktifkan transaksi.
- Upaya mengambil beberapa jalur migration SQL yang ditebak gagal karena file tidak ditemukan. Jangan mengarang skema dari nama tabel saja.

## Catatan koneksi
- Akses ke proyek Supabase lama `jjnmaylxjzgixnrqopro` pernah ditolak oleh konektor; jangan menyimpulkan skema lama dari ingatan saja.
- Konektor Netlify belum tersedia dalam tools yang terhubung pada saat blueprint ini diperbarui. Langkah otorisasi/tautan akun kemungkinan masih memerlukan tindakan pengguna.
