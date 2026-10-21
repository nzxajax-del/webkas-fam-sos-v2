export default function App() {
  return (
    <main className="page-shell">
      <section className="panel" aria-labelledby="app-title">
        <div className="eyebrow"><span className="status-dot" /> VERSI 2 · PERSIAPAN SISTEM</div>
        <h1 id="app-title">WEBKAS <span>FAM SOS</span></h1>
        <p className="intro">Fondasi website kas baru sedang disiapkan.</p>
        <div className="notice">
          <strong>Mode persiapan</strong>
          <p>Hosting Netlify disiapkan melalui repository GitHub. Fitur login, anggota, transaksi, pembayaran, dan perhitungan kas belum diaktifkan. Rumus kas lama tidak akan diganti sebelum implementasi lama diaudit dan diuji.</p>
        </div>
        <footer>©Designed by Vergil D Ajax</footer>
      </section>
    </main>
  );
}
