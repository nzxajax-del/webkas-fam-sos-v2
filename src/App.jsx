import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./lib/supabase.js";

const money = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value || 0)) + " UIC";
const date = (value) => value ? new Date(value + "T00:00:00+07:00").toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }) : "Belum ditetapkan";
const wibDate = (value) => { if (!value) return ""; const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)); const part = (type) => parts.find((p) => p.type === type)?.value || ""; return part("year") + "-" + part("month") + "-" + part("day"); }
const authEmail = (username) => username.trim().toLowerCase() + "@login.webkas-fam-sos.invalid";
const rankInfo = (rank) => ({ P1: { icon: "›", label: "P1", color: "#d6a34d" }, P2: { icon: "»", label: "P2", color: "#d6a34d" }, P3: { icon: "◆", label: "P3", color: "#72a9ff" }, P4: { icon: "▰▰▰", label: "P4", color: "#75c978" }, P5: { icon: "★", label: "P5", color: "#ff7373" }, P6: { icon: "★", label: "P6", color: "#f2d36d" } })[rank] || { icon: "›", label: "P1", color: "#d6a34d" };
const RankBadge = ({ rank }) => { const item = rankInfo(rank); return <span className={"rank-badge rank-" + item.label.toLowerCase()} title={"Pangkat " + item.label}><span aria-hidden="true">{item.icon}</span> {item.label}</span>; };
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
  const [branding, setBranding] = useState({ site_name: "WEBKAS FAM SOS V2", family_name: "FAM SOS", subtitle: "CATATAN KAS KELUARGA", accent_color: "#c1f45a", background_color: "#0b0e0b" });
  const [siteNameDraft, setSiteNameDraft] = useState("WEBKAS FAM SOS V2");
  const [familyNameDraft, setFamilyNameDraft] = useState("FAM SOS");
  const [subtitleDraft, setSubtitleDraft] = useState("CATATAN KAS KELUARGA");
  const [accentDraft, setAccentDraft] = useState("#c1f45a");
  const [backgroundDraft, setBackgroundDraft] = useState("#0b0e0b");
  const [memberSearch, setMemberSearch] = useState("");
  const [dailyDraft, setDailyDraft] = useState("");
  const [reportDateDraft, setReportDateDraft] = useState("");
  const [admDraft, setAdmDraft] = useState("");
  const [retentionDraft, setRetentionDraft] = useState("7");
  const [paymentType, setPaymentType] = useState("kas");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [proofFile, setProofFile] = useState(null);
  const [registrationProofFile, setRegistrationProofFile] = useState(null);
  const [registrationNote, setRegistrationNote] = useState("");
  const [balanceCorrection, setBalanceCorrection] = useState(null);
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);
  const [openMemberActions, setOpenMemberActions] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [activeSection, setActiveSection] = useState("home");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [confirmUsername, setConfirmUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newUsernameDraft, setNewUsernameDraft] = useState("");
  const [confirmNewUsername, setConfirmNewUsername] = useState("");
  const [currentPasswordDraft, setCurrentPasswordDraft] = useState("");
  const [newPasswordDraft, setNewPasswordDraft] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
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
    if (!supabase) return;
    let alive = true;
    supabase.from("app_branding_settings").select("site_name,family_name,subtitle,accent_color,background_color").eq("id",1).maybeSingle().then(({data}) => {
      if (alive && data) { setBranding(data); setSiteNameDraft(data.site_name); setFamilyNameDraft(data.family_name); setSubtitleDraft(data.subtitle); setAccentDraft(data.accent_color); setBackgroundDraft(data.background_color); }
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user) return;
    let alive = true;
    if (!profile || !wallet) setLoading(true);
    (async () => {
      const [profileRes, walletRes, settingsRes, paymentsRes] = await Promise.all([
        supabase.from("member_profiles").select("id,display_name,login_username,role,status,rank_code,profile_photo_path").eq("id", session.user.id).maybeSingle(),
        supabase.from("member_wallets").select("balance,arrears,unpaid_from,exempt_kas").eq("member_id", session.user.id).maybeSingle(),
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
          supabase.from("member_profiles").select("id,display_name,login_username,created_at,rank_code,registration_proof_path,registration_note").eq("role", "member").eq("status", "pending").order("created_at", { ascending: true }).limit(100),
          supabase.from("member_profiles").select("id,display_name,login_username,status,created_at,rank_code,profile_photo_path,registration_proof_path").eq("role", "member").order("display_name", { ascending: true }).limit(500),
          supabase.from("member_wallets").select("member_id,balance,arrears,unpaid_from,exempt_kas"),
          supabase.from("wallet_transactions").select("id,member_id,transaction_type,amount,description,created_at,member_profiles(display_name,login_username)").order("created_at", { ascending: false }).limit(100),
          supabase.from("admin_audit_log").select("id,action,target_type,target_id,details,created_at").order("created_at", { ascending: false }).limit(100),
        ]);
        if (pendingRes.error) setError("Antrean pembayaran tidak dapat dimuat. " + pendingRes.error.message);
        if (memberRes.error) setError("Antrean pendaftaran tidak dapat dimuat. " + memberRes.error.message);
        if (allMemberRes.error) setError("Daftar anggota tidak dapat dimuat. " + allMemberRes.error.message);
        if (transactionRes.error) setError("Laporan transaksi tidak dapat dimuat. " + transactionRes.error.message);
        if (auditRes.error) setError("Audit admin tidak dapat dimuat. " + auditRes.error.message);
        const walletByMember = new Map((walletListRes.data || []).map((w) => [w.member_id, w]));
        const membersWithPhotos = await withPhotoUrls(allMemberRes.data || []);
        setAdminMembers(membersWithPhotos.map((m) => ({ ...m, ...(walletByMember.get(m.id) || {}) }))
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
      setProfileNameDraft(profileRes.data?.display_name || "");
      setWallet(walletRes.data || null);
      setSettings(settingsRes.data || null);
      if (settingsRes.data) {
        setDailyDraft(String(settingsRes.data.daily_amount ?? 1000));
        setReportDateDraft(settingsRes.data.report_date || "");
        setAdmDraft(String(settingsRes.data.adm_default ?? 15000));
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

  async function withPhotoUrls(rows) {
    const paths = [...new Set((rows || []).map((row) => row.profile_photo_path).filter(Boolean))];
    if (!paths.length) return (rows || []).map((row) => ({ ...row, profile_photo_url: null }));
    const { data, error: urlError } = await supabase.storage.from("profile-photos").createSignedUrls(paths, 3600);
    const urls = new Map((data || []).map((item) => [item.path, item.signedUrl]));
    return (rows || []).map((row) => ({ ...row, profile_photo_url: urlError ? null : (urls.get(row.profile_photo_path) || null) }));
  }

  async function saveMyDisplayName() {
    if (!profile) return;
    const nextName = profileNameDraft.trim();
    if (!nextName || nextName.length > 80) { setError("Nama karakter harus 1–80 karakter."); return; }
    setBusy(true); setError(""); setMessage("");
    const { data, error: saveError } = await supabase.rpc("set_my_display_name", { p_display_name: nextName });
    if (saveError) setError("Nama karakter belum berhasil diubah: " + saveError.message);
    else {
      setProfile((old) => old ? { ...old, display_name: data?.display_name || nextName } : old);
      setProfileNameDraft(data?.display_name || nextName);
      setMessage("Nama karakter berhasil diperbarui.");
      setRefreshVersion((v) => v + 1);
    }
    setBusy(false);
  }

  async function saveAccountUsername(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const next = newUsernameDraft.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(next)) { setError("Username baru harus 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung."); setBusy(false); return; }
    if (next !== confirmNewUsername.trim().toLowerCase()) { setError("Konfirmasi username baru tidak sama."); setBusy(false); return; }
    if (!currentPasswordDraft) { setError("Masukkan kata sandi saat ini untuk verifikasi."); setBusy(false); return; }
    const { data, error: updateError } = await supabase.functions.invoke("account-settings", { body: { action: "username", username: next, confirmUsername: confirmNewUsername.trim().toLowerCase(), currentPassword: currentPasswordDraft } });
    if (updateError || data?.error) setError(data?.error || updateError?.message || "Username belum berhasil diubah.");
    else { setProfile((old)=>old?{...old,login_username:data.username||next}:old); setUsername(data.username||next); setNewUsernameDraft(""); setConfirmNewUsername(""); setCurrentPasswordDraft(""); setMessage("Username berhasil diubah. Gunakan username baru saat login berikutnya."); }
    setBusy(false);
  }

  async function saveAccountPassword(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    if (newPasswordDraft.length < 8 || newPasswordDraft.length > 72) { setError("Kata sandi baru harus 8–72 karakter."); setBusy(false); return; }
    if (newPasswordDraft !== confirmNewPassword) { setError("Konfirmasi kata sandi baru tidak sama."); setBusy(false); return; }
    if (!currentPasswordDraft) { setError("Masukkan kata sandi saat ini untuk verifikasi."); setBusy(false); return; }
    const { data, error: updateError } = await supabase.functions.invoke("account-settings", { body: { action: "password", currentPassword: currentPasswordDraft, newPassword: newPasswordDraft, confirmPassword: confirmNewPassword } });
    if (updateError || data?.error) setError(data?.error || updateError?.message || "Kata sandi belum berhasil diubah.");
    else { setNewPasswordDraft(""); setConfirmNewPassword(""); setCurrentPasswordDraft(""); setMessage("Kata sandi berhasil diubah."); }
    setBusy(false);
  }

  async function saveProfilePhoto() {
    if (!profilePhotoFile || !session?.user?.id || !profile) return;
    setBusy(true); setError(""); setMessage("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(profilePhotoFile.type)) { setError("Foto profil harus JPG, PNG, atau WEBP."); setBusy(false); return; }
    if (profilePhotoFile.size > 3 * 1024 * 1024) { setError("Ukuran foto profil maksimal 3 MB."); setBusy(false); return; }
    const ext = profilePhotoFile.type === "image/jpeg" ? "jpg" : profilePhotoFile.type === "image/png" ? "png" : "webp";
    const oldPath = profile.profile_photo_path || null;
    const newPath = session.user.id + "/" + crypto.randomUUID() + "." + ext;
    try {
      const { error: uploadError } = await supabase.storage.from("profile-photos").upload(newPath, profilePhotoFile, { upsert: false, contentType: profilePhotoFile.type, cacheControl: "0" });
      if (uploadError) throw new Error("Unggah foto profil gagal: " + uploadError.message);
      const { error: saveError } = await supabase.rpc("set_my_profile_photo_path", { p_path: newPath });
      if (saveError) {
        await supabase.storage.from("profile-photos").remove([newPath]);
        throw new Error("Foto belum dipasang: " + saveError.message);
      }
      setProfile((old) => old ? { ...old, profile_photo_path: newPath } : old);
      const { data: signed, error: signedError } = await supabase.storage.from("profile-photos").createSignedUrl(newPath, 3600);
      setProfilePhotoUrl(signedError ? null : signed?.signedUrl || null);
      setProfilePhotoFile(null);
      if (oldPath && oldPath !== newPath) {
        const { error: removeError } = await supabase.storage.from("profile-photos").remove([oldPath]);
        if (removeError) {
          setError("Foto baru sudah terpasang, tetapi foto lama belum berhasil dihapus permanen: " + removeError.message);
          setMessage("Foto profil baru aktif. Perlu ulangi pembersihan foto lama.");
        } else setMessage("Foto profil berhasil diganti. Foto lama sudah dihapus dari penyimpanan.");
      } else setMessage("Foto profil berhasil dipasang.");
      setRefreshVersion((v) => v + 1);
    } catch (err) { setError(err.message || "Foto profil gagal disimpan."); }
    finally { setBusy(false); }
  }

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
    if (normalized !== confirmUsername.trim().toLowerCase()) { setError("Konfirmasi username tidak sama."); setBusy(false); return; }
    if (password !== confirmPassword) { setError("Konfirmasi kata sandi tidak sama."); setBusy(false); return; }
    if (password.length < 8 || password.length > 72) { setError("Kata sandi harus 8–72 karakter."); setBusy(false); return; }
    if (!registrationProofFile) { setError("Unggah screenshot bukti administrasi terlebih dahulu."); setBusy(false); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(registrationProofFile.type)) { setError("Bukti administrasi harus berupa JPG, PNG, atau WEBP."); setBusy(false); return; }
    if (registrationProofFile.size > 2 * 1024 * 1024) { setError("Ukuran screenshot administrasi maksimal 2 MB."); setBusy(false); return; }
    if (registrationNote.trim().length > 500) { setError("Keterangan maksimal 500 karakter."); setBusy(false); return; }
    try {
      const proofDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Screenshot tidak dapat dibaca."));
        reader.readAsDataURL(registrationProofFile);
      });
      const comma = proofDataUrl.indexOf(",");
      if (comma < 0) throw new Error("Format screenshot tidak valid.");
      const { data, error: invokeError } = await supabase.functions.invoke("member-register", {
        body: { displayName: displayName.trim(), username: normalized, confirmUsername: confirmUsername.trim().toLowerCase(), password, confirmPassword,
          registrationProofBase64: proofDataUrl.slice(comma + 1),
          registrationProofMime: registrationProofFile.type,
          registrationNote: registrationNote.trim() },
      });
      if (invokeError) throw new Error(data?.error || invokeError.message || "Layanan pendaftaran belum dapat dihubungi.");
      if (data?.error) throw new Error(data.error);
      setMode("login"); setPassword(""); setConfirmPassword(""); setUsername(""); setConfirmUsername(""); setRegistrationProofFile(null); setRegistrationNote("");
      setMessage(data?.message || "Pendaftaran terkirim. Akun menunggu pemeriksaan bukti administrasi dan persetujuan admin.");
    } catch (err) {
      setError(err.message || "Pendaftaran gagal.");
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
      supabase.from("member_wallets").select("balance,arrears,unpaid_from,exempt_kas").eq("member_id", session.user.id).maybeSingle(),
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
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
      setError("Masukkan nominal UIC berupa bilangan bulat positif, misalnya 1000.");
      return;
    }
    if (!proofFile) { setError("Pilih foto bukti pembayaran terlebih dahulu."); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(proofFile.type)) {
      setError("Bukti harus berupa JPG, PNG, atau WEBP.");
      return;
    }
    if (proofFile.size > 5 * 1024 * 1024) { setError("Ukuran bukti maksimal 5 MB."); return; }
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

  async function openRegistrationProof(path) {
    if (!path) { setError("Anggota ini belum mengirim bukti administrasi."); return; }
    setError("");
    const { data, error: proofError } = await supabase.storage.from("registration-proofs").createSignedUrl(path, 300);
    if (proofError || !data?.signedUrl) { setError("Screenshot administrasi tidak dapat dibuka. " + (proofError?.message || "")); return; }
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
    const daily = Number(dailyDraft), adm = 0;
    if (!Number.isFinite(daily) || daily <= 0 || !Number.isInteger(daily)) {
      setError("Tarif KAS harus bilangan bulat positif."); setBusy(false); return;
    }
    const { error: saveError } = await supabase.rpc("admin_update_settings", { p_daily_amount: daily, p_adm_default: adm });
    if (saveError) setError("Pengaturan belum disimpan: " + saveError.message);
    else {
      setSettings((old) => old ? { ...old, daily_amount: daily, adm_default: adm } : old);
      setMessage("Pengaturan tarif berhasil disimpan dan tercatat di audit admin.");
    }
    setBusy(false);
  }

  async function saveBranding(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const { error: saveError } = await supabase.rpc("admin_update_branding", { p_site_name: siteNameDraft.trim(), p_family_name: familyNameDraft.trim(), p_subtitle: subtitleDraft.trim(), p_accent_color: accentDraft, p_background_color: backgroundDraft });
    if (saveError) setError("Identitas website belum tersimpan: " + saveError.message);
    else { const next = { site_name: siteNameDraft.trim(), family_name: familyNameDraft.trim(), subtitle: subtitleDraft.trim(), accent_color: accentDraft, background_color: backgroundDraft }; setBranding(next); setMessage("Identitas dan tampilan website berhasil disimpan."); }
    setBusy(false);
  }

  async function setMemberStatus(member, status) {
    const action = status === "inactive" ? "menonaktifkan" : "mengaktifkan kembali";
    if (!window.confirm("Yakin " + action + " anggota " + member.display_name + " (@" + member.login_username + ")? Riwayat kas tetap disimpan.")) return;
    const reason = window.prompt("Alasan perubahan status (minimal 5 karakter):");
    if (reason === null) return;
    setBusy(true); setError(""); setMessage("");
    const { error: actionError } = await supabase.rpc("admin_set_member_status", { p_member_id: member.id, p_status: status, p_reason: reason });
    if (actionError) setError("Status anggota belum diubah: " + actionError.message);
    else { await refreshAdminSnapshot(); setMessage("Status anggota berhasil diubah. Riwayat keuangan tetap tersimpan."); }
    setBusy(false);
  }

  async function deleteMember(member) {
    const ok = window.confirm("HAPUS PERMANEN akun @" + member.login_username + "? Tindakan ini tidak bisa dibatalkan. Akun yang memiliki riwayat keuangan akan ditolak agar ledger tetap utuh.");
    if (!ok) return;
    const confirmation = window.prompt("Ketik username persis untuk konfirmasi penghapusan permanen:", "");
    if (confirmation === null) return;
    if (confirmation.trim().toLowerCase() !== String(member.login_username || "").toLowerCase()) {
      setError("Penghapusan dibatalkan: username konfirmasi tidak cocok.");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    const { error: deleteError } = await supabase.rpc("admin_delete_member_without_financial_history", {
      p_member_id: member.id, p_confirmation_username: confirmation.trim(),
    });
    if (deleteError) {
      setError("Akun tidak dihapus: " + deleteError.message + ". Jika anggota memiliki riwayat kas, nonaktifkan akun agar catatan keuangan tetap terjaga.");
      setBusy(false); return;
    }
    const cleanupErrors = [];
    if (member.profile_photo_path) {
      const { error: photoError } = await supabase.storage.from("profile-photos").remove([member.profile_photo_path]);
      if (photoError) cleanupErrors.push("foto profil: " + photoError.message);
    }
    if (member.registration_proof_path) {
      const { error: registrationError } = await supabase.storage.from("registration-proofs").remove([member.registration_proof_path]);
      if (registrationError) cleanupErrors.push("bukti pendaftaran: " + registrationError.message);
    }
    if (cleanupErrors.length) setError("Akun sudah dihapus, tetapi berkas berikut perlu dibersihkan manual: " + cleanupErrors.join("; "));
    setOpenMemberActions(null);
    await refreshAdminSnapshot();
    setMessage("Akun anggota @" + member.login_username + " berhasil dihapus permanen karena tidak memiliki riwayat keuangan.");
    setBusy(false);
  }

  async function adjustMemberBalance(event) {
    event.preventDefault();
    if (!balanceCorrection) return;
    const member = adminMembers.find((m) => m.id === balanceCorrection.memberId);
    const amount = Number(balanceCorrection.amount);
    const reason = String(balanceCorrection.reason || "").trim();
    if (!member) { setError("Anggota untuk koreksi saldo tidak ditemukan. Segarkan daftar anggota."); return; }
    if (!Number.isFinite(amount) || amount === 0 || !Number.isInteger(amount)) { setError("Nominal koreksi harus bilangan bulat UIC bukan nol. Contoh: 2000 atau -1000."); return; }
    if (reason.length < 5 || reason.length > 500) { setError("Alasan koreksi wajib 5–500 karakter."); return; }
    const delta = amount;
    if (Number(member.balance || 0) + delta < 0) { setError("Saldo setelah koreksi tidak boleh negatif. Saldo saat ini " + money(member.balance) + "."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const { data, error: actionError } = await supabase.rpc("admin_adjust_member_balance", { p_member_id: member.id, p_delta: delta, p_reason: reason });
      if (actionError) throw new Error(actionError.message || "Database menolak koreksi saldo.");
      if (data?.success !== true) throw new Error(data?.message || "Database tidak mengonfirmasi koreksi saldo.");
      const refreshed = await refreshAdminSnapshot();
      setBalanceCorrection(null);
      if (refreshed) setMessage("Koreksi saldo berhasil dicatat dalam ledger dan audit admin. Saldo baru: " + money(data.balance) + ".");
    } catch (err) {
      setError("Koreksi saldo gagal: " + (err?.message || "Kesalahan tidak diketahui.") + " Tidak ada perubahan yang dikonfirmasi.");
    } finally { setBusy(false); }
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

  async function setMemberRank(member) {
    const nextRank = member.rank_code || "P1";
    setBusy(true); setError(""); setMessage("");
    const { error: rankError } = await supabase.rpc("admin_set_member_rank", { p_member_id: member.id, p_rank_code: nextRank });
    if (rankError) setError("Pangkat anggota belum diubah: " + rankError.message);
    else { await refreshAdminSnapshot(); setMessage("Pangkat " + member.display_name + " berhasil diubah menjadi " + nextRank + ". Perubahan tercatat di audit admin."); }
    setBusy(false);
  }

  async function refreshAdminSnapshot() {
    const [allMemberRes, walletListRes, transactionRes, auditRes] = await Promise.all([
      supabase.from("member_profiles").select("id,display_name,login_username,status,created_at,rank_code,profile_photo_path,registration_proof_path").eq("role", "member").order("display_name", { ascending: true }).limit(500),
      supabase.from("member_wallets").select("member_id,balance,arrears,unpaid_from,exempt_kas"),
      supabase.from("wallet_transactions").select("id,member_id,transaction_type,amount,description,created_at,member_profiles(display_name,login_username)").order("created_at", { ascending: false }).limit(100),
      supabase.from("admin_audit_log").select("id,action,target_type,target_id,details,created_at").order("created_at", { ascending: false }).limit(100),
    ]);
    const failed = [allMemberRes, walletListRes, transactionRes, auditRes].find((r) => r.error);
    if (failed) {
      setError("Data panel admin belum berhasil diperbarui: " + failed.error.message);
      return false;
    }
    const walletByMember = new Map((walletListRes.data || []).map((w) => [w.member_id, w]));
    const membersWithPhotos = await withPhotoUrls(allMemberRes.data || []);
    setAdminMembers(membersWithPhotos.map((m) => ({ ...m, ...(walletByMember.get(m.id) || {}) }))
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

  const filteredAdminMembers = adminMembers.filter((m) => (String(m.display_name || "") + " " + String(m.login_username || "")).toLowerCase().includes(memberSearch.trim().toLowerCase()));

  useEffect(() => {
    let alive = true;
    if (!supabase || !profile?.profile_photo_path) { setProfilePhotoUrl(null); return () => { alive = false; }; }
    supabase.storage.from("profile-photos").createSignedUrl(profile.profile_photo_path, 3600).then(({ data, error: signedError }) => {
      if (alive) setProfilePhotoUrl(signedError ? null : data?.signedUrl || null);
    });
    return () => { alive = false; };
  }, [profile?.profile_photo_path, refreshVersion]);

  useEffect(() => {
    setActiveSection("home");
    setDrawerOpen(false);
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    document.documentElement.style.setProperty("--lime", branding.accent_color || "#c1f45a");
    document.documentElement.style.setProperty("--page-bg", branding.background_color || "#0b0e0b");
    document.body.style.background = "radial-gradient(ellipse at 50% 0%, " + (branding.accent_color || "#c1f45a") + "22 0%, " + (branding.background_color || "#0b0e0b") + " 58%)";
  }, [branding]);

  if (!supabaseConfigured) {
    return <main className="page-shell"><section className="panel"><Brand branding={branding} /><h1>Hampir siap.</h1><p className="intro">Koneksi Supabase belum dikonfigurasi di environment Netlify.</p><div className="notice"><strong>Konfigurasi yang dibutuhkan</strong><p>Tambahkan <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> di pengaturan environment Netlify, lalu deploy ulang. Gunakan hanya publishable/anon key; jangan pernah menaruh service-role key di website.</p></div><footer>©Designed by Vergil D Ajax</footer></section></main>;
  }

  if (loading) return <main className="page-shell"><section className="panel"><Brand branding={branding} /><p className="intro">Memuat akun dengan aman…</p></section></main>;

  if (session && profile) {
    const isAdmin = profile.role === "admin" && profile.status === "active";
    if (profile.status === "inactive") {
      return <main className="page-shell"><section className="panel"><Brand branding={branding} /><div className="eyebrow"><span className="status-dot red" /> AKUN NONAKTIF</div><h1>Akses dinonaktifkan</h1><p className="intro">Akun ini sedang dinonaktifkan oleh admin. Riwayat dan catatan kas tetap tersimpan. Hubungi admin utama jika membutuhkan peninjauan.</p><button className="secondary full" onClick={signOut} disabled={busy}>Keluar</button><footer>©Designed by Vergil D Ajax</footer></section></main>;
    }
    if (profile.status === "pending" || profile.status === "rejected") {
      return <main className="page-shell"><section className="panel"><Brand branding={branding} /><div className="eyebrow"><span className={profile.status === "pending" ? "status-dot" : "status-dot red"} /> STATUS PENDAFTARAN</div><h1>{profile.status === "pending" ? "Menunggu persetujuan" : "Pendaftaran ditolak"}</h1><p className="intro">Halo, {profile.display_name}. {profile.status === "pending" ? "Admin utama perlu menyetujui akun sebelum fitur anggota dapat digunakan." : "Akun ini belum mendapat akses. Hubungi admin utama jika perlu peninjauan."}</p><div className="notice"><strong>Username</strong><p>{profile.login_username}</p><strong>Status</strong><p>{profile.status === "pending" ? "Menunggu persetujuan" : "Ditolak"}</p></div>{profile.status === "pending" && <section className="notice"><strong>Penyiapan admin utama</strong><p>Jika ini akun pemilik proyek dan belum ada admin sama sekali, masukkan kode bootstrap satu kali yang diberikan saat penyiapan. Jangan bagikan kode ini.</p><form className="auth-form" onSubmit={bootstrapAdmin}><label>Kode bootstrap<input type="password" value={bootstrapToken} onChange={(e)=>setBootstrapToken(e.target.value)} autoComplete="off" required placeholder="Kode satu kali" /></label><button className="primary full" disabled={busy}>{busy ? "Memproses…" : "AKTIFKAN ADMIN UTAMA"}</button></form></section>}{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<button className="secondary full" onClick={signOut} disabled={busy}>Keluar</button><footer>©Designed by Vergil D Ajax</footer></section></main>;
    }
    if (!wallet) return <main className="page-shell"><section className="panel"><Brand branding={branding} /><h1>Akun belum siap</h1><p className="intro">Profil berhasil ditemukan, tetapi dompet kas belum tersedia. Jangan lakukan pembayaran sampai admin menyelesaikan penyiapan akun.</p><button className="secondary full" onClick={signOut}>Keluar</button><footer>©Designed by Vergil D Ajax</footer></section></main>;
    return <main className="dashboard-shell" data-view={isAdmin ? (activeSection === "home" ? "admin-home" : activeSection) : (activeSection === "home" ? "member-home" : activeSection)}><header className="dashboard-header"><button className="hamburger-button" aria-label={drawerOpen ? "Tutup menu" : "Buka menu"} aria-expanded={drawerOpen} onClick={()=>setDrawerOpen((open)=>!open)}><span></span><span></span><span></span></button><Brand compact branding={branding} /><div className="review-actions"><button className="secondary" onClick={()=>setRefreshVersion((value)=>value+1)} disabled={loading}>Segarkan</button><button className="secondary" onClick={signOut} disabled={busy}>Keluar ↗</button></div></header><div className={"drawer-backdrop" + (drawerOpen ? " open" : "")} onClick={()=>setDrawerOpen(false)}></div><nav className={"app-drawer" + (drawerOpen ? " open" : "")} aria-label="Menu utama"><div className="drawer-heading"><strong>{isAdmin ? "MENU ADMIN" : "MENU ANGGOTA"}</strong><button className="drawer-close" onClick={()=>setDrawerOpen(false)} aria-label="Tutup menu">×</button></div><button className={activeSection==="home"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("home");setDrawerOpen(false);}}>Beranda</button>{isAdmin ? <><button className={activeSection==="admin-registrations"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("admin-registrations");setDrawerOpen(false);}}>Pendaftaran anggota</button><button className={activeSection==="admin-payments"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("admin-payments");setDrawerOpen(false);}}>Pengajuan pembayaran</button><button className={activeSection==="admin-members"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("admin-members");setDrawerOpen(false);}}>Manajemen anggota</button><button className={activeSection==="admin-settings"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("admin-settings");setDrawerOpen(false);}}>Pengaturan</button><button className={activeSection==="admin-transactions"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("admin-transactions");setDrawerOpen(false);}}>Transaksi</button><button className={activeSection==="admin-audit"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("admin-audit");setDrawerOpen(false);}}>Audit aktivitas</button></> : <><button className={activeSection==="member-payments"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("member-payments");setDrawerOpen(false);}}>Pengajuan pembayaran</button><button className={activeSection==="member-history"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("member-history");setDrawerOpen(false);}}>Riwayat pengajuan</button><button className={activeSection==="member-settings"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("member-settings");setDrawerOpen(false);}}>Pengaturan profil</button></>}</nav><section className="welcome-panel"><div className="eyebrow">AKUN {isAdmin ? "ADMIN" : "ANGGOTA"} · {profile.status === "active" ? "AKTIF" : profile.status.toUpperCase()}</div><h1>Halo, <span>{profile.display_name}</span></h1><div className="welcome-profile-row"><div className="profile-avatar-wrap">{profilePhotoUrl ? <img className="profile-avatar" src={profilePhotoUrl} alt={"Foto profil " + profile.display_name} /> : <span className="profile-avatar-fallback">{String(profile.display_name || "?").slice(0,1).toUpperCase()}</span>}</div><div className="welcome-profile-details"><RankBadge rank={profile.rank_code || "P1"} /><span className="welcome-status"><span className="status-dot" /> Status: Aktif</span></div></div><p className="muted">Selamat datang kembali di {branding.family_name || "komunitas"}.</p></section>{isAdmin && !settings?.cash_operations_enabled && <div className="notice admin-safe-notice"><strong>MODE UJI AMAN — OPERASI KAS TERKUNCI</strong><p>Pengajuan dan persetujuan pembayaran serta pemrosesan harian belum dibuka sampai pengujian regresi selesai.</p></div>}{isAdmin ? <><div className="admin-layout"><div className="admin-content"><section id="admin-registrations" className="panel history-panel"><div className="section-head"><div><div className="eyebrow">PANEL ADMIN</div><h2>Pendaftaran anggota</h2></div><span className="pill">{pendingMembers.length} menunggu</span></div><p className="muted">Periksa screenshot bukti administrasi dan keterangan opsional sebelum menyetujui akun. Bukti administrasi tidak dihitung otomatis sebagai tagihan.</p>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}{pendingMembers.length ? <div className="table-wrap"><table><thead><tr><th>Nama karakter</th><th>Username</th><th>Tanggal</th><th>Bukti administrasi</th><th>Keterangan</th><th>Keputusan</th></tr></thead><tbody>{pendingMembers.map((m)=><tr key={m.id}><td>{m.display_name}</td><td>{m.login_username}</td><td>{date(wibDate(m.created_at))}</td><td><button className="secondary" disabled={!m.registration_proof_path} onClick={()=>openRegistrationProof(m.registration_proof_path)}>{m.registration_proof_path ? "Lihat screenshot" : "Belum ada bukti"}</button></td><td>{m.registration_note?.trim() || "—"}</td><td><div className="review-actions"><button className="primary" disabled={busy || !m.registration_proof_path} onClick={()=>reviewMember(m.id,"active")}>Setujui</button><button className="secondary" disabled={busy} onClick={()=>reviewMember(m.id,"rejected")}>Tolak</button></div></td></tr>)}</tbody></table></div> : <p className="muted">Tidak ada pendaftaran anggota yang menunggu.</p>}</section><section id="admin-payments" className="panel history-panel"><div className="section-head"><div><div className="eyebrow">PANEL ADMIN</div><h2>Antrean pembayaran</h2></div><span className="pill">{pendingPayments.length} menunggu</span></div>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<label>Catatan pemeriksaan (opsional)<input value={reviewNote} onChange={(e)=>setReviewNote(e.target.value)} maxLength={500} placeholder="Catatan untuk keputusan berikutnya" /></label>{pendingPayments.length ? <div className="table-wrap"><table><thead><tr><th>Anggota</th><th>Jenis</th><th>Nominal</th><th>Tanggal</th><th>Bukti</th><th>Keputusan</th></tr></thead><tbody>{pendingPayments.map((p)=><tr key={p.id}><td>{p.member_profiles?.display_name || p.member_id}<br/><small>{p.member_profiles?.login_username || ""}</small></td><td>KAS</td><td>{money(p.amount)}</td><td>{date(p.created_at.slice(0,10))}</td><td><button className="secondary" onClick={()=>openProof(p.proof_path)}>Lihat bukti</button></td><td><div className="review-actions"><button className="primary" disabled={busy || !settings?.cash_operations_enabled} onClick={()=>reviewPayment(p.id,"approved")}>Setujui</button><button className="secondary" disabled={busy} onClick={()=>reviewPayment(p.id,"rejected")}>Tolak</button></div></td></tr>)}</tbody></table></div> : <p className="muted">Tidak ada pengajuan yang menunggu pemeriksaan.</p>}</section><section id="admin-members" className="panel history-panel"><div className="section-head"><div><div className="eyebrow">ADMIN · MASTER DATA</div><h2>Manajemen anggota</h2></div><span className="pill">{adminMembers.length} anggota</span><button className="secondary" onClick={()=>downloadCsv("webkas-anggota.csv", [["Nama","Username","Status","Saldo (UIC)","Tunggakan (UIC)","Belum bayar dari","Bebas KAS"], ...adminMembers.map((m)=>[m.display_name,m.login_username,m.status,m.balance,m.arrears,m.unpaid_from,m.exempt_kas?"Ya":"Tidak"])])}>Ekspor CSV</button></div><p className="muted">Cari anggota, ubah nama, status, pengecualian KAS, pangkat, atau koreksi saldo saldo UIC. Semua koreksi dicatat ke ledger dan audit admin.</p>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<label className="member-search">Cari anggota<input type="search" value={memberSearch} onChange={(e)=>setMemberSearch(e.target.value)} placeholder="Cari nama atau username, misalnya Vergil" /></label><div className="stats-grid"><article className="stat"><span>Total tunggakan KAS</span><strong className="amount-danger">{money(adminMembers.filter((m)=>m.status==="active").reduce((sum,m)=>sum+Number(m.arrears||0),0))}</strong><small>Anggota aktif</small></article><article className="stat"><span>Tunggakan 7.000 UIC ke atas</span><strong>{adminMembers.filter((m)=>m.status==="active" && Number(m.arrears||0)>=7000).length}</strong><small>Ditampilkan lebih dahulu</small></article></div>{adminMembers.filter((m)=>m.status==="active" && Number(m.arrears||0)>=7000).length ? <div className="notice"><strong>Prioritas penagihan · 7.000 UIC ke atas</strong><ul>{adminMembers.filter((m)=>m.status==="active" && Number(m.arrears||0)>=7000).map((m)=><li key={m.id}>{m.display_name} — <strong>{money(m.arrears)}</strong></li>)}</ul></div>:null}{filteredAdminMembers.length ? <div className="member-card-grid">{filteredAdminMembers.map((m)=>{const rankNames={P1:"Anggota",P2:"Senior",P3:"Spesialis",P4:"Mayor",P5:"Bintang",P6:"Emas"};return <article className="member-card" key={m.id}><div className="member-card-top"><div className="member-avatar-frame">{m.profile_photo_url ? <img className="member-avatar" src={m.profile_photo_url} alt={"Foto "+m.display_name} /> : <span className="member-avatar-fallback">{String(m.display_name||"?").slice(0,1).toUpperCase()}</span>}</div><div className="member-card-details"><div className="member-rank-line"><RankBadge rank={m.rank_code || "P1"} /><span className="member-rank-name">{rankNames[m.rank_code || "P1"] || "Anggota"}</span></div><div className="member-name-bar"><strong className="member-character-name">{m.display_name}</strong><button className="member-menu-toggle member-menu-icon-only" aria-label={"Pengaturan anggota "+m.display_name} title="Pengaturan anggota" aria-expanded={openMemberActions===m.id} onClick={()=>setOpenMemberActions((current)=>current===m.id?null:m.id)}><span className="member-menu-lines" aria-hidden="true">☰</span></button></div><small className="muted">@{m.login_username} · {m.status === "active" ? "Aktif" : m.status === "pending" ? "Menunggu" : m.status === "inactive" ? "Nonaktif" : "Ditolak"}</small></div></div><div className="member-finance-row"><div><span>Saldo</span><strong>{money(m.balance)}</strong></div><div><span>Tunggakan</span><strong className={Number(m.arrears||0)>0?"amount-danger":""}>{money(m.arrears)}</strong></div></div>{openMemberActions===m.id && <div className="member-modal-backdrop" onClick={(e)=>{if(e.target===e.currentTarget){setOpenMemberActions(null);setBalanceCorrection(null);}}}><div className="member-modal" role="dialog" aria-modal="true" aria-label={"Pengaturan anggota "+m.display_name} onClick={(e)=>e.stopPropagation()}><div className="member-modal-head"><div><div className="eyebrow">PENGATURAN ANGGOTA</div><h3>{m.display_name}</h3><small>@{m.login_username}</small></div><button type="button" className="modal-close" aria-label="Tutup pengaturan anggota" onClick={()=>{setOpenMemberActions(null);setBalanceCorrection(null);}}>×</button></div>{balanceCorrection?.memberId===m.id ? <form className="balance-correction-form" onSubmit={adjustMemberBalance}><div className="section-head"><div><div className="eyebrow">KOREKSI SALDO</div><h3>{balanceCorrection.displayName}</h3></div><button type="button" className="secondary" disabled={busy} onClick={()=>setBalanceCorrection(null)}>Kembali</button></div><p className="muted">Saldo saat ini: <strong>{money(balanceCorrection.balance)}</strong>. Angka positif menambah saldo, angka negatif mengurangi. Koreksi tercatat di ledger dan audit.</p><label>Nominal koreksi (UIC)<input type="number" value={balanceCorrection.amount} onChange={(e)=>setBalanceCorrection((v)=>({...v,amount:e.target.value}))} step="1" required placeholder="Contoh: 2000 atau -1000" /></label><label>Alasan koreksi<input value={balanceCorrection.reason} onChange={(e)=>setBalanceCorrection((v)=>({...v,reason:e.target.value}))} minLength={5} maxLength={500} required placeholder="Minimal 5 karakter" /></label><button className="primary" disabled={busy}>{busy ? "Menyimpan koreksi…" : "KONFIRMASI KOREKSI SALDO"}</button></form> : <div className="member-actions-panel"><label>Pangkat<select aria-label={"Pangkat "+m.login_username} value={m.rank_code || "P1"} onChange={(e)=>setAdminMembers((rows)=>rows.map((r)=>r.id===m.id?{...r,rank_code:e.target.value}:r))}><option value="P1">P1 · Anggota</option><option value="P2">P2 · Senior</option><option value="P3">P3 · Spesialis</option><option value="P4">P4 · Mayor</option><option value="P5">P5 · Bintang</option><option value="P6">P6 · Emas</option></select></label><button className="secondary" disabled={busy || m.status!=="active"} onClick={()=>setMemberRank(m)}>Simpan pangkat</button><label className="member-exempt-toggle"><input type="checkbox" checked={Boolean(m.exempt_kas)} onChange={(e)=>setAdminMembers((rows)=>rows.map((r)=>r.id===m.id?{...r,exempt_kas:e.target.checked}:r))}/> Bebas KAS</label><button className="secondary" disabled={busy} onClick={()=>saveMember(m)}>Simpan pengaturan KAS</button><div className="member-actions-buttons"><button className="secondary" disabled={busy || !["active","inactive"].includes(m.status)} onClick={()=>setMemberStatus(m,m.status === "active" ? "inactive" : "active")}>{m.status === "active" ? "Nonaktifkan anggota" : "Aktifkan anggota"}</button><button className="secondary" disabled={busy} onClick={()=>{setError("");setMessage("");setBalanceCorrection({memberId:m.id,displayName:m.display_name,username:m.login_username,balance:Number(m.balance||0),amount:"",reason:""});}}>Koreksi saldo</button></div><button className="danger-button" disabled={busy || m.id===profile.id} onClick={()=>deleteMember(m)}>Hapus permanen akun</button><small className="muted">Penghapusan hanya diizinkan jika belum ada transaksi, pengajuan pembayaran, atau log tagihan. Jika ada riwayat, gunakan nonaktifkan agar pembukuan tetap utuh.</small></div>}</div></div>}</article>})}</div> :<p className="muted">{adminMembers.length ? "Tidak ada anggota yang cocok dengan pencarian." : "Belum ada anggota terdaftar."}</p>}</section>
<section id="admin-settings" className="panel history-panel"><div className="eyebrow">ADMIN · PENGATURAN</div><h2>Pengaturan iuran KAS</h2><p className="muted">Tarif baru berlaku mulai hari berikutnya. Tarif hari lampau tetap mengikuti riwayat tarif. Tanggal rekap hanya dapat dimajukan setelah seluruh pengujian kas lulus.</p><div className="stats-grid"><article className="stat"><span>Tanggal rekap saat ini</span><strong className="date-value">{date(settings?.report_date)}</strong><small>Zona waktu WIB</small></article><article className="stat"><span>Operasi kas</span><strong>{settings?.cash_operations_enabled ? "Terbuka" : "Terkunci"}</strong><small>Penguncian keamanan database</small></article></div><form className="auth-form" onSubmit={saveReportDate}><label>Tanggal rekap<input type="date" value={reportDateDraft} onChange={(e)=>setReportDateDraft(e.target.value)} disabled={!settings?.cash_operations_enabled} required/></label><button className="primary full" disabled={busy || !settings?.cash_operations_enabled}>{busy ? "Memproses…" : "SIMPAN TANGGAL & PROSES CATCH-UP"}</button>{!settings?.cash_operations_enabled && <small className="muted">Terkunci sampai pengujian kas lulus.</small>}</form><form className="auth-form" onSubmit={saveBranding}><div className="eyebrow">IDENTITAS & TEMA WEBSITE</div><label>Nama website<input value={siteNameDraft} onChange={(e)=>setSiteNameDraft(e.target.value)} minLength={3} maxLength={80} required placeholder="WEBKAS FAM VALKYRIE" /></label><label>Nama keluarga / komunitas<input value={familyNameDraft} onChange={(e)=>setFamilyNameDraft(e.target.value)} minLength={2} maxLength={60} required placeholder="FAM VALKYRIE" /></label><label>Teks kecil / subtitle<input value={subtitleDraft} onChange={(e)=>setSubtitleDraft(e.target.value)} minLength={2} maxLength={80} required placeholder="CATATAN KAS KELUARGA" /></label><div className="color-settings"><label>Warna aksen<input type="color" value={accentDraft} onChange={(e)=>setAccentDraft(e.target.value)} /></label><label>Warna latar belakang<input type="color" value={backgroundDraft} onChange={(e)=>setBackgroundDraft(e.target.value)} /></label></div><button className="primary full" disabled={busy}>{busy ? "Menyimpan…" : "SIMPAN IDENTITAS & TEMA"}</button></form><form className="auth-form" onSubmit={saveSettings}><label>Tarif iuran harian (UIC per hari)<input type="number" min="1" step="1" value={dailyDraft} onChange={(e)=>setDailyDraft(e.target.value)} required/></label><div className="notice"><strong>Administrasi pendaftaran</strong><p>Tidak dihitung sebagai tagihan otomatis. Anggota mengirim screenshot dan keterangan opsional pada formulir pendaftaran; admin memeriksa secara manual.</p></div><button className="primary full" disabled={busy}>{busy ? "Menyimpan…" : "SIMPAN TARIF KAS"}</button></form><form className="auth-form" onSubmit={saveProofRetention}><label>Hapus bukti pembayaran setelah<select value={retentionDraft} onChange={(e)=>setRetentionDraft(e.target.value)} required><option value="3">3 hari</option><option value="7">7 hari</option><option value="30">30 hari</option></select></label><button className="primary full" disabled={busy}>{busy ? "Menyimpan…" : "SIMPAN RETENSI BUKTI"}</button></form><button className="secondary full" onClick={cleanupProofs} disabled={busy}>{busy ? "Memproses…" : "BERSIHKAN BUKTI KEDALUWARSA"}</button><small className="muted">Pembersihan manual memakai retensi di atas dan selalu mempertahankan bukti pengajuan yang masih menunggu keputusan. Penjadwalan otomatis belum diaktifkan.</small></section>
<section id="admin-transactions" className="panel history-panel"><div className="section-head"><div><div className="eyebrow">ADMIN · LAPORAN</div><h2>Transaksi kas terbaru</h2></div><span className="pill">{adminTransactions.length} transaksi</span><button className="secondary" onClick={()=>downloadCsv("webkas-transaksi.csv", [["Tanggal","Anggota","Username","Jenis","Nominal","Keterangan"], ...adminTransactions.map((t)=>[t.created_at,t.member_profiles?.display_name,t.member_profiles?.login_username,t.transaction_type,t.amount,t.description])])}>Ekspor CSV</button></div>{adminTransactions.length ? <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Anggota</th><th>Jenis</th><th>Nominal</th><th>Keterangan</th></tr></thead><tbody>{adminTransactions.map((t)=><tr key={t.id}><td>{date(t.created_at.slice(0,10))}</td><td>{t.member_profiles?.display_name || t.member_id}</td><td>{t.transaction_type}</td><td>{money(t.amount)}</td><td>{t.description || "—"}</td></tr>)}</tbody></table></div>:<p className="muted">Belum ada transaksi yang tercatat di database V2.</p>}</section>
<section id="admin-audit" className="panel history-panel"><div className="section-head"><div><div className="eyebrow">ADMIN · KEAMANAN</div><h2>Audit aktivitas admin</h2></div><span className="pill">{adminAudit.length} catatan</span><button className="secondary" onClick={()=>downloadCsv("webkas-audit-admin.csv", [["Waktu","Aksi","Target","ID Target","Detail"], ...adminAudit.map((a)=>[a.created_at,a.action,a.target_type,a.target_id,JSON.stringify(a.details||{})])])}>Ekspor CSV</button></div>{adminAudit.length ? <div className="table-wrap"><table><thead><tr><th>Waktu</th><th>Aksi</th><th>Target</th><th>Detail</th></tr></thead><tbody>{adminAudit.map((a)=><tr key={a.id}><td>{new Date(a.created_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})}</td><td>{a.action}</td><td>{a.target_type || "—"} {a.target_id || ""}</td><td><code>{JSON.stringify(a.details || {})}</code></td></tr>)}</tbody></table></div>:<p className="muted">Belum ada catatan audit.</p>}</section><section className="notice"><strong>Pembukuan otomatis</strong><p>Pembayaran UIC melunasi tunggakan terlebih dahulu; sisa nominal masuk ke saldo. Setiap keputusan dicatat dalam audit log.</p>{!settings?.cash_operations_enabled && <p><strong>Mode aman aktif:</strong> persetujuan pembayaran masih dikunci sampai tes regresi kas selesai. Penolakan tetap tersedia.</p>}</section></div></div></> : <><div className="stats-grid member-stats"><article className="stat"><span>Saldo UIC</span><strong>{money(wallet.balance)}</strong><small>Saldo tersedia</small></article><article className="stat"><span>Tunggakan Kas</span><strong className={Number(wallet.arrears) > 0 ? "amount-danger" : ""}>{money(wallet.arrears)}</strong><small>{Number(wallet.arrears) > 0 ? "Belum tertutup" : "Tidak ada tunggakan tercatat"}</small></article></div><section id="member-history" className="panel history-panel"><div className="section-head"><div><div className="eyebrow">RIWAYAT PENGAJUAN</div><h2>Pembayaran saya</h2></div><span className="pill">{payments.length} terbaru</span></div>{payments.length ? <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Nominal</th><th>Status</th><th>Catatan admin</th></tr></thead><tbody>{payments.map((p) => <tr key={p.id}><td>{date(p.created_at.slice(0,10))}</td><td>{money(p.amount)}</td><td><span className={"pill " + p.status}>{p.status === "approved" ? "Diterima" : p.status === "rejected" ? "Ditolak" : "Menunggu"}</span></td><td>{p.review_note || "—"}</td></tr>)}</tbody></table></div> : <p className="muted">Belum ada pengajuan pembayaran.</p>}</section><section id="member-settings" className="panel history-panel"><div className="eyebrow">AKUN SAYA</div><h2>Pengaturan profil</h2><p className="muted">Atur nama karakter dan foto profil dari menu ini. Perubahan nama hanya dilakukan oleh pemilik akun.</p>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<div className="profile-photo-settings"><div className="profile-avatar-wrap">{profilePhotoUrl ? <img className="profile-avatar" src={profilePhotoUrl} alt={"Foto profil " + profile.display_name} /> : <span className="profile-avatar-fallback">{String(profile.display_name || "?").slice(0,1).toUpperCase()}</span>}</div><div className="profile-photo-controls"><RankBadge rank={profile.rank_code || "P1"} /><label>Nama karakter<input value={profileNameDraft} onChange={(e)=>setProfileNameDraft(e.target.value)} maxLength={80} required /></label><button className="secondary" disabled={busy || !profileNameDraft.trim() || profileNameDraft.trim()===profile.display_name} onClick={saveMyDisplayName}>{busy ? "Menyimpan…" : "SIMPAN NAMA SAYA"}</button><label>Foto profil (JPG/PNG/WEBP, maks. 3 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>setProfilePhotoFile(e.target.files?.[0] || null)} /></label><button className="secondary" disabled={busy || !profilePhotoFile} onClick={saveProfilePhoto}>{busy ? "Menyimpan…" : profile.profile_photo_path ? "GANTI FOTO PROFIL" : "PASANG FOTO PROFIL"}</button><small className="muted">Saat diganti, foto lama langsung dihapus dari penyimpanan.</small></div></div><div className="account-security-settings"><h3>Ganti username</h3><p className="muted">Ketik username baru dua kali dan verifikasi dengan kata sandi saat ini.</p><form className="auth-form" onSubmit={saveAccountUsername}><label>Username baru<input value={newUsernameDraft} onChange={(e)=>setNewUsernameDraft(e.target.value)} minLength={3} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" required placeholder="username_baru" /></label><label>Konfirmasi username baru<input value={confirmNewUsername} onChange={(e)=>setConfirmNewUsername(e.target.value)} minLength={3} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" required placeholder="Ketik ulang username baru" /></label><label>Kata sandi saat ini<input type="password" value={currentPasswordDraft} onChange={(e)=>setCurrentPasswordDraft(e.target.value)} autoComplete="current-password" required /></label><button className="secondary" disabled={busy}>{busy ? "Menyimpan…" : "SIMPAN USERNAME"}</button></form><h3>Ganti kata sandi</h3><p className="muted">Kata sandi baru harus diketik ulang untuk mencegah salah ketik.</p><form className="auth-form" onSubmit={saveAccountPassword}><label>Kata sandi saat ini<input type="password" value={currentPasswordDraft} onChange={(e)=>setCurrentPasswordDraft(e.target.value)} autoComplete="current-password" required /></label><label>Kata sandi baru<input type="password" value={newPasswordDraft} onChange={(e)=>setNewPasswordDraft(e.target.value)} minLength={8} maxLength={72} autoComplete="new-password" required placeholder="Minimal 8 karakter" /></label><label>Konfirmasi kata sandi baru<input type="password" value={confirmNewPassword} onChange={(e)=>setConfirmNewPassword(e.target.value)} minLength={8} maxLength={72} autoComplete="new-password" required placeholder="Ketik ulang kata sandi baru" /></label><button className="secondary" disabled={busy}>{busy ? "Menyimpan…" : "GANTI KATA SANDI"}</button></form></div></section><section id="member-payments" className="panel history-panel"><div className="eyebrow">KIRIM PEMBAYARAN</div><h2>Ajukan pembayaran</h2><p className="muted">Nominal dimasukkan dalam UIC (misalnya 1000 UIC). Bukti bersifat privat dan hanya dapat dilihat oleh kamu serta admin.</p>{!settings?.cash_operations_enabled && <div className="notice"><strong>Mode aman aktif</strong><p>Pengajuan pembayaran belum dibuka sampai pengujian kas selesai. Jangan mengirim pembayaran melalui website untuk sementara.</p></div>}{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<form className="auth-form" onSubmit={submitPayment}><label>Jenis pembayaran<select disabled={!settings?.cash_operations_enabled} value="kas" onChange={()=>setPaymentType("kas")}><option value="kas">KAS (melunasi tunggakan dahulu, sisanya menjadi saldo)</option></select></label><label>Nominal pembayaran (UIC)<input disabled={!settings?.cash_operations_enabled} type="number" min="1" step="1" value={paymentAmount} onChange={(e)=>setPaymentAmount(e.target.value)} required placeholder="Contoh: 1000" /></label><label>Foto bukti pembayaran<input disabled={!settings?.cash_operations_enabled} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>setProofFile(e.target.files?.[0] || null)} required /></label><button className="primary full" disabled={busy || !settings?.cash_operations_enabled}>{busy ? "Mengirim…" : "KIRIM PENGAJUAN"}</button></form></section></>}<footer>©Designed by Vergil D Ajax</footer></main>;
  }

  if (session && !profile) {
    return <main className="page-shell"><section className="panel"><Brand branding={branding} /><h1>Profil belum tersedia</h1><p className="intro">Sesi login aktif, tetapi profil anggota belum ditemukan. Keluar dan hubungi admin utama; jangan membuat akun ulang dengan username yang sama.</p><button className="secondary full" onClick={signOut}>Keluar</button><footer>©Designed by Vergil D Ajax</footer></section></main>;
  }

  return <main className="page-shell"><section className="panel auth-panel"><Brand branding={branding} /><div className="eyebrow"><span className="status-dot" /> WEBKAS FAM SOS V2</div><h1>{mode === "login" ? <>Masuk ke <span>WEBKAS</span></> : <>Daftar <span>anggota</span></>}</h1><p className="intro">{mode === "login" ? "Gunakan username dan kata sandi akun kas kamu." : "Buat akun anggota. Akses baru aktif setelah disetujui admin utama."}</p>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<form onSubmit={mode === "login" ? signIn : register} className="auth-form">{mode === "register" && <label>Nama karakter / nama IC<input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} minLength={2} maxLength={80} autoComplete="nickname" required placeholder="Nama karakter" /></label>}<label>Username<input value={username} onChange={(e)=>setUsername(e.target.value)} minLength={3} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" required placeholder="username_kamu" /></label>{mode === "register" && <label>Ulangi username<input value={confirmUsername} onChange={(e)=>setConfirmUsername(e.target.value)} minLength={3} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" required placeholder="Ketik ulang username" /></label>}<label>Kata sandi<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} minLength={8} maxLength={72} autoComplete={mode === "login" ? "current-password" : "new-password"} required placeholder="Minimal 8 karakter" /></label>{mode === "register" && <label>Ulangi kata sandi<input type="password" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} minLength={8} maxLength={72} autoComplete="new-password" required placeholder="Ketik ulang kata sandi" /></label>}{mode === "register" && <><div className="notice registration-proof-notice"><strong>Persyaratan administrasi</strong><p>Unggah screenshot bukti administrasi untuk diperiksa admin. Bukti ini tidak otomatis dihitung sebagai tagihan atau saldo.</p></div><label>Screenshot bukti administrasi<input type="file" accept="image/jpeg,image/png,image/webp" required onChange={(e)=>setRegistrationProofFile(e.target.files?.[0] || null)} /><small className="muted">JPG, PNG, atau WEBP · maksimal 2 MB.</small></label><label>Keterangan (opsional)<textarea value={registrationNote} onChange={(e)=>setRegistrationNote(e.target.value)} maxLength={500} rows={3} placeholder="Boleh dikosongkan. Contoh: keterangan pembayaran." /></label></>}<button className="primary full" disabled={busy}>{busy ? "Memproses…" : mode === "login" ? "MASUK" : "KIRIM PENDAFTARAN"}</button></form><div className="auth-switch">{mode === "login" ? "Belum punya akun?" : "Sudah punya akun?"} <button className="text-button" onClick={()=>{setMode(mode === "login" ? "register" : "login");setError("");setMessage("");}}>{mode === "login" ? "Daftar anggota" : "Kembali masuk"}</button></div><div className="small-note">Akun baru berstatus menunggu sampai disetujui admin utama. Jangan bagikan kata sandi kepada siapa pun.</div><footer>©Designed by Vergil D Ajax</footer></section></main>;
}

function Brand({ compact = false, branding }) {
  const family = branding?.family_name || "FAM SOS";
  const site = branding?.site_name || "WEBKAS FAM SOS V2";
  return <div className={"brand-mark" + (compact ? " compact" : "")}><span className="brand-icon">{family.replace(/[^A-Za-z0-9]/g, "").slice(0,1).toUpperCase() || "K"}</span><div><strong>{site}</strong><small>{family} · {branding?.subtitle || "CATATAN KAS KELUARGA"}</small></div></div>;
}
