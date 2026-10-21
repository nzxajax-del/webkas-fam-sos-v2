import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./lib/supabase.js";

const money = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value || 0) / 1000) + "K";
const date = (value) => value ? new Date(value + "T00:00:00+07:00").toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }) : "Belum ditetapkan";
const authEmail = (username) => username.trim().toLowerCase() + "@login.webkas-fam-sos.invalid";
const csvCell = (value) => {
  let text = String(value ?? "");
  if (/^[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
};
const downloadCsv = (filename, rows) => {
  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
};

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [settings, setSettings] = useState(null);
  const [payments, setPayments] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [pendingMembers, setPendingMembers] = useState([]);
  const [adminMembers, setAdminMembers] = useState([]);
  const [adminTransactions, setAdminTransactions] = useState([]);
  const [adminAudit, setAdminAudit] = useState([]);
  const [dailyDraft, setDailyDraft] = useState("");
  const [reportDateDraft, setReportDateDraft] = useState("");
  const [admDraft, setAdmDraft] = useState("");
  const [retentionDraft, setRetentionDraft] = useState("7");
  const [paymentType, setPaymentType] = useState("kas");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [proofFile, setProofFile] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
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
        setProfile(null); setWallet(null); setSettings(null); setPayments([]); setPendingPayments([]); setPendingMembers([]); setAdminMembers([]); setAdminTransactions([]); setAdminAudit([]);
      }
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user) return;
    let alive = true;
    if (!profile || !wallet) setLoading(true);
    (async () => {
      const [profileRes, walletRes, settingsRes, paymentsRes] = await Promise.all([
        supabase.from("member_profiles").select("id,display_name,login_username,role,status").eq("id", session.user.id).maybeSingle(),
        supabase.from("member_wallets").select("balance,arrears,next_pay,unpaid_from,adm_due,exempt_kas").eq("member_id", session.user.id).maybeSingle(),
        supabase.from("dues_settings").select("report_date,daily_amount,adm_default,cash_operations_enabled,proof_retention_days").eq("id", 1).maybeSingle(),
        supabase.from("payment_submissions").select("id,amount,payment_type,status,created_at,review_note").eq("member_id", session.user.id).order("created_at", { ascending: false }).limit(10),
      ]);
      if (!alive) return;
      const firstError = [profileRes, walletRes, settingsRes, paymentsRes].find((r) => r.error);
      if (firstError) setError("Data akun belum dapat dimuat. " + firstError.error.message);
      let pendingRows = [];
      let pendingMemberRows = [];
      if (profileRes.data?.role === "admin" && profileRes.data?.status === "active") {
        const [pendingRes, memberRes, allMemberRes, walletListRes, transactionRes, auditRes] = await Promise.all([
          supabase.from("payment_submissions").select("id,member_id,amount,payment_type,proof_path,status,created_at,member_profiles(display_name,login_username)").eq("status", "pending").order("created_at", { ascending: true }).limit(100),
          supabase.from("member_profiles").select("id,display_name,login_username,created_at").eq("role", "member").eq("status", "pending").order("created_at", { ascending: true }).limit(100),
          supabase.from("member_profiles").select("id,display_name,login_username,status,created_at").eq("role", "member").order("display_name", { ascending: true }).limit(500),
          supabase.from("member_wallets").select("member_id,balance,arrears,next_pay,unpaid_from,adm_due,exempt_kas"),
          supabase.from("wallet_transactions").select("id,member_id,transaction_type,amount,description,created_at,member_profiles(display_name,login_username)").order("created_at", { ascending: false }).limit(100),
          supabase.from("admin_audit_log").select("id,action,target_type,target_id,details,created_at").order("created_at", { ascending: false }).limit(100),
        ]);
        if (pendingRes.error) setError("Antrean pembayaran tidak dapat dimuat. " + pendingRes.error.message);
        if (memberRes.error) setError("Antrean pendaftaran tidak dapat dimuat. " + memberRes.error.message);
        if (allMemberRes.error) setError("Daftar anggota tidak dapat dimuat. " + allMemberRes.error.message);
        if (transactionRes.error) setError("Laporan transaksi tidak dapat dimuat. " + transactionRes.error.message);
        if (auditRes.error) setError("Audit admin tidak dapat dimuat. " + auditRes.error.message);
        const walletByMember = new Map((walletListRes.data || []).map((w) => [w.member_id, w]));
        setAdminMembers((allMemberRes.data || []).map((m) => ({ ...m, ...(walletByMember.get(m.id) || {}) }))
          .sort((a, b) => Number(Number(b.arrears || 0) >= 7000) - Number(Number(a.arrears || 0) >= 7000) ||
            Number(b.arrears || 0) - Number(a.arrears || 0) ||
            String(a.display_name || "").localeCompare(String(b.display_name || ""))));
        setAdminTransactions(transactionRes.data || []);
        setAdminAudit(auditRes.data || []);
        pendingRows = pendingRes.data || [];
        pendingMemberRows = memberRes.data || [];
      }
      if (!alive) return;
      setProfile(profileRes.data || null);
      setWallet(walletRes.data || null);
      setSettings(settingsRes.data || null);
      if (settingsRes.data) {
        setDailyDraft(String(settingsRes.data.daily_amount ?? 1000));
        setReportDateDraft(settingsRes.data.report_date || "");
        setAdmDraft(String(settingsRes.data.adm_default ?? 10000));
        setRetentionDraft(String(settingsRes.data.proof_retention_days ?? 7));
      }
      setPayments(paymentsRes.data || []);
      setPendingPayments(pendingRows);
      setPendingMembers(pendingMemberRows);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [session?.user?.id, refreshVersion]);

  useEffect(() => {
    if (!supabase || !session?.user?.id || profile?.status !== "active") {
      setRealtimeConnected(false);
      return;
    }
    const onChange = () => setRefreshVersion((value) => value + 1);
    let channel = supabase.channel("webkas-live-" + session.user.id);
    for (const table of ["member_profiles", "member_wallets", "payment_submissions", "wallet_transactions", "dues_settings"]) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
    }
    if (profile.role === "admin") {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "admin_audit_log" }, onChange);
    }
    channel.subscribe((status) => setRealtimeConnected(status === "SUBSCRIBED"));
    return () => {
      setRealtimeConnected(false);
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, profile?.role, profile?.status]);

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

  async function bootstrapAdmin(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const { error: bootstrapError } = await supabase.rpc("bootstrap_first_admin", { p_token: bootstrapToken.trim() });
    if (bootstrapError) {
      setError("Aktivasi admin gagal: " + bootstrapError.message);
      setBusy(false); return;
    }
    const { data, error: profileError } = await supabase.from("member_profiles")
      .select("id,display_name,login_username,role,status").eq("id", session.user.id).maybeSingle();
    if (profileError || !data) {
      setError("Admin berhasil diproses, tetapi profil belum dapat dimuat. Keluar lalu masuk kembali.");
      setBusy(false); return;
    }
    const [walletRes, settingsRes] = await Promise.all([
      supabase.from("member_wallets").select("balance,arrears,next_pay,unpaid_from,adm_due,exempt_kas").eq("member_id", session.user.id).maybeSingle(),
      supabase.from("dues_settings").select("report_date,daily_amount,adm_default,cash_operations_enabled,proof_retention_days").eq("id", 1).maybeSingle(),
    ]);
    if (walletRes.error || !walletRes.data || settingsRes.error || !settingsRes.data) {
      setError("Admin aktif, tetapi data dashboard belum termuat. Keluar lalu masuk kembali untuk memuat ulang.");
      setProfile(data);
      setBusy(false); return;
    }
    setProfile(data); setWallet(walletRes.data); setSettings(settingsRes.data);
    setDailyDraft(String(settingsRes.data.daily_amount ?? 1000));
    setReportDateDraft(settingsRes.data.report_date || "");
    setAdmDraft(String(settingsRes.data.adm_default ?? 10000));
    setRetentionDraft(String(settingsRes.data.proof_retention_days ?? 7));
    setBootstrapToken("");
    setMessage("Admin utama berhasil diaktifkan.");
    setBusy(false);
  }

  async function submitPayment(event) {
    event.preventDefault();
    setError(""); setMessage("");
    if (!settings?.cash_operations_enabled) {
      setError("Pengajuan pembayaran belum dibuka. Tunggu pengumuman admin setelah pengujian sistem selesai.");
      return;
    }
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

  async function reviewMember(id, decision) {
    setBusy(true); setError(""); setMessage("");
    const { error: reviewError } = await supabase.rpc("review_member_registration", {
      p_member_id: id, p_decision: decision, p_note: reviewNote,
    });
    if (reviewError) {
      setError("Pendaftaran belum diproses: " + reviewError.message);
      setBusy(false); return;
    }
    setPendingMembers((rows) => rows.filter((row) => row.id !== id));
    setReviewNote("");
    await refreshAdminSnapshot();
    setMessage(decision === "active" ? "Anggota disetujui. Akun sekarang aktif." : "Pendaftaran anggota ditolak.");
    setBusy(false);
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
    await refreshAdminSnapshot();
    setMessage(decision === "approved" ? "Pembayaran disetujui dan pembukuan kas diperbarui dalam satu transaksi." : "Pengajuan pembayaran ditolak.");
    setBusy(false);
  }

  async function saveSettings(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const daily = Number(dailyDraft), adm = Number(admDraft);
    if (!Number.isFinite(daily) || daily <= 0 || !Number.isInteger(daily) || !Number.isFinite(adm) || adm < 0 || !Number.isInteger(adm)) {
      setError("Tarif KAS harus bilangan bulat positif dan ADM harus bilangan bulat nol atau lebih."); setBusy(false); return;
    }
    const { error: saveError } = await supabase.rpc("admin_update_settings", { p_daily_amount: daily, p_adm_default: adm });
    if (saveError) setError("Pengaturan belum disimpan: " + saveError.message);
    else {
      setSettings((old) => old ? { ...old, daily_amount: daily, adm_default: adm } : old);
      setMessage("Pengaturan tarif berhasil disimpan dan tercatat di audit admin.");
    }
    setBusy(false);
  }

  async function saveProofRetention(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const days = Number(retentionDraft);
    if (![3, 7, 30].includes(days)) {
      setError("Retensi bukti harus 3, 7, atau 30 hari."); setBusy(false); return;
    }
    const { error: saveError } = await supabase.rpc("admin_update_proof_retention", { p_days: days });
    if (saveError) setError("Retensi bukti belum disimpan: " + saveError.message);
    else {
      setSettings((old) => old ? { ...old, proof_retention_days: days } : old);
      setMessage("Retensi bukti pembayaran disimpan: " + days + " hari.");
      await refreshAdminSnapshot();
    }
    setBusy(false);
  }

  async function cleanupProofs() {
    setBusy(true); setError(""); setMessage("");
    const { data, error: cleanupError } = await supabase.functions.invoke("cleanup-payment-proofs", { body: {} });
    if (cleanupError || data?.error) {
      setError("Pembersihan bukti gagal: " + (data?.error || cleanupError?.message || "Kesalahan tidak diketahui."));
    } else {
      setMessage("Pembersihan selesai. " + Number(data?.deleted_count || 0) + " bukti lama dihapus; bukti pengajuan yang masih menunggu tetap disimpan.");
      await refreshAdminSnapshot();
    }
    setBusy(false);
  }

  async function saveReportDate(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    if (!settings?.cash_operations_enabled) {
      setError("Perubahan tanggal tetap dikunci sampai tes regresi selesai."); setBusy(false); return;
    }
    const { data, error: saveError } = await supabase.rpc("admin_set_report_date", { p_report_date: reportDateDraft });
    if (saveError) setError("Tanggal rekap belum diubah: " + saveError.message);
    else {
      setSettings((old) => old ? { ...old, report_date: reportDateDraft } : old);
      setMessage("Tanggal rekap diperbarui. Pemrosesan catch-up membuat " + Number(data?.processed || 0) + " catatan tagihan harian.");
    }
    setBusy(false);
  }

  async function saveMember(member) {
    setBusy(true); setError(""); setMessage("");
    const { error: saveError } = await supabase.rpc("admin_update_member", {
      p_member_id: member.id, p_display_name: member.display_name, p_exempt_kas: Boolean(member.exempt_kas),
    });
    if (saveError) setError("Perubahan anggota gagal disimpan: " + saveError.message);
    else { await refreshAdminSnapshot(); setMessage("Profil anggota disimpan. Perubahan tercatat di audit admin."); }
    setBusy(false);
  }

  async function refreshAdminSnapshot() {
    const [allMemberRes, walletListRes, transactionRes, auditRes] = await Promise.all([
      supabase.from("member_profiles").select("id,display_name,login_username,status,created_at").eq("role", "member").order("display_name", { ascending: true }).limit(500),
      supabase.from("member_wallets").select("member_id,balance,arrears,next_pay,unpaid_from,adm_due,exempt_kas"),
      supabase.from("wallet_transactions").select("id,member_id,transaction_type,amount,description,created_at,member_profiles(display_name,login_username)").order("created_at", { ascending: false }).limit(100),
      supabase.from("admin_audit_log").select("id,action,target_type,target_id,details,created_at").order("created_at", { ascending: false }).limit(100),
    ]);
    const failed = [allMemberRes, walletListRes, transactionRes, auditRes].find((r) => r.error);
    if (failed) {
      setError("Data panel admin belum berhasil diperbarui: " + failed.error.message);
      return false;
    }
    const walletByMember = new Map((walletListRes.data || []).map((w) => [w.member_id, w]));
    setAdminMembers((allMemberRes.data || []).map((m) => ({ ...m, ...(walletByMember.get(m.id) || {}) }))
      .sort((a, b) => Number(Number(b.arrears || 0) >= 7000) - Number(Number(a.arrears || 0) >= 7000) ||
        Number(b.arrears || 0) - Number(a.arrears || 0) ||
        String(a.display_name || "").localeCompare(String(b.display_name || ""))));
    setAdminTransactions(transactionRes.data || []);
    setAdminAudit(auditRes.data || []);
    return true;
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
      return <main className="page-shell"><section className="panel"><Brand /><div className="eyebrow"><span className={profile.status === "pending" ? "status-dot" : "status-dot red"} /> STATUS PENDAFTARAN</div><h1>{profile.status === "pending" ? "Menunggu persetujuan" : "Pendaftaran ditolak"}</h1><p className="intro">Halo, {profile.display_name}. {profile.status === "pending" ? "Admin utama perlu menyetujui akun sebelum fitur anggota dapat digunakan." : "Akun ini belum mendapat akses. Hubungi admin utama jika perlu peninjauan."}</p><div className="notice"><strong>Username</strong><p>{profile.login_username}</p><strong>Status</strong><p>{profile.status === "pending" ? "Menunggu persetujuan" : "Ditolak"}</p></div>{profile.status === "pending" && <section className="notice"><strong>Penyiapan admin utama</strong><p>Jika ini akun pemilik proyek dan belum ada admin sama sekali, masukkan kode bootstrap satu kali yang diberikan saat penyiapan. Jangan bagikan kode ini.</p><form className="auth-form" onSubmit={bootstrapAdmin}><label>Kode bootstrap<input type="password" value={bootstrapToken} onChange={(e)=>setBootstrapToken(e.target.value)} autoComplete="off" required placeholder="Kode satu kali" /></label><button className="primary full" disabled={busy}>{busy ? "Memproses…" : "AKTIFKAN ADMIN UTAMA"}</button></form></section>}{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<button className="secondary full" onClick={signOut} disabled={busy}>Keluar</button><footer>©Designed by Vergil D Ajax</footer></section></main>;
    }
    if (!wallet) return <main className="page-shell"><section className="panel"><Brand /><h1>Akun belum siap</h1><p className="intro">Profil berhasil ditemukan, tetapi dompet kas belum tersedia. Jangan lakukan pembayaran sampai admin menyelesaikan penyiapan akun.</p><button className="secondary full" onClick={signOut}>Keluar</button><footer>©Designed by Vergil D Ajax</footer></section></main>;
    return <main className="dashboard-shell"><header className="dashboard-header"><Brand compact /><div className="review-actions"><button className="secondary" onClick={()=>setRefreshVersion((value)=>value+1)} disabled={loading}>Segarkan</button><button className="secondary" onClick={signOut} disabled={busy}>Keluar ↗</button></div></header><section className="welcome-panel"><div className="eyebrow">AKUN {isAdmin ? "ADMIN" : "ANGGOTA"} · AKTIF</div><h1>Halo, <span>{profile.display_name}</span></h1><p>Username: <strong>{profile.login_username}</strong></p><p className="muted">Tanggal rekap: {date(settings?.report_date)}</p><p className="muted">Realtime: <strong>{realtimeConnected ? "Terhubung" : "Menyambungkan…"}</strong></p></section>{isAdmin && !settings?.cash_operations_enabled && <div className="notice"><strong>MODE UJI AMAN — OPERASI KAS TERKUNCI</strong><p>Pengajuan dan persetujuan pembayaran serta pemrosesan harian belum dibuka sampai pengujian regresi selesai. Ini mencegah perubahan saldo nyata saat aturan NextPay masih divalidasi.</p></div>}{isAdmin ? <><section className="panel history-panel"><div className="section-head"><div><div className="eyebrow">PANEL ADMIN</div><h2>Pendaftaran anggota</h2></div><span className="pill">{pendingMembers.length} menunggu</span></div>{pendingMembers.length ? <div className="table-wrap"><table><thead><tr><th>Nama karakter</th><th>Username</th><th>Tanggal</th><th>Keputusan</th></tr></thead><tbody>{pendingMembers.map((m)=><tr key={m.id}><td>{m.display_name}</td><td>{m.login_username}</td><td>{date(m.created_at.slice(0,10))}</td><td><div className="review-actions"><button className="primary" disabled={busy} onClick={()=>reviewMember(m.id,"active")}>Setujui</button><button className="secondary" disabled={busy} onClick={()=>reviewMember(m.id,"rejected")}>Tolak</button></div></td></tr>)}</tbody></table></div> : <p className="muted">Tidak ada pendaftaran anggota yang menunggu.</p>}</section><section className="panel history-panel"><div className="section-head"><div><div className="eyebrow">PANEL ADMIN</div><h2>Antrean pembayaran</h2></div><span className="pill">{pendingPayments.length} menunggu</span></div>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<label>Catatan pemeriksaan (opsional)<input value={reviewNote} onChange={(e)=>setReviewNote(e.target.value)} maxLength={500} placeholder="Catatan untuk keputusan berikutnya" /></label>{pendingPayments.length ? <div className="table-wrap"><table><thead><tr><th>Anggota</th><th>Jenis</th><th>Nominal</th><th>Tanggal</th><th>Bukti</th><th>Keputusan</th></tr></thead><tbody>{pendingPayments.map((p)=><tr key={p.id}><td>{p.member_profiles?.display_name || p.member_id}<br/><small>{p.member_profiles?.login_username || ""}</small></td><td>{p.payment_type === "adm" ? "ADM" : "KAS"}</td><td>{money(p.amount)}</td><td>{date(p.created_at.slice(0,10))}</td><td><button className="secondary" onClick={()=>openProof(p.proof_path)}>Lihat bukti</button></td><td><div className="review-actions"><button className="primary" disabled={busy || !settings?.cash_operations_enabled} onClick={()=>reviewPayment(p.id,"approved")}>Setujui</button><button className="secondary" disabled={busy} onClick={()=>reviewPayment(p.id,"rejected")}>Tolak</button></div></td></tr>)}</tbody></table></div> : <p className="muted">Tidak ada pengajuan yang menunggu pemeriksaan.</p>}</section><section className="panel history-panel"><div className="section-head"><div><div className="eyebrow">ADMIN · MASTER DATA</div><h2>Manajemen anggota</h2></div><span className="pill">{adminMembers.length} anggota</span><button className="secondary" onClick={()=>downloadCsv("webkas-anggota.csv", [["Nama","Username","Status","Saldo","Tunggakan","ADM","NextPay","Belum bayar dari","Bebas KAS"], ...adminMembers.map((m)=>[m.display_name,m.login_username,m.status,m.balance,m.arrears,m.adm_due,m.next_pay,m.unpaid_from,m.exempt_kas?"Ya":"Tidak"])])}>Ekspor CSV</button></div><p className="muted">Ubah nama tampilan atau status pengecualian KAS. Koreksi saldo/riwayat uang tidak dilakukan dari tabel ini agar ledger tetap konsisten.</p><div className="stats-grid"><article className="stat"><span>Total tunggakan KAS</span><strong className="amount-danger">{money(adminMembers.filter((m)=>m.status==="active").reduce((sum,m)=>sum+Number(m.arrears||0),0))}</strong><small>Anggota aktif</small></article><article className="stat"><span>Tunggakan 7K ke atas</span><strong>{adminMembers.filter((m)=>m.status==="active" && Number(m.arrears||0)>=7000).length}</strong><small>Ditampilkan lebih dahulu</small></article><article className="stat"><span>Total ADM belum lunas</span><strong>{money(adminMembers.filter((m)=>m.status==="active").reduce((sum,m)=>sum+Number(m.adm_due||0),0))}</strong><small>Anggota aktif</small></article></div>{adminMembers.filter((m)=>m.status==="active" && Number(m.arrears||0)>=7000).length ? <div className="notice"><strong>Prioritas penagihan · 7K ke atas</strong><ul>{adminMembers.filter((m)=>m.status==="active" && Number(m.arrears||0)>=7000).map((m)=><li key={m.id}>{m.display_name} — <strong>{money(m.arrears)}</strong></li>)}</ul></div>:null}{adminMembers.filter((m)=>m.status==="active" && Number(m.adm_due||0)>0).length ? <div className="notice"><strong>ADM Belum Lunas</strong><ul>{adminMembers.filter((m)=>m.status==="active" && Number(m.adm_due||0)>0).map((m)=><li key={m.id}>{m.display_name} — <strong>{money(m.adm_due)}</strong></li>)}</ul></div>:null}{adminMembers.length ? <div className="table-wrap"><table><thead><tr><th>Nama karakter</th><th>Username / status</th><th>Saldo</th><th>Tunggakan</th><th>ADM</th><th>NextPay</th><th>Belum bayar dari</th><th>Bebas KAS</th><th>Aksi</th></tr></thead><tbody>{adminMembers.map((m)=><tr key={m.id}><td><input aria-label={"Nama anggota "+m.login_username} value={m.display_name || ""} onChange={(e)=>setAdminMembers((rows)=>rows.map((r)=>r.id===m.id?{...r,display_name:e.target.value}:r))} maxLength={80}/></td><td>{m.login_username}<br/><small>{m.status === "active" ? "Aktif" : m.status === "pending" ? "Menunggu" : "Ditolak"}</small></td><td>{money(m.balance)}</td><td>{money(m.arrears)}</td><td>{money(m.adm_due)}</td><td>{date(m.next_pay)}</td><td>{date(m.unpaid_from)}</td><td><input type="checkbox" aria-label={"Bebas KAS "+m.login_username} checked={Boolean(m.exempt_kas)} onChange={(e)=>setAdminMembers((rows)=>rows.map((r)=>r.id===m.id?{...r,exempt_kas:e.target.checked}:r))}/></td><td><button className="primary" disabled={busy || m.status !== "active"} onClick={()=>saveMember(m)}>Simpan</button></td></tr>)}</tbody></table></div>:<p className="muted">Belum ada anggota terdaftar.</p>}</section>
<section className="panel history-panel"><div className="eyebrow">ADMIN · PENGATURAN</div><h2>Pengaturan KAS & ADM</h2><p className="muted">Tarif berlaku sesuai tanggal efektif dan tidak bisa diubah jika anggota masih memiliki saldo prabayar, tunggakan, atau NextPay masa depan. Tanggal rekap hanya bisa dimajukan setelah seluruh tes kas/NextPay lulus dan penguncian operasi dibuka.</p><div className="stats-grid"><article className="stat"><span>Tanggal rekap saat ini</span><strong className="date-value">{date(settings?.report_date)}</strong><small>Zona waktu WIB</small></article><article className="stat"><span>Operasi kas</span><strong>{settings?.cash_operations_enabled ? "Terbuka" : "Terkunci"}</strong><small>Penguncian keamanan database</small></article></div><form className="auth-form" onSubmit={saveReportDate}><label>Tanggal rekap<input type="date" value={reportDateDraft} onChange={(e)=>setReportDateDraft(e.target.value)} disabled={!settings?.cash_operations_enabled} required/></label><button className="primary full" disabled={busy || !settings?.cash_operations_enabled}>{busy ? "Memproses…" : "SIMPAN TANGGAL & PROSES CATCH-UP"}</button>{!settings?.cash_operations_enabled && <small className="muted">Terkunci sampai pengujian kas/NextPay lulus.</small>}</form><form className="auth-form" onSubmit={saveSettings}><label>Tarif KAS harian (angka satuan rupiah)<input type="number" min="1" step="1" value={dailyDraft} onChange={(e)=>setDailyDraft(e.target.value)} required/></label><label>ADM default anggota baru<input type="number" min="0" step="1" value={admDraft} onChange={(e)=>setAdmDraft(e.target.value)} required/></label><button className="primary full" disabled={busy}>{busy ? "Menyimpan…" : "SIMPAN PENGATURAN"}</button></form><form className="auth-form" onSubmit={saveProofRetention}><label>Hapus bukti pembayaran setelah<select value={retentionDraft} onChange={(e)=>setRetentionDraft(e.target.value)} required><option value="3">3 hari</option><option value="7">7 hari</option><option value="30">30 hari</option></select></label><button className="primary full" disabled={busy}>{busy ? "Menyimpan…" : "SIMPAN RETENSI BUKTI"}</button></form><button className="secondary full" onClick={cleanupProofs} disabled={busy}>{busy ? "Memproses…" : "BERSIHKAN BUKTI KEDALUWARSA"}</button><small className="muted">Pembersihan manual memakai retensi di atas dan selalu mempertahankan bukti pengajuan yang masih menunggu keputusan. Penjadwalan otomatis belum diaktifkan.</small></section>
<section className="panel history-panel"><div className="section-head"><div><div className="eyebrow">ADMIN · LAPORAN</div><h2>Transaksi kas terbaru</h2></div><span className="pill">{adminTransactions.length} transaksi</span><button className="secondary" onClick={()=>downloadCsv("webkas-transaksi.csv", [["Tanggal","Anggota","Username","Jenis","Nominal","Keterangan"], ...adminTransactions.map((t)=>[t.created_at,t.member_profiles?.display_name,t.member_profiles?.login_username,t.transaction_type,t.amount,t.description])])}>Ekspor CSV</button></div>{adminTransactions.length ? <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Anggota</th><th>Jenis</th><th>Nominal</th><th>Keterangan</th></tr></thead><tbody>{adminTransactions.map((t)=><tr key={t.id}><td>{date(t.created_at.slice(0,10))}</td><td>{t.member_profiles?.display_name || t.member_id}</td><td>{t.transaction_type}</td><td>{money(t.amount)}</td><td>{t.description || "—"}</td></tr>)}</tbody></table></div>:<p className="muted">Belum ada transaksi yang tercatat di database V2.</p>}</section>
<section className="panel history-panel"><div className="section-head"><div><div className="eyebrow">ADMIN · KEAMANAN</div><h2>Audit aktivitas admin</h2></div><span className="pill">{adminAudit.length} catatan</span><button className="secondary" onClick={()=>downloadCsv("webkas-audit-admin.csv", [["Waktu","Aksi","Target","ID Target","Detail"], ...adminAudit.map((a)=>[a.created_at,a.action,a.target_type,a.target_id,JSON.stringify(a.details||{})])])}>Ekspor CSV</button></div>{adminAudit.length ? <div className="table-wrap"><table><thead><tr><th>Waktu</th><th>Aksi</th><th>Target</th><th>Detail</th></tr></thead><tbody>{adminAudit.map((a)=><tr key={a.id}><td>{new Date(a.created_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})}</td><td>{a.action}</td><td>{a.target_type || "—"} {a.target_id || ""}</td><td><code>{JSON.stringify(a.details || {})}</code></td></tr>)}</tbody></table></div>:<p className="muted">Belum ada catatan audit.</p>}</section><section className="notice"><strong>Pembukuan otomatis</strong><p>Persetujuan KAS mengalokasikan pembayaran ke tunggakan terlebih dahulu, lalu menambah saldo ke depan. Pembayaran ADM hanya mengurangi sisa ADM. Setiap keputusan dicatat dalam audit log.</p>{!settings?.cash_operations_enabled && <p><strong>Mode aman aktif:</strong> persetujuan pembayaran masih dikunci sampai tes regresi kas dan NextPay selesai. Penolakan tetap tersedia.</p>}</section></> : <><div className="stats-grid"><article className="stat"><span>Kas Lebih / Saldo Dibayar ke Depan</span><strong>{money(wallet.balance)}</strong><small>Saldo tersedia</small></article><article className="stat"><span>Tunggakan Kas</span><strong className={Number(wallet.arrears) > 0 ? "amount-danger" : ""}>{money(wallet.arrears)}</strong><small>{Number(wallet.arrears) > 0 ? "Belum tertutup" : "Tidak ada tunggakan tercatat"}</small></article><article className="stat"><span>ADM Belum Lunas</span><strong>{money(wallet.adm_due)}</strong><small>{Number(wallet.adm_due) > 0 ? "Menunggu pelunasan" : "Lunas"}</small></article><article className="stat"><span>NextPay</span><strong className="date-value">{date(wallet.next_pay)}</strong><small>{wallet.exempt_kas ? "Pengecualian kas aktif" : "Tanggal pembayaran berikutnya"}</small></article></div><section className="panel history-panel"><div className="section-head"><div><div className="eyebrow">RIWAYAT PENGAJUAN</div><h2>Pembayaran saya</h2></div><span className="pill">{payments.length} terbaru</span></div>{payments.length ? <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Nominal</th><th>Status</th><th>Catatan admin</th></tr></thead><tbody>{payments.map((p) => <tr key={p.id}><td>{date(p.created_at.slice(0,10))}</td><td>{money(p.amount)} <small>{p.payment_type === "adm" ? "ADM" : "KAS"}</small></td><td><span className={"pill " + p.status}>{p.status === "approved" ? "Diterima" : p.status === "rejected" ? "Ditolak" : "Menunggu"}</span></td><td>{p.review_note || "—"}</td></tr>)}</tbody></table></div> : <p className="muted">Belum ada pengajuan pembayaran.</p>}</section><section className="panel history-panel"><div className="eyebrow">KIRIM PEMBAYARAN</div><h2>Ajukan pembayaran</h2><p className="muted">Nominal dimasukkan dalam K. Bukti bersifat privat dan hanya dapat dilihat oleh kamu serta admin.</p>{!settings?.cash_operations_enabled && <div className="notice"><strong>Mode aman aktif</strong><p>Pengajuan pembayaran belum dibuka sampai pengujian kas dan NextPay selesai. Jangan mengirim pembayaran melalui website untuk sementara.</p></div>}{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<form className="auth-form" onSubmit={submitPayment}><label>Jenis pembayaran<select disabled={!settings?.cash_operations_enabled} value={paymentType} onChange={(e)=>setPaymentType(e.target.value)}><option value="kas">KAS (tunggakan dahulu, lalu saldo ke depan)</option><option value="adm" disabled={Number(wallet.adm_due) <= 0}>ADM</option></select></label><label>Nominal (K)<input disabled={!settings?.cash_operations_enabled} type="number" min="1" step="1" value={paymentAmount} onChange={(e)=>setPaymentAmount(e.target.value)} required placeholder={paymentType === "adm" ? "Contoh: 10" : "Contoh: 5"} /></label><label>Foto bukti pembayaran<input disabled={!settings?.cash_operations_enabled} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>setProofFile(e.target.files?.[0] || null)} required /></label><button className="primary full" disabled={busy || !settings?.cash_operations_enabled}>{busy ? "Mengirim…" : "KIRIM PENGAJUAN"}</button></form></section></>}<footer>©Designed by Vergil D Ajax</footer></main>;
  }

  if (session && !profile) {
    return <main className="page-shell"><section className="panel"><Brand /><h1>Profil belum tersedia</h1><p className="intro">Sesi login aktif, tetapi profil anggota belum ditemukan. Keluar dan hubungi admin utama; jangan membuat akun ulang dengan username yang sama.</p><button className="secondary full" onClick={signOut}>Keluar</button><footer>©Designed by Vergil D Ajax</footer></section></main>;
  }

  return <main className="page-shell"><section className="panel auth-panel"><Brand /><div className="eyebrow"><span className="status-dot" /> WEBKAS FAM SOS V2</div><h1>{mode === "login" ? <>Masuk ke <span>WEBKAS</span></> : <>Daftar <span>anggota</span></>}</h1><p className="intro">{mode === "login" ? "Gunakan username dan kata sandi akun kas kamu." : "Buat akun anggota. Akses baru aktif setelah disetujui admin utama."}</p>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<form onSubmit={mode === "login" ? signIn : register} className="auth-form">{mode === "register" && <label>Nama karakter / nama IC<input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} minLength={2} maxLength={80} autoComplete="nickname" required placeholder="Nama karakter" /></label>}<label>Username<input value={username} onChange={(e)=>setUsername(e.target.value)} minLength={3} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" required placeholder="username_kamu" /></label><label>Kata sandi<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} minLength={8} maxLength={72} autoComplete={mode === "login" ? "current-password" : "new-password"} required placeholder="Minimal 8 karakter" /></label><button className="primary full" disabled={busy}>{busy ? "Memproses…" : mode === "login" ? "MASUK" : "KIRIM PENDAFTARAN"}</button></form><div className="auth-switch">{mode === "login" ? "Belum punya akun?" : "Sudah punya akun?"} <button className="text-button" onClick={()=>{setMode(mode === "login" ? "register" : "login");setError("");setMessage("");}}>{mode === "login" ? "Daftar anggota" : "Kembali masuk"}</button></div><div className="small-note">Akun baru berstatus menunggu sampai disetujui admin utama. Jangan bagikan kata sandi kepada siapa pun.</div><footer>©Designed by Vergil D Ajax</footer></section></main>;
}

function Brand({ compact = false }) {
  return <div className={"brand-mark" + (compact ? " compact" : "")}><span className="brand-icon">K</span><div><strong>WEBKAS <span>FAM SOS</span></strong><small>CATATAN KAS KELUARGA</small></div></div>;
}
