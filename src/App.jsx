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

  async function submitPayment(event) {
    event.preventDefault();
    setError(""); setMessage("");
    const amountK = Number(paymentAmount);
    if (!Number.isFinite(amountK) || amountK <= 0) {
      setError("Masukkan nominal pembayaran dalam satuan K, misalnya 5 untuk 5K.");
      return;
    }
    if (!proofFile) { setError("Pilih foto bukti pembayaran terlebih dahulu."); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(proofFile.type)) {
      setError("Bukti harus berupa JPG, PNG, atau WEBP.");
      return;
    }
    if (proofFile.size > 5 * 1024 * 1024) { setError("Ukuran bukti maksimal 5 MB."); return; }
    const amount = Math.round(amountK * 1000 * 100) / 100;
    if (paymentType === "kas" && Number(settings?.daily_amount) > 0 &&
        Math.abs(amount / Number(settings.daily_amount) - Math.round(amount / Number(settings.daily_amount))) > 0.000001) {
      setError("Nominal KAS harus kelipatan tarif harian " + money(settings.daily_amount) + ".");
      return;
    }
    setBusy(true);
    try {
      const ext = proofFile.type === "image/jpeg" ? "jpg" : proofFile.type === "image/png" ? "png" : "webp";
      const path = session.user.id + "/" + crypto.randomUUID() + "." + ext;
      const { error: uploadError } = await supabase.storage.from("payment-proofs").upload(path, proofFile, {
        upsert: false, contentType: proofFile.type, cacheControl: "3600",
      });
      if (uploadError) throw new Error("Unggah bukti gagal: " + uploadError.message);
      const { error: insertError } = await supabase.from("payment_submissions").insert({
        member_id: session.user.id, amount, payment_type: paymentType, proof_path: path,
      });
      if (insertError) throw new Error("Bukti terunggah, tetapi pengajuan belum tersimpan. Hubungi admin agar berkas yang tidak terpakai dapat dibersihkan.");
      setPaymentAmount(""); setProofFile(null);
      const refreshed = await supabase.from("payment_submissions")
        .select("id,amount,payment_type,status,created_at,review_note")
        .eq("member_id", session.user.id).order("created_at", { ascending: false }).limit(10);
      setPayments(refreshed.data || []);
      setMessage("Pengajuan pembayaran terkirim dan menunggu pemeriksaan admin.");
    } catch (err) {
      setError(err.message || "Pengajuan pembayaran gagal.");
    } finally { setBusy(false); }
  }

  async function openProof(path) {
    setError("");
    const { data, error: proofError } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 300);
    if (proofError || !data?.signedUrl) { setError("Bukti tidak dapat dibuka. " + (proofError?.message || "")); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function reviewPayment(id, decision) {
    setBusy(true); setError(""); setMessage("");
    const { error: reviewError } = await supabase.rpc("review_payment", {
      p_submission_id: id, p_decision: decision, p_note: reviewNote,
    });
    if (reviewError) {
      setError("Pembayaran belum diproses: " + reviewError.message);
      setBusy(false); return;
    }
    setPendingPayments((rows) => rows.filter((row) => row.id !== id));
    setReviewNote("");
    setMessage(decision === "approved" ? "Pembayaran disetujui dan pembukuan kas diperbarui dalam satu transaksi." : "Pengajuan pembayaran ditolak.");
    setBusy(false);
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
    return <main className="dashboard-shell"><header className="dashboard-header"><Brand compact /><button className="secondary" onClick={signOut} disabled={busy}>Keluar ↗</button></header><section className="welcome-panel"><div className="eyebrow">AKUN {isAdmin ? "ADMIN" : "ANGGOTA"} · AKTIF</div><h1>Halo, <span>{profile.display_name}</span></h1><p>Username: <strong>{profile.login_username}</strong></p><p className="muted">Tanggal rekap: {date(settings?.report_date)}</p></section>{isAdmin ? <><section className="panel history-panel"><div className="section-head"><div><div className="eyebrow">PANEL ADMIN</div><h2>Antrean pembayaran</h2></div><span className="pill">{pendingPayments.length} menunggu</span></div>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<label>Catatan pemeriksaan (opsional)<input value={reviewNote} onChange={(e)=>setReviewNote(e.target.value)} maxLength={500} placeholder="Catatan untuk keputusan berikutnya" /></label>{pendingPayments.length ? <div className="table-wrap"><table><thead><tr><th>Anggota</th><th>Jenis</th><th>Nominal</th><th>Tanggal</th><th>Bukti</th><th>Keputusan</th></tr></thead><tbody>{pendingPayments.map((p)=><tr key={p.id}><td>{p.member_profiles?.display_name || p.member_id}<br/><small>{p.member_profiles?.login_username || ""}</small></td><td>{p.payment_type === "adm" ? "ADM" : "KAS"}</td><td>{money(p.amount)}</td><td>{date(p.created_at.slice(0,10))}</td><td><button className="secondary" onClick={()=>openProof(p.proof_path)}>Lihat bukti</button></td><td><div className="review-actions"><button className="primary" disabled={busy} onClick={()=>reviewPayment(p.id,"approved")}>Setujui</button><button className="secondary" disabled={busy} onClick={()=>reviewPayment(p.id,"rejected")}>Tolak</button></div></td></tr>)}</tbody></table></div> : <p className="muted">Tidak ada pengajuan yang menunggu pemeriksaan.</p>}</section><section className="notice"><strong>Pembukuan otomatis</strong><p>Persetujuan KAS mengalokasikan pembayaran ke tunggakan terlebih dahulu, lalu menambah saldo ke depan. Pembayaran ADM hanya mengurangi sisa ADM. Setiap keputusan dicatat dalam audit log.</p></section></> : <><div className="stats-grid"><article className="stat"><span>Kas Lebih / Saldo Dibayar ke Depan</span><strong>{money(wallet.balance)}</strong><small>Saldo tersedia</small></article><article className="stat"><span>Tunggakan Kas</span><strong className={Number(wallet.arrears) > 0 ? "amount-danger" : ""}>{money(wallet.arrears)}</strong><small>{Number(wallet.arrears) > 0 ? "Belum tertutup" : "Tidak ada tunggakan tercatat"}</small></article><article className="stat"><span>ADM Belum Lunas</span><strong>{money(wallet.adm_due)}</strong><small>{Number(wallet.adm_due) > 0 ? "Menunggu pelunasan" : "Lunas"}</small></article><article className="stat"><span>NextPay</span><strong className="date-value">{date(wallet.next_pay)}</strong><small>{wallet.exempt_kas ? "Pengecualian kas aktif" : "Tanggal pembayaran berikutnya"}</small></article></div><section className="panel history-panel"><div className="section-head"><div><div className="eyebrow">RIWAYAT PENGAJUAN</div><h2>Pembayaran saya</h2></div><span className="pill">{payments.length} terbaru</span></div>{payments.length ? <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Nominal</th><th>Status</th><th>Catatan admin</th></tr></thead><tbody>{payments.map((p) => <tr key={p.id}><td>{date(p.created_at.slice(0,10))}</td><td>{money(p.amount)} <small>{p.payment_type === "adm" ? "ADM" : "KAS"}</small></td><td><span className={"pill " + p.status}>{p.status === "approved" ? "Diterima" : p.status === "rejected" ? "Ditolak" : "Menunggu"}</span></td><td>{p.review_note || "—"}</td></tr>)}</tbody></table></div> : <p className="muted">Belum ada pengajuan pembayaran.</p>}</section><section className="panel history-panel"><div className="eyebrow">KIRIM PEMBAYARAN</div><h2>Ajukan pembayaran</h2><p className="muted">Nominal dimasukkan dalam K. Bukti bersifat privat dan hanya dapat dilihat oleh kamu serta admin.</p>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<form className="auth-form" onSubmit={submitPayment}><label>Jenis pembayaran<select value={paymentType} onChange={(e)=>setPaymentType(e.target.value)}><option value="kas">KAS (tunggakan dahulu, lalu saldo ke depan)</option><option value="adm" disabled={Number(wallet.adm_due) <= 0}>ADM</option></select></label><label>Nominal (K)<input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(e)=>setPaymentAmount(e.target.value)} required placeholder={paymentType === "adm" ? "Contoh: 10" : "Contoh: 5"} /></label><label>Foto bukti pembayaran<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>setProofFile(e.target.files?.[0] || null)} required /></label><button className="primary full" disabled={busy}>{busy ? "Mengirim…" : "KIRIM PENGAJUAN"}</button></form></section></>}<footer>©Designed by Vergil D Ajax</footer></main>;
  }

  if (session && !profile) {
    return <main className="page-shell"><section className="panel"><Brand /><h1>Profil belum tersedia</h1><p className="intro">Sesi login aktif, tetapi profil anggota belum ditemukan. Keluar dan hubungi admin utama; jangan membuat akun ulang dengan username yang sama.</p><button className="secondary full" onClick={signOut}>Keluar</button><footer>©Designed by Vergil D Ajax</footer></section></main>;
  }

  return <main className="page-shell"><section className="panel auth-panel"><Brand /><div className="eyebrow"><span className="status-dot" /> WEBKAS FAM SOS V2</div><h1>{mode === "login" ? <>Masuk ke <span>WEBKAS</span></> : <>Daftar <span>anggota</span></>}</h1><p className="intro">{mode === "login" ? "Gunakan username dan kata sandi akun kas kamu." : "Buat akun anggota. Akses baru aktif setelah disetujui admin utama."}</p>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<form onSubmit={mode === "login" ? signIn : register} className="auth-form">{mode === "register" && <label>Nama karakter / nama IC<input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} minLength={2} maxLength={80} autoComplete="nickname" required placeholder="Nama karakter" /></label>}<label>Username<input value={username} onChange={(e)=>setUsername(e.target.value)} minLength={3} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" required placeholder="username_kamu" /></label><label>Kata sandi<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} minLength={8} maxLength={72} autoComplete={mode === "login" ? "current-password" : "new-password"} required placeholder="Minimal 8 karakter" /></label><button className="primary full" disabled={busy}>{busy ? "Memproses…" : mode === "login" ? "MASUK" : "KIRIM PENDAFTARAN"}</button></form><div className="auth-switch">{mode === "login" ? "Belum punya akun?" : "Sudah punya akun?"} <button className="text-button" onClick={()=>{setMode(mode === "login" ? "register" : "login");setError("");setMessage("");}}>{mode === "login" ? "Daftar anggota" : "Kembali masuk"}</button></div><div className="small-note">Akun baru berstatus menunggu sampai disetujui admin utama. Jangan bagikan kata sandi kepada siapa pun.</div><footer>©Designed by Vergil D Ajax</footer></section></main>;
}

function Brand({ compact = false }) {
  return <div className={"brand-mark" + (compact ? " compact" : "")}><span className="brand-icon">K</span><div><strong>WEBKAS <span>FAM SOS</span></strong><small>CATATAN KAS KELUARGA</small></div></div>;
}
