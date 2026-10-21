import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./lib/supabase.js";

const money = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value || 0) / 1000) + "K";
const date = (value) => value ? new Date(value + "T00:00:00+07:00").toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }) : "Belum ditetapkan";
const authEmail = (username) => username.trim().toLowerCase() + "@login.webkas-fam-sos.invalid";

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [settings, setSettings] = useState(null);
  const [payments, setPayments] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [paymentType, setPaymentType] = useState("kas");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [proofFile, setProofFile] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session);
    }).finally(() => { if (alive) setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null); setWallet(null); setSettings(null); setPayments([]); setPendingPayments([]);
      }
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const [profileRes, walletRes, settingsRes, paymentsRes] = await Promise.all([
        supabase.from("member_profiles").select("id,display_name,login_username,role,status").eq("id", session.user.id).maybeSingle(),
        supabase.from("member_wallets").select("balance,arrears,next_pay,unpaid_from,adm_due,exempt_kas").eq("member_id", session.user.id).maybeSingle(),
        supabase.from("dues_settings").select("report_date,daily_amount,adm_default").eq("id", 1).maybeSingle(),
        supabase.from("payment_submissions").select("id,amount,status,created_at,review_note").eq("member_id", session.user.id).order("created_at", { ascending: false }).limit(10),
      ]);
      if (!alive) return;
      const firstError = [profileRes, walletRes, settingsRes, paymentsRes].find((r) => r.error);
      if (firstError) setError("Data akun belum dapat dimuat. " + firstError.error.message);
      let pendingRows = [];
      if (profileRes.data?.role === "admin" && profileRes.data?.status === "active") {
        const pendingRes = await supabase.from("payment_submissions")
          .select("id,member_id,amount,payment_type,proof_path,status,created_at,member_profiles(display_name,login_username)")
          .eq("status", "pending").order("created_at", { ascending: true }).limit(100);
        if (pendingRes.error) setError("Antrean pembayaran tidak dapat dimuat. " + pendingRes.error.message);
        pendingRows = pendingRes.data || [];
      }
      if (!alive) return;
      setProfile(profileRes.data || null);
      setWallet(walletRes.data || null);
      setSettings(settingsRes.data || null);
      setPayments(paymentsRes.data || []);
      setPendingPayments(pendingRows);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [session?.user?.id]);

  async function signIn(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(normalized)) {
      setError("Username harus 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung.");
      setBusy(false); return;
    }
    const { error: authError } = await supabase.auth.signInWithPassword({ email: authEmail(normalized), password });
    if (authError) setError("Login gagal. Periksa username dan kata sandi.");
    setBusy(false);
  }

  async function register(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(normalized)) {
      setError("Username harus 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung.");
      setBusy(false); return;
    }
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("member-register", {
        body: { displayName: displayName.trim(), username: normalized, password },
      });
      if (invokeError) throw new Error(data?.error || "Layanan pendaftaran belum dapat dihubungi.");
      if (data?.error) throw new Error(data.error);
      setMode("login"); setPassword("");
      setMessage(data?.message || "Pendaftaran terkirim. Akun menunggu persetujuan admin utama.");
    } catch (err) {
      setError(err.message || "Pendaftaran gagal. Coba lagi.");
    } finally { setBusy(false); }
  }

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    setSession(null); setProfile(null); setWallet(null); setSettings(null); setPayments([]);
    setPassword(""); setBusy(false);
  }

  if (!supabaseConfigured) {
    return <main className="page-shell"><section className="panel"><Brand /><h1>Hampir siap.</h1><p className="intro">Koneksi Supabase belum dikonfigurasi di environment Netlify.</p><div className="notice"><strong>Konfigurasi yang dibutuhkan</strong><p>Tambahkan <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> di pengaturan environment Netlify, lalu deploy ulang. Gunakan hanya publishable/anon key; jangan pernah menaruh service-role key di website.</p></div><footer>©Designed by Vergil D Ajax</footer></section></main>;
  }

  if (loading) return <main className="page-shell"><section className="panel"><Brand /><p className="intro">Memuat akun dengan aman…</p></section></main>;

  if (session && profile) {
    const isAdmin = profile.role === "admin" && profile.status === "active";
    if (profile.status === "pending" || profile.status === "rejected") {
      return <main className="page-shell"><section className="panel"><Brand /><div className="eyebrow"><span className={profile.status === "pending" ? "status-dot" : "status-dot red"} /> STATUS PENDAFTARAN</div><h1>{profile.status === "pending" ? "Menunggu persetujuan" : "Pendaftaran ditolak"}</h1><p className="intro">Halo, {profile.display_name}. {profile.status === "pending" ? "Admin utama perlu menyetujui akun sebelum fitur anggota dapat digunakan." : "Akun ini belum mendapat akses. Hubungi admin utama jika perlu peninjauan."}</p><div className="notice"><strong>Username</strong><p>{profile.login_username}</p><strong>Status</strong><p>{profile.status === "pending" ? "Menunggu persetujuan" : "Ditolak"}</p></div><button className="secondary full" onClick={signOut} disabled={busy}>Keluar</button><footer>©Designed by Vergil D Ajax</footer></section></main>;
    }
    if (!wallet) return <main className="page-shell"><section className="panel"><Brand /><h1>Akun belum siap</h1><p className="intro">Profil berhasil ditemukan, tetapi dompet kas belum tersedia. Jangan lakukan pembayaran sampai admin menyelesaikan penyiapan akun.</p><button className="secondary full" onClick={signOut}>Keluar</button><footer>©Designed by Vergil D Ajax</footer></section></main>;
    return <main className="dashboard-shell"><header className="dashboard-header"><Brand compact /><button className="secondary" onClick={signOut} disabled={busy}>Keluar ↗</button></header><section className="welcome-panel"><div className="eyebrow">AKUN {isAdmin ? "ADMIN" : "ANGGOTA"} · AKTIF</div><h1>Halo, <span>{profile.display_name}</span></h1><p>Username: <strong>{profile.login_username}</strong></p><p className="muted">Tanggal rekap: {date(settings?.report_date)}</p></section>{isAdmin ? <section className="notice"><strong>Panel admin sedang disiapkan</strong><p>Database dan akses admin sudah tersedia. Persetujuan pembayaran belum diaktifkan karena mekanisme NextPay dan settlement harus diselesaikan serta diuji terlebih dahulu.</p></section> : <><div className="stats-grid"><article className="stat"><span>Kas Lebih / Saldo Dibayar ke Depan</span><strong>{money(wallet.balance)}</strong><small>Saldo tersedia</small></article><article className="stat"><span>Tunggakan Kas</span><strong className={Number(wallet.arrears) > 0 ? "amount-danger" : ""}>{money(wallet.arrears)}</strong><small>{Number(wallet.arrears) > 0 ? "Belum tertutup" : "Tidak ada tunggakan tercatat"}</small></article><article className="stat"><span>ADM Belum Lunas</span><strong>{money(wallet.adm_due)}</strong><small>{Number(wallet.adm_due) > 0 ? "Menunggu pelunasan" : "Lunas"}</small></article><article className="stat"><span>NextPay</span><strong className="date-value">{date(wallet.next_pay)}</strong><small>{wallet.exempt_kas ? "Pengecualian kas aktif" : "Tanggal pembayaran berikutnya"}</small></article></div><section className="panel history-panel"><div className="section-head"><div><div className="eyebrow">RIWAYAT PENGAJUAN</div><h2>Pembayaran saya</h2></div><span className="pill">{payments.length} terbaru</span></div>{payments.length ? <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Nominal</th><th>Status</th><th>Catatan admin</th></tr></thead><tbody>{payments.map((p) => <tr key={p.id}><td>{date(p.created_at.slice(0,10))}</td><td>{money(p.amount)}</td><td><span className={"pill " + p.status}>{p.status === "approved" ? "Diterima" : p.status === "rejected" ? "Ditolak" : "Menunggu"}</span></td><td>{p.review_note || "—"}</td></tr>)}</tbody></table></div> : <p className="muted">Belum ada pengajuan pembayaran.</p>}</section><section className="notice"><strong>Pengajuan pembayaran belum dibuka</strong><p>Fitur pembayaran akan diaktifkan setelah alur persetujuan admin terhubung secara atomik dengan ledger, tunggakan, dan NextPay. Ini mencegah status “diterima” tanpa pembukuan yang benar.</p></section></>}<footer>©Designed by Vergil D Ajax</footer></main>;
  }

  if (session && !profile) {
    return <main className="page-shell"><section className="panel"><Brand /><h1>Profil belum tersedia</h1><p className="intro">Sesi login aktif, tetapi profil anggota belum ditemukan. Keluar dan hubungi admin utama; jangan membuat akun ulang dengan username yang sama.</p><button className="secondary full" onClick={signOut}>Keluar</button><footer>©Designed by Vergil D Ajax</footer></section></main>;
  }

  return <main className="page-shell"><section className="panel auth-panel"><Brand /><div className="eyebrow"><span className="status-dot" /> WEBKAS FAM SOS V2</div><h1>{mode === "login" ? <>Masuk ke <span>WEBKAS</span></> : <>Daftar <span>anggota</span></>}</h1><p className="intro">{mode === "login" ? "Gunakan username dan kata sandi akun kas kamu." : "Buat akun anggota. Akses baru aktif setelah disetujui admin utama."}</p>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<form onSubmit={mode === "login" ? signIn : register} className="auth-form">{mode === "register" && <label>Nama karakter / nama IC<input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} minLength={2} maxLength={80} autoComplete="nickname" required placeholder="Nama karakter" /></label>}<label>Username<input value={username} onChange={(e)=>setUsername(e.target.value)} minLength={3} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" required placeholder="username_kamu" /></label><label>Kata sandi<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} minLength={8} maxLength={72} autoComplete={mode === "login" ? "current-password" : "new-password"} required placeholder="Minimal 8 karakter" /></label><button className="primary full" disabled={busy}>{busy ? "Memproses…" : mode === "login" ? "MASUK" : "KIRIM PENDAFTARAN"}</button></form><div className="auth-switch">{mode === "login" ? "Belum punya akun?" : "Sudah punya akun?"} <button className="text-button" onClick={()=>{setMode(mode === "login" ? "register" : "login");setError("");setMessage("");}}>{mode === "login" ? "Daftar anggota" : "Kembali masuk"}</button></div><div className="small-note">Akun baru berstatus menunggu sampai disetujui admin utama. Jangan bagikan kata sandi kepada siapa pun.</div><footer>©Designed by Vergil D Ajax</footer></section></main>;
}

function Brand({ compact = false }) {
  return <div className={"brand-mark" + (compact ? " compact" : "")}><span className="brand-icon">K</span><div><strong>WEBKAS <span>FAM SOS</span></strong><small>CATATAN KAS KELUARGA</small></div></div>;
}
