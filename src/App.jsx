import { useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured, createTemporarySupabaseClient } from "./lib/supabase.js";

const money = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value || 0)) + " UIC";
const dailyRateForRank = (dailyAmount, rank) => ["P5", "P6", "P7"].includes(rank) ? 0 : rank === "P3" ? Math.round(Number(dailyAmount || 0) * 0.8 * 100) / 100 : rank === "P4" ? Number(dailyAmount || 0) / 2 : Number(dailyAmount || 0);
const date = (value) => value ? new Date(value + "T00:00:00+07:00").toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }) : "Belum ditetapkan";
const wibDate = (value) => { if (!value) return ""; const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)); const part = (type) => parts.find((p) => p.type === type)?.value || ""; return part("year") + "-" + part("month") + "-" + part("day"); }
const authEmail = (username) => username.trim().toLowerCase() + "@login.webkas-fam-sos.invalid";
const rankNames = { P1: "Newbie", P2: "Soldier", P3: "Captain", P4: "Right Hand", P5: "UnderBoss", P6: "Boss", P7: "VIP" };
const rankOrder = { P6: 0, P5: 1, P4: 2, P7: 3, P3: 4, P2: 5, P1: 6 };
const normalizeRankCode = (rank) => { const code = String(rank || "P1").trim().toUpperCase(); return Object.prototype.hasOwnProperty.call(rankOrder, code) ? code : "P1"; };
const rankDisplayLabel = (rank, includeCode = false) => { const code = normalizeRankCode(rank); if (code === "P7") return "VIP"; const name = rankNames[code] || "Anggota"; return includeCode ? code + " · " + name : name; };
const compareMemberRank = (a, b) => (rankOrder[normalizeRankCode(a.rank_code)] ?? 7) - (rankOrder[normalizeRankCode(b.rank_code)] ?? 7) || Number(b.arrears || 0) - Number(a.arrears || 0) || String(a.display_name || "").localeCompare(String(b.display_name || ""));
const rankInfo = (rank) => ({ P1: { label: "P1", color: "#d6a34d" }, P2: { label: "P2", color: "#d6a34d" }, P3: { label: "P3", color: "#72a9ff" }, P4: { label: "P4", color: "#75c978" }, P5: { label: "P5", color: "#ff7373" }, P6: { label: "P6", color: "#f2d36d" }, P7: { label: "VIP", color: "#f2d36d" } })[rank] || { label: "P1", color: "#d6a34d" };
const RankSymbol = ({ rank }) => {
  const common = { viewBox: "0 0 48 54", "aria-hidden": "true", className: "rank-symbol rank-emblem rank-emblem-" + String(rank).toLowerCase() };
  const frame = <path className="emblem-frame" d="M24 2 43 10v17c0 11-8 19-19 25C13 46 5 38 5 27V10Z" />;
  if (rank === "P1") return <svg {...common}>{frame}<path className="emblem-symbol" d="M24 44V25M24 29C16 29 12 23 12 16c8 0 13 4 12 13ZM24 25c0-9 5-14 14-14 0 9-5 14-14 14Z" /><path className="emblem-detail" d="M24 32c-5-5-10-6-15-4 2 6 7 9 15 9M24 32c5-5 10-6 15-4-2 6-7 9-15 9M19 48h10" /><circle className="emblem-detail-fill" cx="24" cy="24" r="3" /></svg>;
  if (rank === "P2") return <svg {...common}>{frame}<path className="emblem-symbol" d="M24 43V12M15 21 24 12l9 9M18 25 24 19l6 6" /><path className="emblem-detail" d="M10 45h28M18 35l6 6 6-6" /></svg>;
  if (rank === "P3") return <svg {...common}>{frame}<path className="emblem-detail" d="M24 10 27.5 18 36 19 29.5 25 31 34 24 30 17 34 18.5 25 12 19 20.5 18Z" /><path className="emblem-symbol" d="m13 29 22 12M35 29 13 41M11 28l4-4 4 4-4 4ZM29 41l4-4 4 4-4 4Z" /></svg>;
  if (rank === "P4") return <svg {...common}>{frame}<path className="emblem-symbol" d="M24 14v22M15 19h18M18 19 12 31h12ZM30 19l-6 12h12ZM16 38h16M20 42h8" /><path className="emblem-detail" d="M24 10v4M12 31q6 6 12 0M24 31q6 6 12 0" /></svg>;
  if (rank === "P5") return <svg {...common}>{frame}<path className="emblem-symbol" d="M24 7 20 27h-7l11 19 11-19h-7Z" /><path className="emblem-detail" d="M24 7v39M17 27h14M20 33h8M21 37h6M20 27l4-20 4 20" /></svg>;
  if (rank === "P6") return <svg {...common}>{frame}<path className="emblem-detail" d="m12 17 2-10 8 6 2-8 3 8 8-6 1 10Z" /><path className="emblem-detail-fill" d="m12 17 2-10 8 6 2-8 3 8 8-6 1 10Z" /><path className="emblem-symbol" d="M12 24 17 18l7 4 7-4 5 6-2 12-5 4H19l-5-4Z" /><path className="emblem-cutout" d="M15 27h6v6h-6zM27 27h6v6h-6zM21 36h6l-3 3Z" /><path className="emblem-detail" d="m13 17 4-3 7 4 7-4 4 3M18 44v3M24 44v3M30 44v3" /></svg>;
  if (rank === "P7") return <svg {...common}><defs><linearGradient id="vip-shield-metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#fff1a8" /><stop offset="28%" stopColor="#c58b20" /><stop offset="52%" stopColor="#fff0a0" /><stop offset="76%" stopColor="#9a6511" /><stop offset="100%" stopColor="#f8d96b" /></linearGradient></defs><path className="emblem-frame vip-shield-frame" d="M24 2 43 10v17c0 11-8 19-19 25C13 46 5 38 5 27V10Z" /><path className="emblem-symbol vip-shield-inner" d="M24 7 38 13v14c0 8-6 15-14 20-8-5-14-12-14-20V13Z" /><text className="vip-shield-text" x="24" y="30" textAnchor="middle">VIP</text><path className="emblem-detail vip-shield-detail" d="M15 35h18" /></svg>;
  return <svg {...common}>{frame}<path className="emblem-symbol" d="M14 20h20v14H14zM18 16h12v4M18 34v4M30 34v4" /></svg>;
};
const DrawerIcon = ({ name }) => {
  const shapes = {
    info: ["M12 8h.01", "M11 12h1v4h1", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z"],
    home: ["m3 10 9-7 9 7", "M5 9v12h14V9", "M9 21v-7h6v7"],
    permit: ["M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z", "m9 12 2 2 4-4"],
    chat: ["M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5Z", "M8 11h.01", "M12 11h.01", "M16 11h.01"],
    mail: ["M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", "m22 6-10 7L2 6"],
    members: ["M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M20 8v6", "M23 11h-6"],
    register: ["M9 11l3 3L22 4", "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"],
    payment: ["M3 5h18v14H3z", "M3 10h18", "M7 15h4"],
    settings: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 2.9-.2-.1a1.7 1.7 0 0 0-1.9.3l-.1.1h-3.4l-.1-.2a1.7 1.7 0 0 0-1.5-1.1 1.7 1.7 0 0 0-1.1.4l-.2.1-2.9-1.7.1-.2a1.7 1.7 0 0 0-.3-1.9l-.1-.1v-3.4l.2-.1a1.7 1.7 0 0 0 1.1-1.5 1.7 1.7 0 0 0-.4-1.1l-.1-.2 1.7-2.9.2.1a1.7 1.7 0 0 0 1.9-.3l.1-.1h3.4l.1.2a1.7 1.7 0 0 0 1.5 1.1 1.7 1.7 0 0 0 1.1-.4l.2-.1 2.9 1.7-.1.2a1.7 1.7 0 0 0 .3 1.9l.1.1v3.4Z"],
    history: ["M3 12a9 9 0 1 0 2.6-6.4L3 8", "M3 3v5h5", "M12 7v5l3 2"],
    ledger: ["M6 3h12a2 2 0 0 1 2 2v16l-4-2-4 2-4-2-4 2V5a2 2 0 0 1 2-2Z", "M8 8h8", "M8 12h8"],
    wallet: ["M3 6.5A2.5 2.5 0 0 1 5.5 4H20", "M3 6.5V19a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-3", "M3 7h16a2 2 0 0 1 2 2v8H16a3 3 0 0 1 0-6h5", "M16 14h.01"],
  };
  return <svg className="drawer-svg-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{(shapes[name] || shapes.info).map((d, index) => <path d={d} key={index} />)}</svg>;
};
const AdminSkull = ({ isAssistant = false }) => <svg viewBox="0 0 32 32" aria-hidden="true" className="admin-skull-icon"><path d="M16 2 28 7v9c0 6.5-4.7 11.3-12 14C8.7 27.3 4 22.5 4 16V7Z" fill="#050505" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><text x="16" y="18.5" textAnchor="middle" fontSize="9" fontWeight="900" letterSpacing=".1" fill="currentColor" stroke="none">{isAssistant ? "ADM" : "DEV"}</text><path d="M9 22.5c2.1 1.6 4.3 2.6 7 3.5 2.7-.9 4.9-1.9 7-3.5" fill="none" stroke="currentColor" strokeWidth=".7" opacity=".9"/></svg>;
const RankBadge = ({ rank, isAdmin = false, isAssistant = false }) => {
  if (isAdmin || isAssistant) return <span className={"rank-badge rank-admin" + (isAssistant ? " rank-admin-assistant" : "")} title={isAssistant ? "Pangkat Admin Asisten" : "Pangkat Developer"}><AdminSkull isAssistant={isAssistant} /></span>;
  const item = rankInfo(rank);
  return <span className={"rank-badge rank-" + item.label.toLowerCase()} title={rankNames[rank] || item.label} aria-label={(rankNames[rank] || item.label) + " (" + item.label + ")"}><RankSymbol rank={rank} /></span>;
};
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
  const [completedPayments, setCompletedPayments] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [informationMessages, setInformationMessages] = useState([]);
  const [informationDraft, setInformationDraft] = useState("");
  const [informationSending, setInformationSending] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveType, setLeaveType] = useState("offline");
  const [leaveDays, setLeaveDays] = useState("1");
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveSending, setLeaveSending] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveDeletingId, setLeaveDeletingId] = useState(null);
  const [rankChatMessages, setRankChatMessages] = useState([]);
  const [rankChatDraft, setRankChatDraft] = useState("");
  const [rankChatSending, setRankChatSending] = useState(false);
  const [rankChatRefreshing, setRankChatRefreshing] = useState(false);
  const [seniorChatMessages, setSeniorChatMessages] = useState([]);
  const [seniorChatDraft, setSeniorChatDraft] = useState("");
  const [seniorChatSending, setSeniorChatSending] = useState(false);
  const [seniorChatRefreshing, setSeniorChatRefreshing] = useState(false);
  const [rankChat456Messages, setRankChat456Messages] = useState([]);
  const rankChat456ListRef = useRef(null);
  const [rankChat456Draft, setRankChat456Draft] = useState("");
  const [rankChat456Sending, setRankChat456Sending] = useState(false);
  const [rankChat456Refreshing, setRankChat456Refreshing] = useState(false);
  const chatListRef = useRef(null);
  const [chatDraft, setChatDraft] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatRefreshing, setChatRefreshing] = useState(false);
  const [privateConversations, setPrivateConversations] = useState([]);
  const [privateMessages, setPrivateMessages] = useState([]);
  const [privateActiveConversation, setPrivateActiveConversation] = useState(null);
  const [privateSearch, setPrivateSearch] = useState("");
  const [privateDraft, setPrivateDraft] = useState("");
  const [privateLoading, setPrivateLoading] = useState(false);
  const [privateSending, setPrivateSending] = useState(false);
  const [dbMetrics, setDbMetrics] = useState(null);
  const [dbMetricsLoading, setDbMetricsLoading] = useState(false);
  const [pendingMembers, setPendingMembers] = useState([]);
  const [adminMembers, setAdminMembers] = useState([]);
  const [memberDirectory, setMemberDirectory] = useState([]);
  const [assistantAccounts, setAssistantAccounts] = useState([]);
  const [adminTransactions, setAdminTransactions] = useState([]);
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
  const [registrationPhone, setRegistrationPhone] = useState("");
  const [phoneNumberDraft, setPhoneNumberDraft] = useState("");
  const [chatProfile, setChatProfile] = useState(null);
  const [chatProfileLoading, setChatProfileLoading] = useState(false);
  const [balanceCorrection, setBalanceCorrection] = useState(null);
  const [memberPasswordReset, setMemberPasswordReset] = useState(null);
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);
  const [openMemberActions, setOpenMemberActions] = useState(null);
  const [openMemberPhone, setOpenMemberPhone] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [activeSection, setActiveSection] = useState("information");
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
  const [usernameCurrentPasswordDraft, setUsernameCurrentPasswordDraft] = useState("");
  const [passwordCurrentPasswordDraft, setPasswordCurrentPasswordDraft] = useState("");
  const [newPasswordDraft, setNewPasswordDraft] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!error && !message) return undefined;
    const timeoutId = window.setTimeout(() => { setError(""); setMessage(""); }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [error, message]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session);
    }).finally(() => { if (alive) setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null); setWallet(null); setSettings(null); setPayments([]); setPendingPayments([]); setPendingMembers([]); setAdminMembers([]); setMemberDirectory([]); setAssistantAccounts([]); setAdminTransactions([]);
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
        supabase.from("member_profiles").select("id,display_name,login_username,role,status,rank_code,profile_photo_path,phone_number,created_at").eq("id", session.user.id).maybeSingle(),
        supabase.from("member_wallets").select("balance,arrears,unpaid_from,exempt_kas").eq("member_id", session.user.id).maybeSingle(),
        supabase.from("dues_settings").select("report_date,daily_amount,adm_default,cash_operations_enabled,proof_retention_days").eq("id", 1).maybeSingle(),
        supabase.from("payment_submissions").select("id,amount,payment_type,status,created_at,review_note").eq("member_id", session.user.id).order("created_at", { ascending: false }).limit(10),
      ]);
      if (!alive) return;
      const firstError = [profileRes, walletRes, settingsRes, paymentsRes].find((r) => r.error);
      if (firstError) setError("Data akun belum dapat dimuat. " + firstError.error.message);
      let pendingRows = [];
      let pendingMemberRows = [];
      if (["admin", "admin_assistant"].includes(profileRes.data?.role) && profileRes.data?.status === "active") {
        const [pendingRes, memberRes, allMemberRes, walletListRes, transactionRes, completedRes, assistantRes] = await Promise.all([
          supabase.from("payment_submissions").select("id,member_id,amount,payment_type,proof_path,status,created_at,member_profiles(display_name,login_username)").eq("status", "pending").order("created_at", { ascending: true }).limit(100),
          supabase.from("member_profiles").select("id,display_name,login_username,created_at,rank_code,registration_proof_path,registration_note").eq("role", "member").eq("status", "pending").order("created_at", { ascending: true }).limit(100),
          supabase.from("member_profiles").select("id,display_name,login_username,status,created_at,rank_code,profile_photo_path,registration_proof_path,phone_number").eq("role", "member").not("status", "in", "(pending,rejected)").order("display_name", { ascending: true }).limit(500),
          supabase.from("member_wallets").select("member_id,balance,arrears,unpaid_from,exempt_kas"),
          profileRes.data?.role === "admin" ? supabase.from("wallet_transactions").select("id,member_id,transaction_type,amount,description,created_at,member_profiles(display_name,login_username)").order("created_at", { ascending: false }).limit(10) : Promise.resolve({ data: [], error: null }),
          supabase.from("payment_submissions").select("id,member_id,amount,payment_type,status,created_at,review_note,member_profiles(display_name,login_username)").in("status", ["approved", "rejected"]).order("created_at", { ascending: false }).limit(1000),
          profileRes.data?.role === "admin" ? supabase.from("member_profiles").select("id,display_name,login_username,status,rank_code,created_at").eq("role", "admin_assistant").order("display_name", { ascending: true }).limit(100) : Promise.resolve({ data: [], error: null }),
        ]);
        if (pendingRes.error) setError("Antrean pembayaran tidak dapat dimuat. " + pendingRes.error.message);
        if (memberRes.error) setError("Antrean pendaftaran tidak dapat dimuat. " + memberRes.error.message);
        if (allMemberRes.error) setError("Daftar anggota tidak dapat dimuat. " + allMemberRes.error.message);
        if (transactionRes.error) setError("Laporan transaksi tidak dapat dimuat. " + transactionRes.error.message);
        if (completedRes.error) setError("Riwayat pembayaran selesai tidak dapat dimuat. " + completedRes.error.message);
        const walletByMember = new Map((walletListRes.data || []).map((w) => [w.member_id, w]));
        const membersWithPhotos = await withPhotoUrls(allMemberRes.data || []);
        setAdminMembers(membersWithPhotos.map((m) => ({ ...m, rank_code: normalizeRankCode(m.rank_code), ...(walletByMember.get(m.id) || {}) }))
          .sort(compareMemberRank));
        setAdminTransactions(transactionRes.data || []);
        setCompletedPayments(completedRes.data || []);
        setAssistantAccounts(profileRes.data?.role === "admin" ? (assistantRes.data || []) : []);
        if (assistantRes.error) setError("Daftar Admin tidak dapat dimuat. " + assistantRes.error.message);
        pendingRows = pendingRes.data || [];
        pendingMemberRows = memberRes.data || [];
      }
      if (!alive) return;
      setProfile(profileRes.data || null);
      setProfileNameDraft(profileRes.data?.display_name || "");
      setPhoneNumberDraft(profileRes.data?.phone_number || "");
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

  // Lightweight notification counters only: database events must never reload the whole dashboard.
  const [pendingRegistrationNotice, setPendingRegistrationNotice] = useState(0);
  const [pendingPaymentNotice, setPendingPaymentNotice] = useState(0);
  const [chatUnreadNotice, setChatUnreadNotice] = useState(0);
  const [privateChatUnreadNotice, setPrivateChatUnreadNotice] = useState(0);
  const [leadersUnreadNotice, setLeadersUnreadNotice] = useState(0);
  const [staffUnreadNotice, setStaffUnreadNotice] = useState(0);
  const [informationUnreadNotice, setInformationUnreadNotice] = useState(0);
  const [permissionsUnreadNotice, setPermissionsUnreadNotice] = useState(0);

  useEffect(() => {
    if (!supabase || !session?.user?.id || profile?.status !== "active") return undefined;
    let alive = true;
    const readLastSeen = (key) => {
      try { return localStorage.getItem(key + session.user.id) || new Date().toISOString(); }
      catch { return new Date().toISOString(); }
    };
    const refreshNotificationCounts = async (table) => {
      if (["admin", "admin_assistant"].includes(profile.role) && (table === "member_profiles" || !table)) {
        const { count, error: countError } = await supabase.from("member_profiles").select("id", { count: "exact", head: true }).eq("role", "member").eq("status", "pending");
        if (alive && !countError) setPendingRegistrationNotice(count || 0);
      }
      if (["admin", "admin_assistant"].includes(profile.role) && (table === "payment_submissions" || !table)) {
        const { count, error: countError } = await supabase.from("payment_submissions").select("id", { count: "exact", head: true }).eq("status", "pending");
        if (alive && !countError) setPendingPaymentNotice(count || 0);
      }
      if (table === "information_messages" || !table) {
        if (activeSection === "information") { if (alive) setInformationUnreadNotice(0); }
        else {
          const { count, error: countError } = await supabase.from("information_messages").select("id", { count: "exact", head: true }).gt("created_at", readLastSeen("webkas-information-last-seen-")).neq("sender_id", session.user.id);
          if (alive && !countError) setInformationUnreadNotice(count || 0);
        }
      }
      if (table === "member_leave_requests" || !table) {
        if (activeSection === "permissions") { if (alive) setPermissionsUnreadNotice(0); }
        else {
          const { count, error: countError } = await supabase.from("member_leave_requests").select("id", { count: "exact", head: true }).gt("created_at", readLastSeen("webkas-permissions-last-seen-")).neq("member_id", session.user.id);
          if (alive && !countError) setPermissionsUnreadNotice(count || 0);
        }
      }
      if (table === "chat_messages" || !table) {
        if (activeSection === "chat") { if (alive) setChatUnreadNotice(0); }
        else {
          const { count, error: countError } = await supabase.from("chat_messages").select("id", { count: "exact", head: true }).gt("created_at", readLastSeen("webkas-chat-last-seen-")).neq("sender_id", session.user.id);
          if (alive && !countError) setChatUnreadNotice(count || 0);
        }
      }
      if (table === "p5_p6_chat_messages" || !table) {
        if (activeSection === "p5-p6-chat") { if (alive) setLeadersUnreadNotice(0); }
        else {
          const { count, error: countError } = await supabase.from("p5_p6_chat_messages").select("id", { count: "exact", head: true }).gt("created_at", readLastSeen("webkas-leaders-chat-last-seen-")).neq("sender_id", session.user.id);
          if (alive && !countError) setLeadersUnreadNotice(count || 0);
        }
      }
      if (table === "p4_p5_p6_chat_messages" || !table) {
        if (activeSection === "p4-p5-p6-chat") { if (alive) setStaffUnreadNotice(0); }
        else {
          const { count, error: countError } = await supabase.from("p4_p5_p6_chat_messages").select("id", { count: "exact", head: true }).gt("created_at", readLastSeen("webkas-staff-chat-last-seen-")).neq("sender_id", session.user.id);
          if (alive && !countError) setStaffUnreadNotice(count || 0);
        }
      }
      if (table === "private_messages" || !table) {
        if (activeSection === "private-chat") { if (alive) setPrivateChatUnreadNotice(0); }
        else {
          const uid = session.user.id;
          const [conversationsRes, hiddenRes] = await Promise.all([
            supabase.from("private_conversations").select("id").or("participant_one_id.eq." + uid + ",participant_two_id.eq." + uid),
            supabase.from("private_chat_hidden").select("conversation_id").eq("user_id", uid)
          ]);
          if (conversationsRes.error || hiddenRes.error) return;
          const hiddenIds = new Set((hiddenRes.data || []).map((row) => row.conversation_id));
          const visibleIds = (conversationsRes.data || []).map((row) => row.id).filter((id) => !hiddenIds.has(id));
          if (!visibleIds.length) { if (alive) setPrivateChatUnreadNotice(0); return; }
          const { count, error: countError } = await supabase.from("private_messages").select("id", { count: "exact", head: true })
            .in("conversation_id", visibleIds)
            .neq("sender_id", uid)
            .gt("created_at", readLastSeen("webkas-private-chat-last-seen-"));
          if (alive && !countError) setPrivateChatUnreadNotice(count || 0);
        }
      }
    };
    refreshNotificationCounts();
    // Poll counts if Realtime events are delayed or unavailable.
    const notificationPoll = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshNotificationCounts();
    }, 10000);
    const channel = supabase.channel("webkas-notifications-" + session.user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "member_profiles" }, () => refreshNotificationCounts("member_profiles"))
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_submissions" }, () => refreshNotificationCounts("payment_submissions"))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "information_messages" }, () => refreshNotificationCounts("information_messages"))
      .on("postgres_changes", { event: "*", schema: "public", table: "member_leave_requests" }, () => refreshNotificationCounts("member_leave_requests"))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => refreshNotificationCounts("chat_messages"))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "p5_p6_chat_messages" }, () => refreshNotificationCounts("p5_p6_chat_messages"))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "p4_p5_p6_chat_messages" }, () => refreshNotificationCounts("p4_p5_p6_chat_messages"))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "private_messages" }, () => refreshNotificationCounts("private_messages"))
      .subscribe();
    return () => { alive = false; window.clearInterval(notificationPoll); supabase.removeChannel(channel); };
  }, [session?.user?.id, profile?.role, profile?.status, activeSection]);

  useEffect(() => {
    if (!session?.user?.id) return;
    if (activeSection === "information") {
      try { localStorage.setItem("webkas-information-last-seen-" + session.user.id, new Date().toISOString()); } catch {}
      setInformationUnreadNotice(0);
    }
    if (activeSection === "permissions") {
      try { localStorage.setItem("webkas-permissions-last-seen-" + session.user.id, new Date().toISOString()); } catch {}
      setPermissionsUnreadNotice(0);
    }
    if (activeSection === "p5-p6-chat") {
      try { localStorage.setItem("webkas-leaders-chat-last-seen-" + session.user.id, new Date().toISOString()); } catch {}
      setLeadersUnreadNotice(0);
    }
    if (activeSection === "p4-p5-p6-chat") {
      try { localStorage.setItem("webkas-staff-chat-last-seen-" + session.user.id, new Date().toISOString()); } catch {}
      setStaffUnreadNotice(0);
    }
  }, [activeSection, session?.user?.id]);

  useEffect(() => {
    if (activeSection !== "private-chat" || !session?.user?.id) return;
    try { localStorage.setItem("webkas-private-chat-last-seen-" + session.user.id, new Date().toISOString()); } catch {}
    setPrivateChatUnreadNotice(0);
  }, [activeSection, session?.user?.id]);

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

  async function saveMyPhoneNumber(event) {
    event.preventDefault();
    if (!profile) return;
    const raw = phoneNumberDraft.trim().replace(/[\s().-]/g, "");
    if (raw && !/^\+?[0-9]{8,15}$/.test(raw)) { setError("Nomor HP harus 8–15 digit dan boleh diawali tanda +."); return; }
    setBusy(true); setError(""); setMessage("");
    const { data, error: saveError } = await supabase.rpc("set_my_phone_number", { p_phone_number: raw || null });
    if (saveError) setError("Nomor HP belum berhasil disimpan: " + saveError.message);
    else {
      setProfile((old) => old ? { ...old, phone_number: data || null } : old);
      setPhoneNumberDraft(data || "");
      setMessage("Nomor HP berhasil diperbarui.");
      setRefreshVersion((v) => v + 1);
    }
    setBusy(false);
  }

  async function saveAccountUsername(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const next = newUsernameDraft.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(next)) { setError("Username baru harus 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung."); setBusy(false); return; }
    if (next !== confirmNewUsername.trim().toLowerCase()) { setError("Konfirmasi username baru tidak sama."); setBusy(false); return; }
    if (!usernameCurrentPasswordDraft) { setError("Masukkan kata sandi saat ini untuk verifikasi."); setBusy(false); return; }
    const { data, error: updateError } = await supabase.functions.invoke("account-settings", { body: { action: "username", username: next, confirmUsername: confirmNewUsername.trim().toLowerCase(), currentPassword: usernameCurrentPasswordDraft } });
    if (updateError || data?.error) setError(data?.error || updateError?.message || "Username belum berhasil diubah.");
    else { setProfile((old)=>old?{...old,login_username:data.username||next}:old); setUsername(data.username||next); setNewUsernameDraft(""); setConfirmNewUsername(""); setUsernameCurrentPasswordDraft(""); setMessage("Username berhasil diubah. Gunakan username baru saat login berikutnya."); }
    setBusy(false);
  }

  async function saveAccountPassword(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    if (newPasswordDraft.length < 8 || newPasswordDraft.length > 72) { setError("Kata sandi baru harus 8–72 karakter."); setBusy(false); return; }
    if (newPasswordDraft !== confirmNewPassword) { setError("Konfirmasi kata sandi baru tidak sama."); setBusy(false); return; }
    if (!passwordCurrentPasswordDraft) { setError("Masukkan kata sandi saat ini untuk verifikasi."); setBusy(false); return; }
    const { data, error: updateError } = await supabase.functions.invoke("account-settings", { body: { action: "password", currentPassword: passwordCurrentPasswordDraft, newPassword: newPasswordDraft, confirmPassword: confirmNewPassword } });
    if (updateError || data?.error) setError(data?.error || updateError?.message || "Kata sandi belum berhasil diubah.");
    else { setNewPasswordDraft(""); setConfirmNewPassword(""); setPasswordCurrentPasswordDraft(""); setMessage("Kata sandi berhasil diubah."); }
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
    const normalizedPhone = registrationPhone.trim().replace(/[\s().-]/g, "");
    if (!/^\+?[0-9]{8,15}$/.test(normalizedPhone)) { setError("Nomor HP wajib diisi dengan 8–15 digit; boleh diawali tanda +."); setBusy(false); return; }
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
        body: { displayName: displayName.trim(), username: normalized, confirmUsername: confirmUsername.trim().toLowerCase(), password, confirmPassword, phoneNumber: normalizedPhone,
          registrationProofBase64: proofDataUrl.slice(comma + 1),
          registrationProofMime: registrationProofFile.type,
          registrationNote: registrationNote.trim() },
      });
      if (invokeError) {
        let detail = "";
        try {
          const response = invokeError.context;
          if (response && typeof response.json === "function") {
            const payload = await response.json();
            if (typeof payload?.error === "string") detail = payload.error;
          }
        } catch {}
        throw new Error(detail || "Pendaftaran belum berhasil dikirim karena koneksi/server bermasalah. Periksa koneksi internet, pastikan screenshot maksimal 2 MB, lalu coba lagi. Jika username sudah digunakan, pilih username lain.");
      }
      if (data?.error) throw new Error(data.error);
      let phoneSaved = false;
      const registrationClient = createTemporarySupabaseClient();
      try {
        const { data: signedIn, error: signInError } = await registrationClient.auth.signInWithPassword({ email: authEmail(normalized), password });
        if (signInError || !signedIn?.session) throw new Error(signInError?.message || "Sesi pendaftaran belum tersedia.");
        const { error: phoneSaveError } = await registrationClient.rpc("set_my_phone_number", { p_phone_number: normalizedPhone });
        if (phoneSaveError) throw new Error(phoneSaveError.message);
        phoneSaved = true;
      } catch {
        phoneSaved = false;
      } finally {
        await registrationClient.auth.signOut().catch(() => {});
      }
      setMode("login"); setPassword(""); setConfirmPassword(""); setUsername(""); setConfirmUsername(""); setRegistrationProofFile(null); setRegistrationNote(""); setRegistrationPhone("");
      setMessage(phoneSaved
        ? (data?.message || "Pendaftaran terkirim. Nomor HP tersimpan dan akun menunggu pemeriksaan admin.")
        : "Pendaftaran terkirim, tetapi nomor HP belum tersimpan otomatis. Setelah akun aktif, buka Pengaturan profil untuk menyimpannya.");
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
    const pendingMessage = "Tunggu pengajuan sebelumnya diperiksa admin untuk melakukan pengajuan selanjutnya.";
    if (payments.some((payment) => payment.status === "pending")) {
      setError(pendingMessage);
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
      const { data: existingPending, error: pendingCheckError } = await supabase
        .from("payment_submissions").select("id")
        .eq("member_id", session.user.id).eq("status", "pending").limit(1).maybeSingle();
      if (pendingCheckError) throw new Error("Status pengajuan belum dapat diperiksa. Coba lagi beberapa saat.");
      if (existingPending) {
        setError(pendingMessage);
        return;
      }
      const ext = proofFile.type === "image/jpeg" ? "jpg" : proofFile.type === "image/png" ? "png" : "webp";
      const path = session.user.id + "/" + crypto.randomUUID() + "." + ext;
      const { error: uploadError } = await supabase.storage.from("payment-proofs").upload(path, proofFile, {
        upsert: false, contentType: proofFile.type, cacheControl: "3600",
      });
      if (uploadError) throw new Error("Unggah bukti gagal: " + uploadError.message);
      const { error: insertError } = await supabase.from("payment_submissions").insert({
        member_id: session.user.id, amount, payment_type: paymentType, proof_path: path,
      });
      if (insertError?.code === "23505") {
        setError(pendingMessage);
        return;
      }
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
    let decisionCommitted = false;
    setBusy(true); setError(""); setMessage("");
    try {
      const { data, error: reviewError } = await supabase.functions.invoke("review-member-registration", {
        body: { memberId: id, decision, note: reviewNote },
      });
      if (reviewError || data?.error || data?.success !== true) {
        throw new Error(data?.error || reviewError?.message || "Keputusan belum dikonfirmasi.");
      }
      decisionCommitted = true;
      setPendingMembers((rows) => rows.filter((row) => row.id !== id));
      setReviewNote("");
      await refreshAdminSnapshot();
      const decisionText = decision === "active" ? "Anggota disetujui. Akun sekarang aktif." : data.account_deleted ? "Pendaftaran ditolak dan akun calon anggota dihapus otomatis." : "Pendaftaran ditolak, tetapi akun belum dapat dihapus otomatis untuk menjaga data terkait.";
      setMessage(data.proof_deleted
        ? decisionText + " Screenshot bukti permohonan sudah dihapus dari Storage."
        : decisionText + " Namun screenshot belum berhasil dihapus; perlu pembersihan ulang.");
    } catch (err) {
      setError(decisionCommitted
        ? "Keputusan pendaftaran sudah tersimpan, tetapi daftar belum berhasil disegarkan. Tekan Segarkan untuk memuat ulang. " + (err?.message || "")
        : "Pendaftaran belum dapat dipastikan berhasil. Segarkan antrean sebelum mencoba lagi. " + (err?.message || "Koneksi atau server bermasalah."));
    } finally {
      setBusy(false);
    }
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
    let decisionCommitted = false;
    setBusy(true); setError(""); setMessage("");
    try {
      const { data, error: reviewError } = await supabase.functions.invoke("review-payment", {
        body: { submissionId: id, decision, note: reviewNote },
      });
      if (reviewError || data?.error || data?.success !== true) {
        throw new Error(data?.error || reviewError?.message || "Keputusan belum dikonfirmasi.");
      }
      decisionCommitted = true;
      setPendingPayments((rows) => rows.filter((row) => row.id !== id));
      setReviewNote("");
      await refreshAdminSnapshot();
      const decisionText = decision === "approved" ? "Pembayaran disetujui dan pembukuan kas diperbarui." : "Pengajuan pembayaran ditolak.";
      setMessage(data?.proof_deleted ? decisionText + " Screenshot bukti sudah dihapus dari penyimpanan dan database." : decisionText + " Namun penghapusan screenshot belum selesai; bukti disembunyikan dari antrean dan perlu pembersihan ulang.");
    } catch (err) {
      setError(decisionCommitted
        ? "Keputusan pembayaran sudah tersimpan, tetapi daftar belum berhasil disegarkan. Tekan Segarkan untuk memuat ulang. " + (err?.message || "")
        : "Pembayaran belum dapat dipastikan berhasil. Segarkan antrean sebelum mencoba lagi. " + (err?.message || "Koneksi atau server bermasalah."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteCompletedPaymentHistory(submissionId = null) {
    const bulk = !submissionId;
    const count = completedPayments.length;
    if (!count && bulk) { setMessage("Tidak ada riwayat pembayaran selesai untuk dihapus."); return; }
    const promptText = bulk
      ? "HAPUS SEMUA " + count + " riwayat pembayaran yang sudah diterima/ditolak? Pengajuan pending/menunggu akan tetap aman. Saldo dan tunggakan tidak akan berubah. Screenshot bukti yang tersimpan juga akan dihapus."
      : "Hapus riwayat pembayaran ini beserta screenshot bukti dan catatan transaksi terkait? Saldo serta tunggakan anggota tidak akan berubah. Pengajuan pending tidak dapat dihapus.";
    if (!window.confirm(promptText)) return;
    setBusy(true); setError(""); setMessage("");
    const { data, error: deleteError } = await supabase.functions.invoke("delete-completed-payment-history", {
      body: bulk ? { bulk: true } : { submissionId },
    });
    if (deleteError || data?.error || data?.success !== true) {
      setError("Riwayat belum berhasil dihapus: " + (data?.error || deleteError?.message || "Kesalahan tidak diketahui."));
      if (data?.proof_deleted) setMessage("Screenshot bukti sudah dihapus, tetapi riwayat database masih ada. Silakan ulangi penghapusan.");
      setBusy(false); return;
    }
    setMessage(Number(data.deleted_count || 0) + " riwayat pembayaran selesai dihapus. " + Number(data.proof_deleted_count || 0) + " screenshot dibersihkan; saldo dan tunggakan tidak berubah." + (data.limited_to ? " Batas 1.000 riwayat per proses tercapai; jalankan lagi untuk sisanya." : ""));
    await refreshAdminSnapshot();
    setRefreshVersion((v) => v + 1);
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
      setMessage("Pengaturan tarif berhasil disimpan.");
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
    const ok = window.confirm("HAPUS PERMANEN akun @" + member.login_username + "? Tindakan ini tidak bisa dibatalkan. Saldo, tunggakan, dan riwayat keuangan akan diarsipkan ke log audit sebelum data akun dihapus.");
    if (!ok) return;
    const confirmation = window.prompt("Ketik username persis untuk konfirmasi penghapusan permanen:", "");
    if (confirmation === null) return;
    if (confirmation.trim().toLowerCase() !== String(member.login_username || "").toLowerCase()) {
      setError("Penghapusan dibatalkan: username konfirmasi tidak cocok.");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    const { data: deleteData, error: deleteError } = await supabase.rpc("admin_delete_member_without_financial_history", {
      p_member_id: member.id, p_confirmation_username: confirmation.trim(),
    });
    if (deleteError) {
      setError("Akun tidak dihapus: " + deleteError.message);
      setBusy(false); return;
    }
    if (!deleteData || deleteData.success !== true || deleteData.financial_history_archived !== true) {
      setError("Penghapusan dibatalkan karena server tidak mengonfirmasi arsip keuangan. Periksa log audit sebelum mencoba kembali.");
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
    const paymentProofPaths = Array.isArray(deleteData.payment_proof_paths) ? deleteData.payment_proof_paths.filter((path) => typeof path === "string" && path.trim()) : [];
    if (paymentProofPaths.length) {
      const { error: paymentProofError } = await supabase.storage.from("payment-proofs").remove([...new Set(paymentProofPaths)]);
      if (paymentProofError) cleanupErrors.push("bukti pembayaran: " + paymentProofError.message);
    }
    if (cleanupErrors.length) setError("Akun sudah dihapus dan arsip keuangan tersimpan, tetapi berkas berikut perlu dibersihkan manual: " + cleanupErrors.join("; "));
    setOpenMemberActions(null);
    await refreshAdminSnapshot();
    setMessage("Akun anggota @" + member.login_username + " berhasil dihapus permanen. Saldo, tunggakan, dan riwayat keuangan telah diarsipkan ke log audit.");
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
      if (refreshed) setMessage("Koreksi saldo berhasil dicatat. Saldo baru: " + money(data.balance) + ".");
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
    else { await refreshAdminSnapshot(); setMessage("Pengaturan anggota berhasil disimpan."); }
    setBusy(false);
  }

  async function setAssistantRole(member, makeAssistant) {
    if (profile?.role !== "admin" || profile?.status !== "active") { setError("Hanya Developer yang dapat mengubah jabatan admin."); return; }
    const action = makeAssistant ? "mengangkat" : "memberhentikan";
    if (!window.confirm("Yakin " + action + " @" + member.login_username + (makeAssistant ? " menjadi Admin?" : " dari jabatan Admin? Akun akan kembali menjadi anggota."))) return;
    setBusy(true); setError(""); setMessage("");
    const { data, error: roleError } = await supabase.rpc("admin_set_assistant_role", { p_member_id: member.id, p_make_assistant: makeAssistant });
    if (roleError || data?.success !== true) {
      setError("Jabatan Admin belum berubah: " + (roleError?.message || data?.message || "Database tidak mengonfirmasi perubahan."));
    } else {
      const refreshed = await refreshAdminSnapshot();
      if (refreshed) {
        setOpenMemberActions(null);
        setMessage(makeAssistant ? "@" + member.login_username + " berhasil diangkat menjadi Admin." : "@" + member.login_username + " tidak lagi menjadi Admin.");
      }
    }
    setBusy(false);
  }

  async function setMemberRank(member) {
    const nextRank = member.rank_code || "P1";
    setBusy(true); setError(""); setMessage("");
    const { error: rankError } = await supabase.rpc("admin_set_member_rank", { p_member_id: member.id, p_rank_code: nextRank });
    if (rankError) setError("Pangkat anggota belum diubah: " + rankError.message);
    else { await refreshAdminSnapshot(); setMessage("Pangkat " + member.display_name + " berhasil diubah menjadi " + nextRank + "."); }
    setBusy(false);
  }

  async function resetMemberPassword(member) {
    if (profile?.role !== "admin" || profile?.status !== "active") { setError("Hanya Developer aktif yang dapat mereset kata sandi."); return; }
    if (memberPasswordReset?.memberId !== member.id) return;
    const newPassword = memberPasswordReset.newPassword || "";
    const confirmPassword = memberPasswordReset.confirmPassword || "";
    if (newPassword.length < 8 || newPassword.length > 72) { setError("Kata sandi baru harus 8–72 karakter."); return; }
    if (newPassword !== confirmPassword) { setError("Konfirmasi kata sandi baru tidak sama."); return; }
    if (!window.confirm("Reset kata sandi @" + member.login_username + "? Pemilik akun harus menggunakan kata sandi baru ini saat masuk berikutnya.")) return;
    setBusy(true); setError(""); setMessage("");
    const { data, error: resetError } = await supabase.functions.invoke("admin-reset-member-password", {
      body: { memberId: member.id, newPassword, confirmPassword },
    });
    if (resetError || data?.success !== true) {
      setError(data?.error || resetError?.message || "Kata sandi belum berhasil direset.");
    } else {
      setMemberPasswordReset(null);
      setOpenMemberActions(null);
      setMessage("Kata sandi @" + member.login_username + " berhasil direset. Sampaikan kata sandi baru secara pribadi kepada pemilik akun.");
    }
    setBusy(false);
  }

  async function refreshAdminSnapshot() {
    const [allMemberRes, walletListRes, transactionRes, completedRes, assistantRes] = await Promise.all([
      supabase.from("member_profiles").select("id,display_name,login_username,status,created_at,rank_code,profile_photo_path,registration_proof_path,phone_number").eq("role", "member").not("status", "in", "(pending,rejected)").order("display_name", { ascending: true }).limit(500),
      supabase.from("member_wallets").select("member_id,balance,arrears,unpaid_from,exempt_kas"),
      supabase.from("wallet_transactions").select("id,member_id,transaction_type,amount,description,created_at,member_profiles(display_name,login_username)").order("created_at", { ascending: false }).limit(10),
      supabase.from("payment_submissions").select("id,member_id,amount,payment_type,status,created_at,review_note,member_profiles(display_name,login_username)").in("status", ["approved", "rejected"]).order("created_at", { ascending: false }).limit(1000),
      profile?.role === "admin" ? supabase.from("member_profiles").select("id,display_name,login_username,status,rank_code,created_at").eq("role", "admin_assistant").order("display_name", { ascending: true }).limit(100) : Promise.resolve({ data: [], error: null }),
    ]);
    const failed = [allMemberRes, walletListRes, transactionRes, completedRes].find((r) => r.error);
    if (failed) {
      setError("Data panel admin belum berhasil diperbarui: " + failed.error.message);
      return false;
    }
    const walletByMember = new Map((walletListRes.data || []).map((w) => [w.member_id, w]));
    const membersWithPhotos = await withPhotoUrls(allMemberRes.data || []);
    const freshMembers = membersWithPhotos.map((m) => ({ ...m, rank_code: normalizeRankCode(m.rank_code), ...(walletByMember.get(m.id) || {}) }))
      .sort(compareMemberRank);
    setAdminMembers(freshMembers);
    setAdminTransactions(transactionRes.data || []);
    setCompletedPayments(completedRes.data || []);
    setAssistantAccounts(profile?.role === "admin" ? (assistantRes.data || []) : []);
    if (assistantRes.error) { setError("Daftar Admin tidak dapat dimuat: " + assistantRes.error.message); return false; }
    return { members: freshMembers };
  }

  async function decorateChatMessages(rows) {
    const messages = rows || [];
    const senderIds = [...new Set(messages.map((item) => item.sender_id).filter(Boolean))];
    if (!senderIds.length) return messages;

    // Read only the chat-safe identity fields through a guarded RPC. Direct
    // member_profiles SELECT is intentionally restricted by RLS for members.
    const { data: senders, error: senderError } = await supabase.rpc(
      "get_chat_sender_profiles",
      { p_member_ids: senderIds }
    );
    if (senderError || !Array.isArray(senders) || !senders.length) return messages;

    const sendersWithPhotos = await withPhotoUrls(senders);
    const senderById = new Map(sendersWithPhotos.map((sender) => [sender.id, sender]));
    return messages.map((item) => {
      const sender = senderById.get(item.sender_id);
      return {
        ...item,
        sender_display_name: sender?.display_name || item.sender_display_name || "Anggota",
        sender_role: sender?.role || item.sender_role,
        sender_rank_code: sender?.rank_code || null,
        sender_profile_photo_url: sender?.profile_photo_url || null,
      };
    });
  }
  async function openChatProfile(memberId) {
    if (!memberId || !supabase) return;
    setChatProfileLoading(true); setChatProfile(null); setError("");
    const { data, error: profileError } = await supabase.rpc("get_member_public_profile", { p_member_id: memberId });
    if (profileError || !data) {
      setError("Profil anggota belum dapat dimuat: " + (profileError?.message || "Data tidak tersedia."));
      setChatProfileLoading(false); return;
    }
    let photoUrl = null;
    if (data.profile_photo_path) {
      const { data: signed, error: photoError } = await supabase.storage.from("profile-photos").createSignedUrl(data.profile_photo_path, 3600);
      if (!photoError) photoUrl = signed?.signedUrl || null;
    }
    setChatProfile({ ...data, profile_photo_url: photoUrl });
    setChatProfileLoading(false);
  }

  async function loadChatMessages() {
    if (!supabase || !session?.user?.id || profile?.status !== "active") {
      setError("Chat belum dapat dimuat karena sesi atau profil belum aktif.");
      return false;
    }
    const { data, error: chatError } = await supabase.from("chat_messages").select("id,sender_id,sender_display_name,sender_role,body,created_at").order("created_at", { ascending: true }).limit(200);
    if (chatError) { setError("Pesan chat gagal dimuat: " + chatError.message); return false; }
    setChatMessages(await decorateChatMessages(data || []));
    return true;
  }

  async function refreshChatMessages() {
    if (chatRefreshing) return;
    setChatRefreshing(true);
    setError("");
    setMessage("");
    try {
      const loaded = await loadChatMessages();
      if (loaded) setMessage("Chat berhasil diperbarui.");
    } catch (refreshError) {
      setError("Chat gagal diperbarui: " + (refreshError?.message || "Kesalahan tidak diketahui."));
    } finally {
      setChatRefreshing(false);
    }
  }
  useEffect(() => {
    if (!supabase || !session?.user?.id || profile?.status !== "active" || activeSection !== "chat") return undefined;
    let alive = true;
    const fetchMessages = async () => {
      const { data, error: chatError } = await supabase.from("chat_messages").select("id,sender_id,sender_display_name,sender_role,body,created_at").order("created_at", { ascending: true }).limit(200);
      if (!alive) return;
      if (chatError) setError("Pesan chat belum dapat dimuat: " + chatError.message);
      else setChatMessages(await decorateChatMessages(data || []));
    };
    fetchMessages();
    const channel = supabase.channel("webkas-chat-" + session.user.id).on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, fetchMessages).subscribe();
    // Keep the conversation fresh even if a realtime event is missed or the connection reconnects.
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible" && activeSection === "chat") fetchMessages();
    }, 15000);
    return () => { alive = false; window.clearInterval(refreshTimer); supabase.removeChannel(channel); };
  }, [session?.user?.id, profile?.status, activeSection]);
  useEffect(() => {
    if (activeSection !== "chat") return;
    try { localStorage.setItem("webkas-chat-last-seen-" + session.user.id, new Date().toISOString()); } catch {}
    setChatUnreadNotice(0);
    if (chatListRef.current) chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
  }, [activeSection, chatMessages.length, session?.user?.id]);
  useEffect(() => {
    if (!supabase || !session?.user?.id || profile?.status !== "active" || activeSection !== "information") return undefined;
    let alive = true;
    const loadInformationMessages = async () => {
      const { data, error: loadError } = await supabase.from("information_messages").select("id,sender_id,body,created_at").order("created_at", { ascending: false }).limit(100);
      if (!alive) return;
      if (loadError) setError("Informasi belum dapat dimuat. Pastikan migrasi fitur Informasi sudah diterapkan.");
      else setInformationMessages(data || []);
    };
    loadInformationMessages();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") loadInformationMessages(); }, 15000);
    const channel = supabase.channel("webkas-information-" + session.user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "information_messages" }, loadInformationMessages)
      .subscribe();
    return () => { alive = false; window.clearInterval(timer); supabase.removeChannel(channel); };
  }, [session?.user?.id, profile?.status, activeSection]);

  useEffect(() => {
    if (!supabase || !session?.user?.id || profile?.status !== "active" || activeSection !== "permissions") return undefined;
    let alive = true;
    const loadLeaveRequests = async () => {
      setLeaveLoading(true);
      const { data, error: loadError } = await supabase.rpc("get_member_leave_requests");
      if (!alive) return;
      if (loadError) setError("Daftar perizinan belum dapat dimuat: " + loadError.message);
      else setLeaveRequests(data || []);
      setLeaveLoading(false);
    };
    loadLeaveRequests();
    const channel = supabase.channel("webkas-leave-requests-" + session.user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "member_leave_requests" }, loadLeaveRequests)
      .subscribe();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") loadLeaveRequests();
    }, 20000);
    return () => { alive = false; window.clearInterval(timer); supabase.removeChannel(channel); };
  }, [session?.user?.id, profile?.status, activeSection]);

  async function submitLeaveRequest(event) {
    event?.preventDefault?.();
    if (!supabase || !session?.user?.id || profile?.status !== "active") {
      setError("Hanya akun aktif yang dapat mengajukan izin.");
      return;
    }
    const reason = leaveReason.trim();
    const days = Number.parseInt(leaveDays, 10);
    if (!reason || reason.length > 1000) {
      setError("Keterangan atau alasan wajib diisi (maksimal 1.000 karakter).");
      return;
    }
    if (leaveType === "offline" && (!Number.isInteger(days) || days < 1 || days > 365)) {
      setError("Jumlah hari izin offline harus antara 1 sampai 365 hari.");
      return;
    }
    setLeaveSending(true);
    setError("");
    setMessage("");
    const payload = {
      member_id: session.user.id,
      leave_type: leaveType,
      offline_days: leaveType === "offline" ? days : null,
      reason,
    };
    const { error: submitError } = await supabase.from("member_leave_requests").insert(payload);
    if (submitError) {
      setError("Pengajuan izin gagal dikirim: " + submitError.message);
    } else {
      setLeaveReason("");
      setLeaveDays("1");
      const { data, error: refreshError } = await supabase.rpc("get_member_leave_requests");
      if (!refreshError) setLeaveRequests(data || []);
      setMessage("Pengajuan izin berhasil dikirim.");
    }
    setLeaveSending(false);
  }

  async function deleteLeaveRequest(request) {
    if (!request?.id || !isAdmin) {
      setError("Hanya Developer atau Admin Asisten aktif yang dapat menghapus pesan perizinan.");
      return;
    }
    if (!window.confirm("Hapus pesan perizinan ini? Pesan akan dihapus untuk semua anggota.")) return;
    setError("");
    setMessage("");
    setLeaveDeletingId(request.id);
    try {
      const { data, error: deleteError } = await supabase.rpc("admin_delete_member_leave_request", { p_request_id: request.id });
      if (deleteError || data?.success !== true) {
        setError("Pesan perizinan gagal dihapus: " + (deleteError?.message || data?.message || "Operasi tidak berhasil."));
        return;
      }
      setLeaveRequests((items) => items.filter((item) => item.id !== request.id));
      setMessage("Pesan perizinan berhasil dihapus.");
    } catch (deleteException) {
      setError("Pesan perizinan gagal dihapus: " + (deleteException?.message || "Terjadi kesalahan koneksi."));
    } finally {
      setLeaveDeletingId(null);
    }
  }

  async function sendInformationMessage(event) {
    event?.preventDefault?.();
    const messageBody = informationDraft.trim();
    const canSend = profile?.status === "active" && (["admin", "admin_assistant"].includes(profile?.role) || ["P5", "P6"].includes(profile?.rank_code));
    if (!canSend) { setError("Hanya Developer, Admin Asisten, serta anggota P5 dan P6 yang dapat mengirim informasi."); return; }
    if (!messageBody || informationSending || !session?.user?.id) return;
    if (messageBody.length > 1900) { setError("Isi informasi maksimal 1.900 karakter agar judul tanggal otomatis tetap muat."); return; }
    const headingDate = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date()).toLocaleUpperCase("id-ID");
    const body = headingDate + " =\n\n" + messageBody.replace(/^\s*(?:SENIN|SELASA|RABU|KAMIS|JUMAT|SABTU|MINGGU)[^\n]*=\s*\n*/i, "").trim();
    setInformationSending(true); setError(""); setMessage("");
    const { error: sendError } = await supabase.from("information_messages").insert({ sender_id: session.user.id, body });
    if (sendError) setError("Informasi gagal dikirim. Pastikan migrasi fitur Informasi sudah diterapkan.");
    else { setInformationDraft(""); const { data } = await supabase.from("information_messages").select("id,sender_id,body,created_at").order("created_at", { ascending: false }).limit(100); setInformationMessages(data || []); setMessage("Informasi berhasil dikirim."); }
    setInformationSending(false);
  }

  async function deleteInformationMessage(item) {
    if (!item?.id || !canSendInformation) { setError("Akun ini tidak memiliki izin untuk menghapus informasi."); return; }
    if (item.sender_id !== session?.user?.id && !isAdminMaster) { setError("Kamu hanya dapat menghapus informasi yang kamu kirim sendiri."); return; }
    if (!window.confirm("Hapus informasi ini dari papan Informasi?")) return;
    setError(""); setMessage("");
    setBusy(true);
    try {
      if (isAdminMaster) {
        const { data, error: deleteError } = await supabase.rpc("admin_delete_information_message", { p_message_id: item.id });
        if (deleteError || data?.success !== true) {
          setError("Informasi gagal dihapus: " + (deleteError?.message || data?.message || "Operasi tidak berhasil."));
          return;
        }
      } else {
        const { error: deleteError } = await supabase.from("information_messages").delete().eq("id", item.id);
        if (deleteError) { setError("Informasi gagal dihapus: " + deleteError.message); return; }
      }
      const { data, error: loadError } = await supabase.from("information_messages").select("id,sender_id,body,created_at").order("created_at", { ascending: false }).limit(100);
      if (loadError) { setInformationMessages((items) => items.filter((message) => message.id !== item.id)); }
      else setInformationMessages(data || []);
      setMessage("Informasi berhasil dihapus.");
    } catch (deleteException) {
      setError("Informasi gagal dihapus: " + (deleteException?.message || "Terjadi kesalahan koneksi."));
    } finally {
      setBusy(false);
    }
  }

  async function sendChatMessage(event) {
    event?.preventDefault?.();
    const body = chatDraft.trim();
    if (!body || !session?.user?.id || chatSending) return;
    setChatSending(true);
    const { error: sendError } = await supabase.from("chat_messages").insert({ sender_id: session.user.id, body });
    if (sendError) setError("Pesan gagal dikirim: " + sendError.message);
    else { setChatDraft(""); await loadChatMessages(); }
    setChatSending(false);
  }

  async function loadRankChatMessages() {
    if (!supabase || !session?.user?.id || profile?.status !== "active" || !(["P5","P6"].includes(profile?.rank_code) || profile?.role === "admin")) {
      setRankChatMessages([]);
      return false;
    }
    const { data, error: chatError } = await supabase.from("p5_p6_chat_messages").select("id,sender_id,body,created_at").order("created_at", { ascending: false }).limit(200);
    if (chatError) { setError("Ruang chat P5/P6 gagal dimuat: " + chatError.message); return false; }
    setRankChatMessages(await decorateChatMessages((data || []).slice().reverse()));
    return true;
  }
  async function sendRankChat456Message(event) {
    event?.preventDefault?.();
    const body = rankChatDraft.trim();
    if (!body || !session?.user?.id || rankChatSending || !(["P5","P6"].includes(profile?.rank_code) || profile?.role === "admin")) return;
    setRankChatSending(true);
    const { error: sendError } = await supabase.from("p5_p6_chat_messages").insert({ sender_id: session.user.id, body });
    if (sendError) setError("Pesan ruang P5/P6 gagal dikirim: " + sendError.message);
    else { setRankChatDraft(""); await loadRankChatMessages(); }
    setRankChatSending(false);
  }
  async function clearRankChatHistory() {
    if (profile?.role !== "admin" || profile?.status !== "active" || !supabase) {
      setError("Hanya Developer aktif yang dapat mengosongkan riwayat ruang chat P5/P6.");
      return;
    }
    if (!window.confirm("Kosongkan SELURUH riwayat Ruang Chat P5/P6? Pesan di ruang khusus P5/P6 akan dihapus permanen. Riwayat Chat Anggota dan Ruang Chat P4/P5/P6, data anggota, saldo, kas, serta pembayaran tidak terpengaruh.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { data, error: clearError } = await supabase.rpc("admin_clear_p5_p6_chat_messages");
      if (clearError || data?.success !== true) {
        setError("Riwayat Ruang Chat P5/P6 gagal dikosongkan: " + (clearError?.message || "Operasi tidak berhasil."));
      } else {
        setMessage("Riwayat Ruang Chat P5/P6 berhasil dibersihkan. " + Number(data.deleted_count || 0) + " pesan dihapus.");
        await loadRankChatMessages();
      }
    } catch (clearException) {
      setError("Riwayat Ruang Chat P5/P6 gagal dikosongkan: " + (clearException?.message || "Terjadi kesalahan koneksi."));
    } finally {
      setBusy(false);
    }
  }

  async function refreshRankChatMessages() {
    if (rankChatRefreshing) return;
    setRankChatRefreshing(true);
    await loadRankChatMessages();
    setRankChatRefreshing(false);
  }
  useEffect(() => {
    if (!supabase || !session?.user?.id || profile?.status !== "active" || !(["P5","P6"].includes(profile?.rank_code) || profile?.role === "admin")) return undefined;
    let alive = true;
    let initialized = false;
    const seenIds = new Set();
    const notifyIncoming = (row) => {
      if (!row?.id || row.sender_id === session.user.id || seenIds.has(row.id)) return;
      seenIds.add(row.id);
      setLeadersUnreadNotice((count) => Math.min(99, count + 1));
      setMessage("Pesan baru di Leaders" + (row.body ? ": " + String(row.body).slice(0, 90) : "."));
    };
    const fetchMessages = async () => {
      const { data, error: chatError } = await supabase.from("p5_p6_chat_messages").select("id,sender_id,body,created_at").order("created_at", { ascending: false }).limit(200);
      if (!alive) return;
      if (chatError) { setError("Ruang chat P5/P6 gagal dimuat: " + chatError.message); return; }
      const rows = (data || []).slice().reverse();
      if (!initialized) {
        rows.forEach((row) => seenIds.add(row.id));
        initialized = true;
      } else {
        rows.forEach((row) => { if (!seenIds.has(row.id)) notifyIncoming(row); });
      }
      rows.forEach((row) => seenIds.add(row.id));
      while (seenIds.size > 500) seenIds.delete(seenIds.values().next().value);
      setRankChatMessages(await decorateChatMessages(rows));
    };
    const channel = supabase.channel("webkas-p5-p6-chat-" + session.user.id).on("postgres_changes", { event: "INSERT", schema: "public", table: "p5_p6_chat_messages" }, (payload) => {
      notifyIncoming(payload?.new);
      fetchMessages();
    }).subscribe();
    fetchMessages();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") fetchMessages(); }, 10000);
    return () => { alive = false; window.clearInterval(timer); supabase.removeChannel(channel); };
  }, [session?.user?.id, profile?.status, profile?.rank_code, profile?.role]);
  async function loadRankChat456Messages() {
    if (!supabase || !session?.user?.id || profile?.status !== "active" || !(["P4","P5","P6"].includes(profile?.rank_code) || profile?.role === "admin")) {
      setRankChat456Messages([]);
      return false;
    }
    const { data, error: chatError } = await supabase.from("p4_p5_p6_chat_messages").select("id,sender_id,body,created_at").order("created_at", { ascending: false }).limit(200);
    if (chatError) { setError("Ruang chat P4/P5/P6 gagal dimuat: " + chatError.message); return false; }
    setRankChat456Messages(await decorateChatMessages((data || []).slice().reverse()));
    return true;
  }
  async function sendRankChatMessage(event) {
    event?.preventDefault?.();
    const body = rankChat456Draft.trim();
    if (!body) {
      setError("Tulis pesan terlebih dahulu sebelum mengirim.");
      return;
    }
    if (!supabase || !session?.user?.id) {
      setError("Sesi login belum siap. Muat ulang halaman dan masuk kembali.");
      return;
    }
    if (rankChat456Sending) return;
    if (profile?.status !== "active" || !(["P4","P5","P6"].includes(profile?.rank_code) || profile?.role === "admin")) {
      setError("Akun ini tidak memiliki izin mengirim pesan di ruang P4/P5/P6.");
      return;
    }
    setRankChat456Sending(true);
    setError("");
    setMessage("");
    try {
      const { error: sendError } = await supabase
        .from("p4_p5_p6_chat_messages")
        .insert({ sender_id: session.user.id, body });
      if (sendError) {
        setError("Pesan ruang P4/P5/P6 gagal dikirim: " + sendError.message);
      } else {
        setRankChat456Draft("");
        const loaded = await loadRankChat456Messages();
        if (loaded) setMessage("Pesan berhasil dikirim.");
      }
    } catch (sendException) {
      setError("Pesan ruang P4/P5/P6 gagal dikirim karena koneksi atau aplikasi: " + (sendException?.message || "silakan coba lagi."));
    } finally {
      setRankChat456Sending(false);
    }
  }
  async function refreshRankChat456Messages() {
    if (rankChat456Refreshing) return;
    setRankChat456Refreshing(true);
    await loadRankChat456Messages();
    setRankChat456Refreshing(false);
  }
  useEffect(() => {
    if (!supabase || !session?.user?.id || profile?.status !== "active" || !(["P4","P5","P6"].includes(profile?.rank_code) || profile?.role === "admin")) return undefined;
    let alive = true;
    let initialized = false;
    const seenIds = new Set();
    const notifyIncoming = (row) => {
      if (!row?.id || row.sender_id === session.user.id || seenIds.has(row.id)) return;
      seenIds.add(row.id);
      setStaffUnreadNotice((count) => Math.min(99, count + 1));
      setMessage("Pesan baru di Ruang Chat Staff (P4)" + (row.body ? ": " + String(row.body).slice(0, 90) : "."));
    };
    const fetchMessages = async () => {
      const { data, error: chatError } = await supabase.from("p4_p5_p6_chat_messages").select("id,sender_id,body,created_at").order("created_at", { ascending: false }).limit(200);
      if (!alive) return;
      if (chatError) { setError("Ruang chat P4/P5/P6 gagal dimuat: " + chatError.message); return; }
      const rows = (data || []).slice().reverse();
      if (!initialized) {
        rows.forEach((row) => seenIds.add(row.id));
        initialized = true;
      } else {
        rows.forEach((row) => { if (!seenIds.has(row.id)) notifyIncoming(row); });
      }
      rows.forEach((row) => seenIds.add(row.id));
      while (seenIds.size > 500) seenIds.delete(seenIds.values().next().value);
      setRankChat456Messages(await decorateChatMessages(rows));
    };
    const channel = supabase.channel("webkas-p4-p5-p6-chat-" + session.user.id).on("postgres_changes", { event: "INSERT", schema: "public", table: "p4_p5_p6_chat_messages" }, (payload) => {
      notifyIncoming(payload?.new);
      fetchMessages();
    }).subscribe();
    fetchMessages();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") fetchMessages(); }, 10000);
    return () => { alive = false; window.clearInterval(timer); supabase.removeChannel(channel); };
  }, [session?.user?.id, profile?.status, profile?.rank_code, profile?.role, activeSection]);
  async function loadRankChat456Messages() {
    if (!supabase || !session?.user?.id || profile?.status !== "active" || !(["P4","P5","P6"].includes(profile?.rank_code) || profile?.role === "admin")) {
      setRankChat456Messages([]);
      return false;
    }
    const { data, error: chatError } = await supabase.from("p4_p5_p6_chat_messages").select("id,sender_id,body,created_at").order("created_at", { ascending: false }).limit(200);
    if (chatError) { setError("Ruang chat P4/P4/P5/P6 gagal dimuat: " + chatError.message); return false; }
    setRankChat456Messages(await decorateChatMessages(data || []));
    return true;
  }
  useEffect(() => {
    if (activeSection !== "p4-p5-p6-chat" || !rankChat456ListRef.current) return;
    const list = rankChat456ListRef.current;
    list.scrollTop = list.scrollHeight;
  }, [activeSection, rankChat456Messages.length]);

  async function sendSeniorChatMessage(event) {
    event?.preventDefault?.();
    const body = rankChat456Draft.trim();
    if (!body || !session?.user?.id || rankChat456Sending || !(["P4","P5","P6"].includes(profile?.rank_code) || profile?.role === "admin")) return;
    setRankChat456Sending(true);
    const { error: sendError } = await supabase.from("p4_p5_p6_chat_messages").insert({ sender_id: session.user.id, body });
    if (sendError) setError("Pesan ruang P4/P4/P5/P6 gagal dikirim: " + sendError.message);
    else { setRankChat456Draft(""); await loadRankChat456Messages(); }
    setRankChat456Sending(false);
  }
  async function refreshRankChat456Messages() {
    if (rankChat456Refreshing) return;
    setRankChat456Refreshing(true);
    await loadRankChat456Messages();
    setRankChat456Refreshing(false);
  }
  useEffect(() => {
    if (!supabase || !session?.user?.id || profile?.status !== "active" || activeSection !== "p4-p4-p5-p6-chat" || !(["P4","P5","P6"].includes(profile?.rank_code) || profile?.role === "admin")) return undefined;
    let alive = true;
    const fetchMessages = async () => {
      const { data, error: chatError } = await supabase.from("p4_p5_p6_chat_messages").select("id,sender_id,body,created_at").order("created_at", { ascending: false }).limit(200);
      if (!alive) return;
      if (chatError) setError("Ruang chat P4/P4/P5/P6 gagal dimuat: " + chatError.message);
      else setRankChat456Messages(await decorateChatMessages(data || []));
    };
    fetchMessages();
    const channel = supabase.channel("webkas-p4-p4-p5-p6-chat-" + session.user.id).on("postgres_changes", { event: "*", schema: "public", table: "p4_p5_p6_chat_messages" }, fetchMessages).subscribe();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible" && activeSection === "p4-p4-p5-p6-chat") fetchMessages(); }, 15000);
    return () => { alive = false; window.clearInterval(timer); supabase.removeChannel(channel); };
  }, [session?.user?.id, profile?.status, profile?.rank_code, profile?.role, activeSection]);
  async function loadPrivateConversations() {
    if (!supabase || !profile?.id || profile.status !== "active") return;
    const uid = profile.id;
    const [conversationRes, hiddenRes] = await Promise.all([
      supabase.from("private_conversations").select("id,participant_one_id,participant_two_id,created_at").or("participant_one_id.eq." + uid + ",participant_two_id.eq." + uid).order("created_at", { ascending: false }).limit(200),
      supabase.from("private_chat_hidden").select("conversation_id").eq("user_id", uid),
    ]);
    if (conversationRes.error || hiddenRes.error) {
      setError("Daftar Privat Chat gagal dimuat: " + (conversationRes.error?.message || hiddenRes.error?.message));
      return;
    }
    const hiddenIds = new Set((hiddenRes.data || []).map((row) => row.conversation_id));
    const visibleRows = (conversationRes.data || []).filter((row) => !hiddenIds.has(row.id));
    const ids = visibleRows.map((row) => row.id);
    let latestByConversation = new Map();
    if (ids.length) {
      const { data: latestRows, error: latestError } = await supabase.from("private_messages").select("conversation_id,sender_id,body,created_at").in("conversation_id", ids).order("created_at", { ascending: false }).limit(1000);
      if (latestError) { setError("Pratinjau Privat Chat gagal dimuat: " + latestError.message); return; }
      for (const row of latestRows || []) if (!latestByConversation.has(row.conversation_id)) latestByConversation.set(row.conversation_id, row);
    }
    const nextRows = visibleRows.map((row) => {
      const otherId = row.participant_one_id === uid ? row.participant_two_id : row.participant_one_id;
      const otherMember = memberDirectory.find((member) => member.id === otherId) || { id: otherId, display_name: "Anggota", status: "inactive" };
      return { ...row, otherMember, lastMessage: latestByConversation.get(row.id) || null };
    });
    setPrivateConversations(nextRows);
  }

  async function loadPrivateMessages(conversationId) {
    if (!supabase || !conversationId) { setPrivateMessages([]); return false; }
    const { data, error: privateMessageError } = await supabase.from("private_messages").select("id,conversation_id,sender_id,body,created_at").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(500);
    if (privateMessageError) { setError("Pesan privat gagal dimuat: " + privateMessageError.message); return false; }
    setPrivateMessages(data || []);
    return true;
  }

  async function openPrivateConversation(member) {
    if (!supabase || !profile?.id || !member?.id || member.id === profile.id) return;
    setPrivateLoading(true); setError("");
    try {
      const [one, two] = [profile.id, member.id].sort();
      let { data: conversation, error: findError } = await supabase.from("private_conversations").select("id,participant_one_id,participant_two_id,created_at").eq("participant_one_id", one).eq("participant_two_id", two).maybeSingle();
      if (findError) throw findError;
      if (!conversation) {
        const { data: created, error: createError } = await supabase.from("private_conversations").insert({ participant_one_id: one, participant_two_id: two }).select("id,participant_one_id,participant_two_id,created_at").single();
        if (createError) {
          if (createError.code !== "23505") throw createError;
          const retry = await supabase.from("private_conversations").select("id,participant_one_id,participant_two_id,created_at").eq("participant_one_id", one).eq("participant_two_id", two).single();
          if (retry.error) throw retry.error;
          conversation = retry.data;
        } else conversation = created;
      }
      const { error: unhideError } = await supabase.from("private_chat_hidden").delete().eq("user_id", profile.id).eq("conversation_id", conversation.id);
      if (unhideError) throw unhideError;
      const otherMember = memberDirectory.find((item) => item.id === member.id) || member;
      setPrivateActiveConversation({ ...conversation, otherMember });
      setPrivateDraft("");
      setActiveSection("private-chat");
      await loadPrivateMessages(conversation.id);
      await loadPrivateConversations();
    } catch (privateError) {
      setError("Percakapan privat tidak dapat dibuka: " + (privateError?.message || "Kesalahan tidak diketahui."));
    } finally {
      setPrivateLoading(false);
    }
  }

  async function sendPrivateMessage(event) {
    event?.preventDefault?.();
    const body = privateDraft.trim();
    if (!body || !profile?.id || !privateActiveConversation?.id || privateSending) return;
    setPrivateSending(true);
    const { error: sendError } = await supabase.from("private_messages").insert({ conversation_id: privateActiveConversation.id, sender_id: profile.id, body });
    if (sendError) setError("Pesan privat gagal dikirim: " + sendError.message);
    else {
      setPrivateDraft("");
      await loadPrivateMessages(privateActiveConversation.id);
      await loadPrivateConversations();
    }
    setPrivateSending(false);
  }

  async function hidePrivateConversation() {
    const conversation = privateActiveConversation;
    if (!conversation || !profile?.id) return;
    if (!window.confirm("Hapus chat ini dari daftar Privat Chat Anda? Riwayat dan pesan lawan bicara tetap tersimpan.")) return;
    const { error: hideError } = await supabase.from("private_chat_hidden").insert({ user_id: profile.id, conversation_id: conversation.id });
    if (hideError && hideError.code !== "23505") {
      setError("Chat tidak dapat disembunyikan: " + hideError.message);
      return;
    }
    setPrivateActiveConversation(null);
    setPrivateMessages([]);
    setPrivateDraft("");
    setMessage("Chat dihapus dari daftar Anda. Riwayat lawan bicara tetap tersimpan.");
    await loadPrivateConversations();
  }

  useEffect(() => {
    if (!supabase || !profile?.id || profile.status !== "active" || activeSection !== "private-chat") return undefined;
    let alive = true;
    const refreshPrivateData = async () => {
      await loadPrivateConversations();
      if (privateActiveConversation?.id) await loadPrivateMessages(privateActiveConversation.id);
    };
    refreshPrivateData();
    const refreshTimer = window.setInterval(() => {
      if (alive && document.visibilityState === "visible" && activeSection === "private-chat") refreshPrivateData();
    }, 15000);
    return () => { alive = false; window.clearInterval(refreshTimer); };
  }, [profile?.id, profile?.status, activeSection, privateActiveConversation?.id, memberDirectory.length]);

  const formatBytes = (bytes) => {
    const n = Number(bytes || 0);
    if (n < 1024) return n + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let value = n / 1024; let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return value.toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " " + units[unit];
  };

  async function loadDatabaseMetrics() {
    if (!supabase || profile?.role !== "admin" || profile?.status !== "active") return;
    setDbMetricsLoading(true);
    const { data, error: metricsError } = await supabase.rpc("admin_database_storage_metrics");
    if (metricsError) setError("Indikator penyimpanan database gagal dimuat: " + metricsError.message);
    else setDbMetrics(data);
    setDbMetricsLoading(false);
  }

  useEffect(() => {
    if (profile?.role === "admin" && profile?.status === "active" && activeSection === "home") {
      loadDatabaseMetrics();
    }
  }, [profile?.id, profile?.role, profile?.status, activeSection]);

  async function clearChatHistory() {
    // This action is restricted to the active Developer only.
    if (profile?.role !== "admin" || profile?.status !== "active" || !supabase) {
      setError("Hanya Developer aktif yang dapat mengosongkan riwayat chat.");
      return;
    }
    if (!window.confirm("Kosongkan SELURUH riwayat ruang chat sekarang? Semua pesan anggota akan dihapus permanen. Data anggota, saldo, kas, dan pembayaran tidak terpengaruh.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { data, error: clearError } = await supabase.rpc("admin_clear_chat_messages");
      if (clearError || data?.success !== true) {
        setError("Riwayat chat gagal dikosongkan: " + (clearError?.message || "Operasi tidak berhasil."));
      } else {
        setMessage("Riwayat chat berhasil dikosongkan. " + Number(data.deleted_count || 0) + " pesan dihapus.");
        await loadChatMessages();
      }
    } catch (clearException) {
      setError("Riwayat chat gagal dikosongkan: " + (clearException?.message || "Terjadi kesalahan koneksi."));
    } finally {
      setBusy(false);
    }
  }

  async function clearRankChat456History() {
    if (profile?.role !== "admin" || profile?.status !== "active" || !supabase) {
      setError("Hanya Developer aktif yang dapat mengosongkan riwayat ruang chat P4/P5/P6.");
      return;
    }
    if (!window.confirm("Kosongkan SELURUH riwayat Ruang Chat P4/P5/P6? Pesan di ruang khusus ini akan dihapus permanen. Riwayat Chat Anggota, data anggota, saldo, kas, dan pembayaran tidak terpengaruh.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { data, error: clearError } = await supabase.rpc("admin_clear_p4_p5_p6_chat_messages");
      if (clearError || data?.success !== true) {
        setError("Riwayat Ruang Chat P4/P5/P6 gagal dikosongkan: " + (clearError?.message || "Operasi tidak berhasil."));
      } else {
        setMessage("Riwayat Ruang Chat P4/P5/P6 berhasil dibersihkan. " + Number(data.deleted_count || 0) + " pesan dihapus.");
        await loadRankChat456Messages();
      }
    } catch (clearException) {
      setError("Riwayat Ruang Chat P4/P5/P6 gagal dikosongkan: " + (clearException?.message || "Terjadi kesalahan koneksi."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteChatMessage(messageId) {
    if (!window.confirm("Hapus pesan ini dari ruang chat?")) return;
    const { error: deleteError } = await supabase.from("chat_messages").delete().eq("id", messageId);
    if (deleteError) setError("Pesan gagal dihapus: " + deleteError.message);
    else { setMessage("Pesan berhasil dihapus."); await loadChatMessages(); }
  }

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    setSession(null); setProfile(null); setWallet(null); setSettings(null); setPayments([]);
    setPassword(""); setBusy(false);
  }

  const isAdminMaster = profile?.role === "admin" && profile?.status === "active";
  const isAdminAssistant = profile?.role === "admin_assistant" && profile?.status === "active";
  const canSendInformation = profile?.status === "active" && (["admin", "admin_assistant"].includes(profile?.role) || ["P5", "P6"].includes(profile?.rank_code));
  const canAccessRankChat = profile?.status === "active" && (["P5", "P6"].includes(profile?.rank_code) || profile?.role === "admin");
  const canAccessSeniorChat = profile?.status === "active" && (["P4", "P5", "P6"].includes(profile?.rank_code) || profile?.role === "admin");
  const canAccessRankChat456 = profile?.status === "active" && (["P4", "P5", "P6"].includes(profile?.rank_code) || profile?.role === "admin");
  const filteredAdminMembers = adminMembers.filter((m) => (isAdminMaster || ["P1", "P2", "P3"].includes(m.rank_code || "P1")) && (String(m.display_name || "") + " " + String(m.login_username || "") + " " + String(m.phone_number || "")).toLowerCase().includes(memberSearch.trim().toLowerCase()));
  const filteredMemberDirectory = memberDirectory.filter((m) => (String(m.display_name || "") + " " + String(m.login_username || "") + " " + String(m.phone_number || "")).toLowerCase().includes(memberSearch.trim().toLowerCase()));

  useEffect(() => {
    let alive = true;
    if (!supabase || !profile?.profile_photo_path) { setProfilePhotoUrl(null); return () => { alive = false; }; }
    supabase.storage.from("profile-photos").createSignedUrl(profile.profile_photo_path, 3600).then(({ data, error: signedError }) => {
      if (alive) setProfilePhotoUrl(signedError ? null : data?.signedUrl || null);
    });
    return () => { alive = false; };
  }, [profile?.profile_photo_path, refreshVersion]);

  useEffect(() => {
    if (!supabase || !profile?.id || profile.status !== "active") { setMemberDirectory([]); return undefined; }
    let alive = true;
    (async () => {
      const { data, error: directoryError } = await supabase.rpc("get_public_member_directory");
      if (!alive) return;
      if (directoryError) {
        setMemberDirectory([]);
        setError("Daftar anggota belum dapat dimuat. " + directoryError.message);
        return;
      }
      const membersWithPhotos = await withPhotoUrls((data || []).map((m) => ({ ...m, rank_code: normalizeRankCode(m.rank_code) })));
      if (alive) setMemberDirectory(membersWithPhotos.sort(compareMemberRank));
    })();
    return () => { alive = false; };
  }, [profile?.id, profile?.status, refreshVersion]);

  useEffect(() => {
    if (profile?.id && profile?.status === "active") setActiveSection("information");
    setDrawerOpen(false);
  }, [profile?.id, profile?.role, profile?.status]);

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
    const isAdmin = ["admin", "admin_assistant"].includes(profile.role) && profile.status === "active";
    if (profile.status === "inactive") {
      return <main className="page-shell"><section className="panel"><Brand branding={branding} /><div className="eyebrow"><span className="status-dot red" /> AKUN NONAKTIF</div><h1>Akses dinonaktifkan</h1><p className="intro">Akun ini sedang dinonaktifkan oleh admin. Riwayat dan catatan kas tetap tersimpan. Hubungi admin utama jika membutuhkan peninjauan.</p><button className="secondary full" onClick={signOut} disabled={busy}>Keluar</button><footer>©Designed by Vergil D Ajax</footer></section></main>;
    }
    if (profile.status === "pending" || profile.status === "rejected") {
      return <main className="page-shell"><section className="panel"><Brand branding={branding} /><div className="eyebrow"><span className={profile.status === "pending" ? "status-dot" : "status-dot red"} /> STATUS PENDAFTARAN</div><h1>{profile.status === "pending" ? "Menunggu persetujuan" : "Pendaftaran ditolak"}</h1><p className="intro">Halo, {profile.display_name}. {profile.status === "pending" ? "Admin utama perlu menyetujui akun sebelum fitur anggota dapat digunakan." : "Akun ini belum mendapat akses. Hubungi admin utama jika perlu peninjauan."}</p><div className="notice"><strong>Username</strong><p>{profile.login_username}</p><strong>Status</strong><p>{profile.status === "pending" ? "Menunggu persetujuan" : "Ditolak"}</p></div>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<button className="secondary full" onClick={signOut} disabled={busy}>Keluar</button><footer>©Designed by Vergil D Ajax</footer></section></main>;
    }
    if (!wallet) return <main className="page-shell"><section className="panel"><Brand branding={branding} /><h1>Akun belum siap</h1><p className="intro">Profil berhasil ditemukan, tetapi dompet kas belum tersedia. Jangan lakukan pembayaran sampai admin menyelesaikan penyiapan akun.</p><button className="secondary full" onClick={signOut}>Keluar</button><footer>©Designed by Vergil D Ajax</footer></section></main>;
    return <main className="dashboard-shell" data-view={isAdmin ? (activeSection === "home" ? "admin-home" : activeSection) : (activeSection === "home" ? "member-home" : activeSection)}>{(error || message) && <div className={"app-toast " + (error ? "app-toast-error" : "app-toast-success")} role={error ? "alert" : "status"}>{error || message}</div>}<header className="dashboard-header"><button className="hamburger-button" aria-label={drawerOpen ? "Tutup menu" : "Buka menu"} aria-expanded={drawerOpen} onClick={()=>setDrawerOpen((open)=>!open)}><span></span><span></span><span></span></button><Brand compact branding={branding} /><div className="review-actions"><button className="secondary" onClick={()=>setRefreshVersion((value)=>value+1)} disabled={loading}>Segarkan</button><button className="secondary" onClick={signOut} disabled={busy}>Keluar ↗</button></div></header><div className={"drawer-backdrop" + (drawerOpen ? " open" : "")} onClick={()=>setDrawerOpen(false)}></div><nav className={"app-drawer" + (drawerOpen ? " open" : "")} aria-label="Menu utama"><div className="drawer-heading"><strong>{isAdmin ? "MENU ADMIN" : "MENU ANGGOTA"}</strong><button className="drawer-close" onClick={()=>setDrawerOpen(false)} aria-label="Tutup menu">×</button></div><button className={activeSection==="information"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("information");setDrawerOpen(false);}}><span className="drawer-icon" aria-hidden="true"><DrawerIcon name="info" /></span><span className="drawer-label">Informasi</span>{informationUnreadNotice>0 && <span className="notification-badge" aria-label={informationUnreadNotice+" informasi belum dibaca"}>{informationUnreadNotice>99?"99+":informationUnreadNotice}</span>}</button><button className={activeSection==="home"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("home");setDrawerOpen(false);}}><span className="drawer-icon" aria-hidden="true"><DrawerIcon name="home" /></span><span className="drawer-label">Beranda</span></button><button className={activeSection==="permissions"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("permissions");setDrawerOpen(false);}}><span className="drawer-icon" aria-hidden="true"><DrawerIcon name="permit" /></span><span className="drawer-label">Kamar Perizinan</span>{permissionsUnreadNotice>0 && <span className="notification-badge" aria-label={permissionsUnreadNotice+" pesan perizinan baru"}>{permissionsUnreadNotice>99?"99+":permissionsUnreadNotice}</span>}</button><button className={activeSection==="chat"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("chat");setDrawerOpen(false);}}><span className="drawer-icon" aria-hidden="true"><DrawerIcon name="chat" /></span><span className="drawer-label">Chat anggota</span>{chatUnreadNotice>0 && <span className="notification-badge" aria-label={chatUnreadNotice+" pesan chat belum dibaca"}>{chatUnreadNotice>99?"99+":chatUnreadNotice}</span>}</button><button className={activeSection==="private-chat"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("private-chat");setDrawerOpen(false);}}><span className="drawer-icon" aria-hidden="true"><DrawerIcon name="mail" /></span><span className="drawer-label">Privat Chat</span>{privateChatUnreadNotice>0 && <span className="notification-badge" aria-label={privateChatUnreadNotice+" pesan privat belum dibaca"}>{privateChatUnreadNotice>99?"99+":privateChatUnreadNotice}</span>}</button>{canAccessRankChat && <button className={activeSection==="p5-p6-chat"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("p5-p6-chat");setLeadersUnreadNotice(0);setDrawerOpen(false);}}><span className="drawer-icon drawer-rank-emblem" aria-hidden="true"><RankBadge rank="P6" /></span><span className="drawer-label">Leaders</span>{leadersUnreadNotice>0 && <span className="notification-badge">{leadersUnreadNotice>99?"99+":leadersUnreadNotice}</span>}</button>}{canAccessRankChat456 && <button className={activeSection==="p4-p5-p6-chat"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("p4-p5-p6-chat");setStaffUnreadNotice(0);setDrawerOpen(false);}}><span className="drawer-icon drawer-rank-emblem"><RankBadge rank="P4" /></span><span className="drawer-label">Ruang Chat Staff (P4)</span>{staffUnreadNotice>0 && <span className="notification-badge">{staffUnreadNotice>99?"99+":staffUnreadNotice}</span>}</button>}<button className={activeSection==="member-directory"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("member-directory");setDrawerOpen(false);}}><span className="drawer-icon" aria-hidden="true"><DrawerIcon name="members" /></span><span className="drawer-label">Daftar anggota</span></button>{isAdmin ? <><button className={activeSection==="admin-registrations"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("admin-registrations");setDrawerOpen(false);}}><span className="drawer-icon" aria-hidden="true"><DrawerIcon name="register" /></span><span className="drawer-label">Pendaftaran anggota</span>{pendingRegistrationNotice>0 && <span className="notification-badge" aria-label={pendingRegistrationNotice+" pendaftaran menunggu"}>{pendingRegistrationNotice>99?"99+":pendingRegistrationNotice}</span>}</button><button className={activeSection==="admin-payments"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("admin-payments");setDrawerOpen(false);}}><span className="drawer-icon" aria-hidden="true"><DrawerIcon name="payment" /></span><span className="drawer-label">Pengajuan pembayaran</span>{pendingPaymentNotice>0 && <span className="notification-badge" aria-label={pendingPaymentNotice+" pembayaran menunggu"}>{pendingPaymentNotice>99?"99+":pendingPaymentNotice}</span>}</button><button className={activeSection==="admin-members"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("admin-members");setDrawerOpen(false);}}><span className="drawer-icon" aria-hidden="true"><DrawerIcon name="members" /></span><span className="drawer-label">Manajemen anggota</span></button>{isAdminMaster && <><button className={activeSection==="admin-recap"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("admin-recap");setDrawerOpen(false);}}><span className="drawer-icon" aria-hidden="true"><DrawerIcon name="ledger" /></span><span className="drawer-label">List nama anggota di WEBKAS</span></button><button className={activeSection==="admin-settings"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("admin-settings");setDrawerOpen(false);}}><span className="drawer-icon" aria-hidden="true"><DrawerIcon name="settings" /></span><span className="drawer-label">Pengaturan</span></button></>}<button className={activeSection==="admin-profile-settings"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("admin-profile-settings");setDrawerOpen(false);}}><span className="drawer-icon" aria-hidden="true"><DrawerIcon name="settings" /></span><span className="drawer-label">Pengaturan profil</span></button>{isAdminMaster && <button className={activeSection==="admin-transactions"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("admin-transactions");setDrawerOpen(false);}}><span className="drawer-icon" aria-hidden="true"><DrawerIcon name="wallet" /></span><span className="drawer-label">Transaksi</span></button>}</> : <><button className={activeSection==="member-payments"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("member-payments");setDrawerOpen(false);}}><span className="drawer-icon" aria-hidden="true"><DrawerIcon name="payment" /></span><span className="drawer-label">Pengajuan pembayaran</span></button><button className={activeSection==="member-history"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("member-history");setDrawerOpen(false);}}><span className="drawer-icon" aria-hidden="true"><DrawerIcon name="history" /></span><span className="drawer-label">Riwayat pengajuan</span></button><button className={activeSection==="member-settings"?"drawer-item active":"drawer-item"} onClick={()=>{setActiveSection("member-settings");setDrawerOpen(false);}}><span className="drawer-icon" aria-hidden="true">⚙️</span><span className="drawer-label">Pengaturan profil</span></button></>}</nav><section className="welcome-panel"><div className="eyebrow">AKUN {isAdmin ? "ADMIN" : "ANGGOTA"} · {profile.status === "active" ? "AKTIF" : profile.status.toUpperCase()}</div><h1 className="welcome-name-with-rank">Halo, <span>{profile.display_name}</span>{(profile.role === "admin" || profile.role === "admin_assistant") && <RankBadge rank={profile.rank_code || "P1"} isAdmin={profile.role === "admin"} isAssistant={profile.role === "admin_assistant"} />}</h1><div className="welcome-profile-row"><div className="profile-avatar-wrap">{profilePhotoUrl ? <img className="profile-avatar" src={profilePhotoUrl} alt={"Foto profil " + profile.display_name} /> : <span className="profile-avatar-fallback">{String(profile.display_name || "?").slice(0,1).toUpperCase()}</span>}</div><div className="welcome-profile-details">{profile.role !== "admin" && profile.role !== "admin_assistant" && <RankBadge rank={profile.rank_code || "P1"} />}<span className="welcome-status"><span className="status-dot" /> Status: Aktif</span></div><div className="welcome-app-actions"><div className="welcome-app-label"><img src="/icons/webkas-app.svg" alt="" /><span>Aplikasi WEBKAS</span></div><button id="webkas-app-open" className="welcome-app-open" type="button" aria-haspopup="dialog" aria-controls="webkas-app-dialog">Unduh / Pasang</button></div></div><p className="muted">Selamat datang kembali di {branding.family_name || "komunitas"}.</p></section><section id="leave-permissions-panel" className="panel history-panel leave-permissions-panel"><div className="leave-room-heading"><div><div className="eyebrow">RUANG BERSAMA ANGGOTA</div><h2>🛂 Kamar Perizinan</h2><p className="muted">Semua member dapat melihat pesan izin yang dikirim di ruangan ini.</p></div><span className="pill">{leaveRequests.length} pesan</span></div><div className="leave-chat-window" aria-live="polite">{leaveLoading && !leaveRequests.length ? <p className="muted">Memuat pesan perizinan…</p> : leaveRequests.length ? <div className="leave-chat-list">{[...leaveRequests].reverse().map((request)=><article className={"leave-chat-message" + (request.member_id===session?.user?.id ? " own-message" : "")} key={request.id}><div className="leave-chat-message-head"><RankBadge rank={request.rank_code || "P1"} isAdmin={request.role === "admin"} isAssistant={request.role === "admin_assistant"}/><div className="leave-chat-sender"><strong>{request.display_name || "Anggota"}</strong><small>{request.role === "admin" ? "Developer" : request.role === "admin_assistant" ? "Admin Asisten" : rankDisplayLabel(request.rank_code, true)}</small></div><time dateTime={request.created_at}>{new Date(request.created_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})} WIB</time>{isAdmin && <button type="button" className="danger-button leave-chat-delete" onClick={()=>deleteLeaveRequest(request)} disabled={leaveDeletingId===request.id} aria-label="Hapus pesan perizinan">{leaveDeletingId===request.id ? "Menghapus…" : "🗑️ Hapus"}</button>}</div><div className="leave-chat-type">{request.leave_type === "offline" ? "🕒 Izin Offline · " + request.offline_days + " hari" : "📌 Izin Tidak WB"}</div><p className="leave-chat-reason">{request.reason}</p></article>)}</div> : <div className="leave-chat-empty"><span>🛂</span><strong>Belum ada pesan perizinan</strong><p>Pengajuan pertama yang dikirim akan tampil di sini dan bisa dilihat semua member.</p></div>}</div><form className="leave-chat-composer" onSubmit={submitLeaveRequest}><div className="leave-chat-format"><label>Format izin<select value={leaveType} onChange={(event)=>setLeaveType(event.target.value)} disabled={leaveSending}><option value="offline">Izin Offline</option><option value="not_wb">Izin Tidak WB</option></select></label>{leaveType === "offline" && <label className="leave-chat-days">Jumlah hari<input type="number" min="1" max="365" step="1" value={leaveDays} onChange={(event)=>setLeaveDays(event.target.value)} required placeholder="Hari" disabled={leaveSending}/></label>}</div><div className="leave-chat-compose-row"><textarea aria-label="Keterangan izin" value={leaveReason} onChange={(event)=>setLeaveReason(event.target.value)} maxLength={1000} rows={2} required placeholder={leaveType === "offline" ? "Tulis keterangan izin offline… (Enter untuk kirim, Shift+Enter untuk baris baru)" : "Tulis alasan tidak WB… (Enter untuk kirim, Shift+Enter untuk baris baru)"} disabled={leaveSending} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit();}}}/><button className="primary leave-chat-send" type="submit" disabled={leaveSending || !leaveReason.trim()} aria-label="Kirim pesan perizinan">{leaveSending ? "…" : "➤"}</button></div>{(error || message) && <p className={error ? "leave-chat-feedback error-text" : "leave-chat-feedback"}>{error || message}</p>}</form></section><section id="member-directory" className="panel history-panel"><div className="section-head"><div><div className="eyebrow">DAFTAR ANGGOTA</div><h2>Jajaran anggota</h2></div><span className="pill">{filteredMemberDirectory.length} anggota</span></div><p className="muted">Daftar ini hanya untuk dilihat. Pengelolaan anggota dan tindakan admin tidak tersedia di sini.</p><label className="member-search">Cari anggota<input type="search" value={memberSearch} onChange={(e)=>setMemberSearch(e.target.value)} placeholder="Cari nama atau username" /></label>{filteredMemberDirectory.length ? Object.keys(rankOrder).map((rankCode)=>{const groupMembers=filteredMemberDirectory.filter((m)=>(m.rank_code && rankOrder[m.rank_code]!==undefined ? m.rank_code : "P1")===rankCode);return groupMembers.length ? <section className="member-rank-group" key={rankCode}><div className="member-rank-group-heading"><div><RankBadge rank={rankCode} /><strong>{rankDisplayLabel(rankCode, true)}</strong></div><span className="pill">{groupMembers.length}</span></div><div className="member-card-grid">{groupMembers.map((m)=><article className="member-card member-directory-card" key={m.id}><div className="member-card-top"><div className="member-avatar-frame">{m.profile_photo_url ? <img className="member-avatar" src={m.profile_photo_url} alt={"Foto "+m.display_name} loading="lazy" /> : <span className="member-avatar-fallback">{String(m.display_name||"?").slice(0,1).toUpperCase()}</span>}</div><div className="member-card-details"><div className="member-rank-line"><RankBadge rank={m.rank_code || "P1"} /><span className="member-rank-name">{rankNames[m.rank_code || "P1"] || "Anggota"}</span></div><div className="member-name-bar"><strong className="member-character-name">{m.display_name}</strong>{m.phone_number && <div className="member-phone-compact member-phone-inline"><button type="button" className="member-phone-toggle" aria-label={(openMemberPhone===m.id?"Sembunyikan":"Tampilkan")+" nomor HP "+m.display_name} aria-expanded={openMemberPhone===m.id} title={openMemberPhone===m.id?"Sembunyikan nomor HP":"Tampilkan nomor HP"} onClick={()=>setOpenMemberPhone((current)=>current===m.id?null:m.id)}><span aria-hidden="true">☎</span></button>{openMemberPhone===m.id && <a className="member-phone-link" href={"tel:" + m.phone_number.replace(/[^0-9+]/g, "")}>{m.phone_number}</a>}</div>}</div><small className="muted">@{m.login_username}</small></div></div></article>)}</div></section> : null;}) : <p className="muted">{memberDirectory.length ? "Tidak ada anggota yang cocok dengan pencarian." : "Daftar anggota belum tersedia."}</p>}</section>{isAdmin && <section className="panel db-usage-panel"><div className="section-head"><div><div className="eyebrow">MONITORING SISTEM</div><h2>Penyimpanan Database</h2><p className="muted">Pantau ukuran database, tabel aplikasi, chat, dan berkas yang tersimpan.</p></div><button className="secondary" onClick={loadDatabaseMetrics} disabled={dbMetricsLoading}>{dbMetricsLoading ? "Memuat…" : "Perbarui"}</button></div>{dbMetrics ? <><div className="db-usage-grid"><div className="db-usage-card"><span>Ukuran database</span><strong>{formatBytes(dbMetrics.database_bytes)}</strong><small>Total ukuran database PostgreSQL saat ini</small></div><div className="db-usage-card"><span>Tabel aplikasi</span><strong>{formatBytes(dbMetrics.public_tables_bytes)}</strong><small>Ukuran tabel beserta indeks</small></div><div className="db-usage-card"><span>Penyimpanan berkas</span><strong>{formatBytes(dbMetrics.storage_bytes)}</strong><small>{Number(dbMetrics.storage_objects_count||0).toLocaleString("id-ID")} objek file</small></div><div className="db-usage-card"><span>Ruang chat</span><strong>{Number(dbMetrics.chat_messages_count||0).toLocaleString("id-ID")} pesan</strong><small>Perkiraan ukuran baris chat: {formatBytes(dbMetrics.chat_bytes_estimate)}</small></div></div><div className="db-usage-meter"><div className="db-usage-meter-head"><strong>Penggunaan kuota database</strong><span>{Number(dbMetrics.usage_percent||0).toLocaleString("id-ID",{maximumFractionDigits:2})}% · {formatBytes(dbMetrics.database_bytes)} / {formatBytes(dbMetrics.plan_limit_bytes)}</span></div><div className="db-usage-meter-track"><span style={{width:Math.min(100,Number(dbMetrics.usage_percent||0))+"%",background:Number(dbMetrics.usage_percent||0)>=80?"#ef6464":Number(dbMetrics.usage_percent||0)>=65?"#e8b84d":"var(--accent,#c1f45a)"}} /></div><div className="db-usage-quota-note"><strong>Pembersihan otomatis pada 80% (400 MiB)</strong><p className="muted">Pemeriksaan berjalan setiap 15 menit. Saat ambang tercapai, chat dibersihkan lalu riwayat pengajuan pembayaran yang sudah disetujui/ditolak dan transaksi kredit terkait dihapus tanpa mengubah saldo. Untuk mencegah penghapusan berulang saat PostgreSQL belum merebut kembali ruang fisik, pembersihan dibatasi sekali per 24 jam.</p>{dbMetrics.last_auto_cleanup_at && <p className="muted">Pembersihan terakhir: {new Date(dbMetrics.last_auto_cleanup_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})} WIB · {Number(dbMetrics.last_auto_cleanup_chat_deleted||0).toLocaleString("id-ID")} pesan chat dan {Number(dbMetrics.last_auto_cleanup_payment_deleted||0).toLocaleString("id-ID")} riwayat pembayaran dihapus.</p>}</div>{isAdminMaster && <div className="db-usage-meter storage-usage-meter"><div className="db-usage-meter-head"><strong>Penggunaan kuota Storage Supabase</strong><span>{(Number(dbMetrics.storage_bytes||0)/(1024*1024*1024)*100).toLocaleString("id-ID",{maximumFractionDigits:2})}% · {formatBytes(dbMetrics.storage_bytes)} / {formatBytes(1024*1024*1024)}</span></div><div className="db-usage-meter-track"><span style={{width:Math.min(100,Number(dbMetrics.storage_bytes||0)/(1024*1024*1024)*100)+"%",background:Number(dbMetrics.storage_bytes||0)/(1024*1024*1024)*100>=80?"#ef6464":Number(dbMetrics.storage_bytes||0)/(1024*1024*1024)*100>=65?"#e8b84d":"var(--accent,#c1f45a)"}} /></div><div className="db-usage-quota-note"><strong>{Number(dbMetrics.storage_bytes||0)/(1024*1024*1024)*100>=80?"Peringatan tinggi: penggunaan Storage mencapai 80% atau lebih":Number(dbMetrics.storage_bytes||0)/(1024*1024*1024)*100>=65?"Peringatan: penggunaan Storage mencapai ambang 65%":"Storage masih di bawah ambang peringatan 65%"}</strong><p className="muted">Indikator memakai estimasi kuota Storage paket Free sebesar 1 GiB. Periksa halaman Usage di Dashboard Supabase untuk memastikan kuota dan pemakaian resmi. Indikator ini hanya memantau dan tidak menghapus berkas.</p><p className="muted">Perkiraan ruang tersisa: {formatBytes(Math.max(0,1024*1024*1024-Number(dbMetrics.storage_bytes||0)))}</p></div></div>}<small className="muted">Data diperbarui: {new Date(dbMetrics.measured_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})} WIB</small></div></> : <p className="muted">{dbMetricsLoading ? "Mengambil statistik database…" : "Statistik belum dimuat. Tekan Perbarui untuk mencoba lagi."}</p>}</section>}<section id="information-panel" className="panel history-panel information-panel"><div className="section-head"><div><div className="eyebrow"><span aria-hidden="true">📢</span> PENGUMUMAN RESMI</div><h2>Informasi</h2><p className="muted">Pesan resmi komunitas untuk seluruh anggota.</p></div><span className="pill">{informationMessages.length} informasi</span></div>{canSendInformation && <form className="information-compose" onSubmit={sendInformationMessage}><label htmlFor="information-draft">Tulis informasi<textarea id="information-draft" value={informationDraft} onChange={(event)=>setInformationDraft(event.target.value)} maxLength={2000} rows={4} placeholder="Tulis informasi penting untuk seluruh anggota…" /></label><div className="information-compose-footer"><small className="muted">{informationDraft.length}/2000 karakter · hanya pengirim yang berwenang</small><button className="primary" type="submit" disabled={informationSending || !informationDraft.trim()}>{informationSending ? "Mengirim…" : "📢 Kirim informasi"}</button></div></form>}{}<div className="information-list" aria-live="polite">{informationMessages.length ? informationMessages.map((item)=><article className="information-card" key={item.id}><div className="information-card-head"><span className="information-megaphone" aria-hidden="true">📢</span><div><strong>{item.sender_id===session?.user?.id ? profile?.display_name : (memberDirectory.find((member)=>member.id===item.sender_id)?.display_name || adminMembers.find((member)=>member.id===item.sender_id)?.display_name || "Anggota")}</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})} WIB</time></div></div><p className="information-message-body">{item.body}</p>{canSendInformation && (item.sender_id===session?.user?.id || isAdminMaster) && <div className="information-card-actions"><button type="button" className="danger-button chat-icon-button" disabled={busy} onClick={()=>deleteInformationMessage(item)} aria-label="Hapus informasi" title="Hapus informasi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg></button></div>}</article>) : <div className="notice"><strong>Belum ada informasi</strong><p>Informasi resmi yang dikirim akan muncul di sini dengan logo toa 📢.</p></div>}</div></section><section id="chat-panel" className="panel history-panel chat-panel"><div className="chat-header-actions chat-icon-actions"><button type="button" className="secondary chat-icon-button" onClick={(event)=>{event.preventDefault();event.stopPropagation();refreshChatMessages();}} disabled={chatRefreshing} aria-label={chatRefreshing ? "Memperbarui chat" : "Segarkan chat"} title={chatRefreshing ? "Memperbarui chat…" : "Segarkan chat"}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6.8L20 12M4 12l2 5.2A7 7 0 0 0 18.4 15"/></svg></button>{isAdminMaster && <button type="button" className="danger-button chat-icon-button" disabled={busy} onClick={(event)=>{event.preventDefault();event.stopPropagation();clearChatHistory();}} aria-label="Kosongkan riwayat chat" title="Kosongkan riwayat chat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg></button>}</div>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<div className="chat-message-list" aria-live="polite" ref={chatListRef}>{chatMessages.length ? chatMessages.map((m)=><article key={m.id} className={"chat-message" + (m.sender_id===session?.user?.id ? " own" : "")}><div className="chat-message-sender"><div className="chat-sender-avatar">{m.sender_profile_photo_url ? <img src={m.sender_profile_photo_url} alt={"Foto profil " + (m.sender_display_name || "anggota")} loading="lazy" /> : <span>{String(m.sender_display_name || "A").slice(0,1).toUpperCase()}</span>}</div><div className="chat-sender-identity"><div className="chat-sender-columns"><div className="chat-sender-name-line"><button type="button" className="chat-profile-trigger" onClick={()=>openChatProfile(m.sender_id)} title={"Lihat profil " + (m.sender_display_name || "anggota")}>{m.sender_display_name || "Anggota"}</button></div><div className="chat-sender-rank-column">{(m.sender_role==="admin" || m.sender_role==="admin_assistant") && <RankBadge rank={m.sender_rank_code || "P1"} isAdmin={m.sender_role === "admin"} isAssistant={m.sender_role === "admin_assistant"} />}<RankBadge rank={m.sender_rank_code || "P1"} /><span>{rankNames[m.sender_rank_code || "P1"] || "Anggota"}</span></div></div></div><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})} WIB</time></div><p>{m.body}</p>{(m.sender_id===session?.user?.id || isAdmin) && <button type="button" className="text-button chat-delete" onClick={()=>deleteChatMessage(m.id)}>Hapus pesan</button>}</article>) : <div className="chat-empty"><span>✦</span><strong>Belum ada pesan</strong><p>Mulai percakapan dengan menyapa anggota lainnya.</p></div>}</div><form className="chat-compose" onSubmit={sendChatMessage}><label className="sr-only" htmlFor="chat-message-draft">Tulis pesan</label><textarea id="chat-message-draft" value={chatDraft} onChange={(e)=>setChatDraft(e.target.value)} maxLength={2000} rows={2} placeholder="Tulis pesan untuk anggota…" required /><div className="chat-compose-footer"><small className="muted">{chatDraft.length}/2000 karakter · Jangan bagikan kata sandi atau informasi rahasia.</small><button className="primary" disabled={chatSending || !chatDraft.trim()}><svg className="chat-send-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 15 22 11 13 2 9 22 2Z" fill="currentColor"/><path d="M22 2 11 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg><span className="sr-only">{chatSending ? "Mengirim pesan…" : "Kirim pesan"}</span></button></div></form>{(chatProfileLoading || chatProfile) && <div className="chat-profile-backdrop" role="presentation" onClick={()=>{if(!chatProfileLoading)setChatProfile(null);}}><section className="chat-profile-modal" role="dialog" aria-modal="true" aria-label="Profil anggota" onClick={(e)=>e.stopPropagation()}><button type="button" className="modal-close chat-profile-close" aria-label="Tutup profil" onClick={()=>{setChatProfile(null);setChatProfileLoading(false);}}>×</button>{chatProfileLoading ? <p className="muted">Memuat profil anggota…</p> : chatProfile && <><div className="chat-profile-summary"><div className="profile-avatar-wrap">{chatProfile.profile_photo_url ? <img className="profile-avatar" src={chatProfile.profile_photo_url} alt={"Foto profil " + chatProfile.display_name} /> : <span className="profile-avatar-fallback">{String(chatProfile.display_name || "?").slice(0,1).toUpperCase()}</span>}</div><div><h3 className="profile-name-with-rank">{chatProfile.display_name}{(chatProfile.role==="admin" || chatProfile.role==="admin_assistant") && <><RankBadge rank={chatProfile.rank_code || "P1"} isAdmin={chatProfile.role === "admin"} isAssistant={chatProfile.role === "admin_assistant"} /><RankBadge rank={chatProfile.rank_code || "P1"} /><span>{rankNames[chatProfile.rank_code || "P1"] || "Anggota"}</span></>}</h3>{chatProfile.role!=="admin" && chatProfile.role!=="admin_assistant" && <div className="chat-sender-rank"><RankBadge rank={chatProfile.rank_code || "P1"} /><span>{rankNames[chatProfile.rank_code || "P1"] || "Anggota"}</span></div>}<span className="pill active">Aktif</span></div></div><div className="chat-profile-details"><div><span>Nomor HP / WhatsApp</span>{chatProfile.phone_number ? <a href={"tel:" + chatProfile.phone_number.replace(/[^0-9+]/g, "")}>{chatProfile.phone_number}</a> : <strong className="muted">Belum diisi</strong>}</div><div><span>Saldo kas</span><strong>{money(chatProfile.balance)}</strong></div><div><span>Tunggakan kas</span><strong className={Number(chatProfile.arrears)>0 ? "amount-danger" : ""}>{money(chatProfile.arrears)}</strong></div><div><span>Tanggal bergabung</span><strong>{date(String(chatProfile.created_at || "").slice(0,10))}</strong></div></div></>}</section></div>}</section><section id="rank-chat-panel" className="panel history-panel rank-chat-panel"><div className="section-head"><div><div className="eyebrow">RUANG TERBATAS</div><h2 className="chat-room-title"><RankBadge rank="P6" /> Leaders</h2><p className="muted">Percakapan khusus pangkat P5 (UnderBoss) dan P6 (Boss). Akses dibatasi di database.</p></div><button type="button" className="secondary chat-icon-button" onClick={refreshRankChatMessages} disabled={rankChatRefreshing} aria-label="Segarkan ruang chat P5/P6" title="Segarkan ruang chat">{rankChatRefreshing ? "…" : "↻"}</button>{isAdminMaster && <button type="button" className="danger-button chat-icon-button" disabled={busy} onClick={(event)=>{event.preventDefault();event.stopPropagation();clearRankChatHistory();}} aria-label="Bersihkan riwayat chat P5/P6" title="Bersihkan riwayat chat P5/P6"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg></button>}</div>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<div className="chat-message-list" aria-live="polite">{rankChatMessages.length ? rankChatMessages.map((m)=><article key={m.id} className={"chat-message"+(m.sender_id===session?.user?.id?" own":"")}><div className="chat-message-sender"><div className="chat-sender-avatar">{m.sender_profile_photo_url ? <img src={m.sender_profile_photo_url} alt={"Foto profil "+(m.sender_display_name||"anggota")} loading="lazy"/> : <span>{String(m.sender_display_name||"A").slice(0,1).toUpperCase()}</span>}</div><div className="chat-sender-identity"><div className="chat-sender-name-line"><button type="button" className="chat-profile-trigger" onClick={()=>openChatProfile(m.sender_id)} title={"Lihat profil "+(m.sender_display_name||"anggota")}>{m.sender_display_name||"Anggota"}</button></div><div className="chat-sender-rank-column"><>{(m.sender_role==="admin" || m.sender_role==="admin_assistant") && <RankBadge rank={m.sender_rank_code||"P1"} isAdmin={m.sender_role==="admin"} isAssistant={m.sender_role==="admin_assistant"}/>}<RankBadge rank={m.sender_rank_code||"P1"}/><span>{rankNames[m.sender_rank_code||"P1"]||"Anggota"}</span></></div></div><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})} WIB</time></div><p>{m.body}</p></article>) : <div className="chat-empty"><span>✦</span><strong>Belum ada pesan</strong><p>Mulai percakapan khusus P5 dan P6.</p></div>}</div><form className="chat-compose" onSubmit={sendRankChat456Message}><label className="sr-only" htmlFor="rank-chat-draft">Tulis pesan ruang P5 dan P6</label><textarea id="rank-chat-draft" value={rankChatDraft} onChange={(e)=>setRankChatDraft(e.target.value)} maxLength={2000} rows={2} placeholder="Tulis pesan khusus P5/P6…" required/><div className="chat-compose-footer"><small className="muted">{rankChatDraft.length}/2000 karakter · Ruang ini hanya untuk P5 dan P6.</small><button className="primary" disabled={rankChatSending||!rankChatDraft.trim()}><svg className="chat-send-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 15 22 11 13 2 9 22 2Z" fill="currentColor"/><path d="M22 2 11 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg><span className="sr-only">{rankChatSending ? "Mengirim pesan…" : "Kirim pesan"}</span></button></div></form></section><section id="rank-chat456-panel" className="panel history-panel rank-chat456-panel"><div className="section-head"><div><div className="eyebrow">RUANG TERBATAS</div><h2 className="chat-room-title"><RankBadge rank="P4" /> Ruang Chat Staff (P4)</h2><p className="muted">Percakapan khusus pangkat P4 (Right Hand), P5 (UnderBoss), dan P6 (Boss). Akses dibatasi di database.</p></div><div className="review-actions"><button type="button" className="secondary chat-icon-button" onClick={refreshRankChat456Messages} disabled={rankChat456Refreshing} aria-label="Segarkan ruang chat P4/P5/P6" title="Segarkan ruang chat">{rankChat456Refreshing ? "…" : "↻"}</button>{isAdminMaster && <button type="button" className="danger-button chat-icon-button" disabled={busy} onClick={(event)=>{event.preventDefault();event.stopPropagation();clearRankChat456History();}} aria-label="Bersihkan riwayat chat P4/P5/P6" title="Bersihkan riwayat chat P4/P5/P6"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg></button>}</div></div>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<div className="chat-message-list" aria-live="polite" ref={rankChat456ListRef}>{rankChat456Messages.length ? rankChat456Messages.map((m)=><article key={m.id} className={"chat-message"+(m.sender_id===session?.user?.id?" own":"")}><div className="chat-message-sender"><div className="chat-sender-avatar">{m.sender_profile_photo_url ? <img src={m.sender_profile_photo_url} alt={"Foto profil "+(m.sender_display_name||"anggota")} loading="lazy"/> : <span>{String(m.sender_display_name||"A").slice(0,1).toUpperCase()}</span>}</div><div className="chat-sender-identity"><div className="chat-sender-name-line"><button type="button" className="chat-profile-trigger" onClick={()=>openChatProfile(m.sender_id)} title={"Lihat profil "+(m.sender_display_name||"anggota")}>{m.sender_display_name||"Anggota"}</button></div><div className="chat-sender-rank-column"><>{(m.sender_role==="admin" || m.sender_role==="admin_assistant") && <RankBadge rank={m.sender_rank_code||"P1"} isAdmin={m.sender_role==="admin"} isAssistant={m.sender_role==="admin_assistant"}/>}<RankBadge rank={m.sender_rank_code||"P1"}/><span>{rankNames[m.sender_rank_code||"P1"]||"Anggota"}</span></></div></div><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})} WIB</time></div><p>{m.body}</p></article>) : <div className="chat-empty"><span>✦</span><strong>Belum ada pesan</strong><p>Mulai percakapan khusus P4, P5, dan P6.</p></div>}</div>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<form className="chat-compose" onSubmit={sendRankChatMessage}><label className="sr-only" htmlFor="rank-chat456-draft">Tulis pesan ruang P4, P5, dan P6</label><textarea id="rank-chat456-draft" value={rankChat456Draft} onChange={(e)=>setRankChat456Draft(e.target.value)} maxLength={2000} rows={2} placeholder="Tulis pesan khusus P4/P5/P6…" required/><div className="chat-compose-footer"><small className="muted">{rankChat456Draft.length}/2000 karakter · Ruang ini hanya untuk P4, P5, dan P6.</small><button className="primary" disabled={rankChat456Sending||!rankChat456Draft.trim()}><svg className="chat-send-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 15 22 11 13 2 9 22 2Z" fill="currentColor"/><path d="M22 2 11 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg><span className="sr-only">{rankChat456Sending ? "Mengirim pesan…" : "Kirim pesan"}</span></button></div></form></section><section id="private-chat-panel" className="panel history-panel private-chat-panel"><div className="section-head private-chat-top"><div><div className="eyebrow">PESAN PRIBADI</div><h2>{privateActiveConversation ? privateActiveConversation.otherMember?.display_name || "Anggota" : "Privat Chat"}</h2><p className="muted">{privateActiveConversation ? "Percakapan hanya dapat dibaca oleh kedua peserta." : "Pilih anggota berdasarkan Nama IC untuk memulai percakapan."}</p></div>{privateActiveConversation && <div className="private-chat-actions"><button type="button" className="secondary" onClick={()=>{setPrivateActiveConversation(null);setPrivateMessages([]);setPrivateDraft("");}}>Kembali</button><button type="button" className="danger-button" onClick={hidePrivateConversation}>Hapus Chat</button></div>}</div>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}{privateActiveConversation ? <><div className="private-message-list" aria-live="polite">{privateMessages.length ? privateMessages.map((m)=><article key={m.id} className={"private-message" + (m.sender_id===profile?.id ? " own" : "")}><div className="private-message-meta"><strong>{m.sender_id===profile?.id ? "Anda" : privateActiveConversation.otherMember?.display_name || "Anggota"}</strong><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})} WIB</time></div><p>{m.body}</p></article>) : <div className="chat-empty"><span>✦</span><strong>Belum ada pesan privat</strong><p>Mulai percakapan dengan mengirim pesan pertama.</p></div>}</div><form className="chat-compose" onSubmit={sendPrivateMessage}><label className="sr-only" htmlFor="private-message-draft">Tulis pesan privat</label><textarea id="private-message-draft" value={privateDraft} onChange={(e)=>setPrivateDraft(e.target.value)} maxLength={2000} rows={2} placeholder="Tulis pesan pribadi…" required /><div className="chat-compose-footer"><small className="muted">{privateDraft.length}/2000 karakter · Hanya peserta percakapan yang dapat membaca pesan.</small><button className="primary" disabled={privateSending || !privateDraft.trim()}><svg className="chat-send-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 15 22 11 13 2 9 22 2Z" fill="currentColor"/><path d="M22 2 11 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg><span className="sr-only">{privateSending ? "Mengirim pesan…" : "Kirim pesan"}</span></button></div></form></> : <><label className="member-search">Cari anggota berdasarkan Nama IC<input type="search" value={privateSearch} onChange={(e)=>setPrivateSearch(e.target.value)} placeholder="Ketik Nama IC anggota…" /></label>{privateSearch.trim() ? <div className="private-conversation-list">{memberDirectory.filter((m)=>m.id!==profile?.id && String(m.display_name||"").toLowerCase().includes(privateSearch.trim().toLowerCase())).slice(0,30).map((m)=><button type="button" className="private-conversation-row" key={m.id} onClick={()=>openPrivateConversation(m)} disabled={privateLoading}><span className="private-conversation-avatar">{String(m.display_name||"?").slice(0,1).toUpperCase()}</span><span className="private-conversation-details"><strong>{m.display_name}</strong><small>{m.rank_code || "Anggota"} · Mulai percakapan</small></span><span className="private-conversation-arrow">›</span></button>)}{!memberDirectory.some((m)=>m.id!==profile?.id && String(m.display_name||"").toLowerCase().includes(privateSearch.trim().toLowerCase())) && <p className="muted">Tidak ada anggota aktif yang cocok dengan Nama IC tersebut.</p>}</div> : <div className="private-conversation-list">{privateConversations.map((conversation)=><button type="button" className="private-conversation-row" key={conversation.id} onClick={()=>openPrivateConversation(conversation.otherMember)} disabled={privateLoading}><span className="private-conversation-avatar">{String(conversation.otherMember?.display_name||"?").slice(0,1).toUpperCase()}</span><span className="private-conversation-details"><strong>{conversation.otherMember?.display_name || "Anggota"}</strong><small>{conversation.lastMessage ? (conversation.lastMessage.sender_id===profile?.id ? "Anda: " : "") + conversation.lastMessage.body : "Belum ada pesan"}</small></span><span className="private-conversation-arrow">›</span></button>)}{!privateConversations.length && <div className="chat-empty"><span>✦</span><strong>Belum ada percakapan</strong><p>Cari Nama IC di atas untuk mengirim pesan pribadi kepada anggota.</p></div>}</div>}</>}</section>{isAdmin && !settings?.cash_operations_enabled && <div className="notice admin-safe-notice"><strong>MODE UJI AMAN — OPERASI KAS TERKUNCI</strong><p>Pengajuan dan persetujuan pembayaran serta pemrosesan harian belum dibuka sampai pengujian regresi selesai.</p></div>}{isAdmin ? <><div className="admin-layout"><div className="admin-content"><section id="admin-profile-settings" className="panel history-panel"><div className="eyebrow">AKUN ADMIN</div><h2>Pengaturan profil</h2><p className="muted">Pengaturan akun admin disamakan dengan anggota. Nama karakter, foto, username, dan kata sandi hanya mengubah akun admin yang sedang masuk.</p>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<div className="profile-photo-settings"><div className="profile-avatar-wrap">{profilePhotoUrl ? <img className="profile-avatar" src={profilePhotoUrl} alt={"Foto profil " + profile.display_name} /> : <span className="profile-avatar-fallback">{String(profile.display_name || "?").slice(0,1).toUpperCase()}</span>}</div><div className="profile-photo-controls"><RankBadge rank={profile.rank_code || "P1"} isAdmin={profile.role === "admin"} isAssistant={profile.role === "admin_assistant"} /><label>Nomor HP / WhatsApp (opsional)<input type="tel" inputMode="tel" autoComplete="tel" value={phoneNumberDraft} onChange={(e)=>setPhoneNumberDraft(e.target.value)} maxLength={24} placeholder="Contoh: 081234567890" /></label><button className="secondary" disabled={busy} onClick={saveMyPhoneNumber}>{busy ? "Menyimpan…" : "SIMPAN NOMOR HP"}</button><label>Nama karakter / nama in-game<input value={profileNameDraft} onChange={(e)=>setProfileNameDraft(e.target.value)} maxLength={80} required /></label><button className="secondary" disabled={busy || !profileNameDraft.trim() || profileNameDraft.trim()===profile.display_name} onClick={saveMyDisplayName}>{busy ? "Menyimpan…" : "SIMPAN NAMA SAYA"}</button><label>Foto profil (JPG/PNG/WEBP, maks. 3 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>setProfilePhotoFile(e.target.files?.[0] || null)} /></label><button className="secondary" disabled={busy || !profilePhotoFile} onClick={saveProfilePhoto}>{busy ? "Menyimpan…" : profile.profile_photo_path ? "GANTI FOTO PROFIL" : "PASANG FOTO PROFIL"}</button><small className="muted">Saat diganti, foto lama langsung dihapus dari penyimpanan.</small></div></div><div className="account-security-settings"><h3>Ganti username</h3><p className="muted">Ketik username baru dua kali dan verifikasi dengan kata sandi saat ini.</p><form className="auth-form" onSubmit={saveAccountUsername}><label>Username baru<input value={newUsernameDraft} onChange={(e)=>setNewUsernameDraft(e.target.value)} minLength={3} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" required placeholder="username_baru" /></label><label>Konfirmasi username baru<input value={confirmNewUsername} onChange={(e)=>setConfirmNewUsername(e.target.value)} minLength={3} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" required placeholder="Ketik ulang username baru" /></label><label>Kata sandi saat ini<input type="password" value={usernameCurrentPasswordDraft} onChange={(e)=>setUsernameCurrentPasswordDraft(e.target.value)} autoComplete="current-password" required /></label><button className="secondary" disabled={busy}>{busy ? "Menyimpan…" : "SIMPAN USERNAME"}</button></form><h3>Ganti kata sandi</h3><p className="muted">Masukkan kata sandi saat ini, lalu ketik kata sandi baru dua kali.</p><form className="auth-form" onSubmit={saveAccountPassword}><label>Kata sandi saat ini<input type="password" value={passwordCurrentPasswordDraft} onChange={(e)=>setPasswordCurrentPasswordDraft(e.target.value)} autoComplete="current-password" required /></label><label>Kata sandi baru<input type="password" value={newPasswordDraft} onChange={(e)=>setNewPasswordDraft(e.target.value)} minLength={8} maxLength={72} autoComplete="new-password" required placeholder="Minimal 8 karakter" /></label><label>Konfirmasi kata sandi baru<input type="password" value={confirmNewPassword} onChange={(e)=>setConfirmNewPassword(e.target.value)} minLength={8} maxLength={72} autoComplete="new-password" required placeholder="Ketik ulang kata sandi baru" /></label><button className="secondary" disabled={busy}>{busy ? "Menyimpan…" : "GANTI KATA SANDI"}</button></form></div></section><section id="admin-registrations" className="panel history-panel"><div className="section-head"><div><div className="eyebrow">PANEL ADMIN</div><h2>Pendaftaran anggota</h2></div><span className="pill">{pendingMembers.length} menunggu</span></div><p className="muted">Periksa screenshot bukti administrasi dan keterangan opsional sebelum menyetujui akun. Bukti administrasi tidak dihitung otomatis sebagai tagihan.</p>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}{pendingMembers.length ? <div className="table-wrap"><table><thead><tr><th>Nama karakter</th><th>Username</th><th>Tanggal</th><th>Bukti administrasi</th><th>Keterangan</th><th>Keputusan</th></tr></thead><tbody>{pendingMembers.map((m)=><tr key={m.id}><td>{m.display_name}</td><td>{m.login_username}</td><td>{date(wibDate(m.created_at))}</td><td><button className="secondary" disabled={!m.registration_proof_path} onClick={()=>openRegistrationProof(m.registration_proof_path)}>{m.registration_proof_path ? "Lihat screenshot" : "Belum ada bukti"}</button></td><td>{m.registration_note?.trim() || "—"}</td><td><div className="review-actions"><button className="primary" disabled={busy || !m.registration_proof_path} onClick={()=>reviewMember(m.id,"active")}>Setujui</button><button className="secondary" disabled={busy} onClick={()=>reviewMember(m.id,"rejected")}>Tolak</button></div></td></tr>)}</tbody></table></div> : <p className="muted">Tidak ada pendaftaran anggota yang menunggu.</p>}</section><section id="admin-payments" className="panel history-panel"><div className="section-head"><div><div className="eyebrow">PANEL ADMIN</div><h2>Antrean pembayaran</h2></div><span className="pill">{pendingPayments.length} menunggu</span></div>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<label>Catatan pemeriksaan (opsional)<input value={reviewNote} onChange={(e)=>setReviewNote(e.target.value)} maxLength={500} placeholder="Catatan untuk keputusan berikutnya" /></label>{pendingPayments.length ? <div className="table-wrap"><table><thead><tr><th>Anggota</th><th>Jenis</th><th>Nominal</th><th>Tanggal</th><th>Bukti</th><th>Keputusan</th></tr></thead><tbody>{pendingPayments.map((p)=><tr key={p.id}><td>{p.member_profiles?.display_name || p.member_id}<br/><small>{p.member_profiles?.login_username || ""}</small></td><td>KAS</td><td>{money(p.amount)}</td><td>{date(p.created_at.slice(0,10))}</td><td><button className="secondary" onClick={()=>openProof(p.proof_path)}>Lihat bukti</button></td><td><div className="review-actions"><button className="primary" disabled={busy || !settings?.cash_operations_enabled} onClick={()=>reviewPayment(p.id,"approved")}>Setujui</button><button className="secondary" disabled={busy} onClick={()=>reviewPayment(p.id,"rejected")}>Tolak</button></div></td></tr>)}</tbody></table></div> : <p className="muted">Tidak ada pengajuan yang menunggu pemeriksaan.</p>}</section><section id="admin-completed-payments" className="panel history-panel"><div className="section-head"><div><div className="eyebrow">ADMIN · RIWAYAT</div><h2>Riwayat pembayaran selesai</h2></div><span className="pill">{completedPayments.length} riwayat</span><button className="danger-button" disabled={busy || completedPayments.length===0} onClick={()=>deleteCompletedPaymentHistory(null)}>{busy ? "Memproses…" : "Hapus semua riwayat selesai"}</button></div><p className="muted">Hanya status Diterima dan Ditolak yang dapat dihapus. Status Menunggu/Pending tidak pernah masuk ke daftar penghapusan. Screenshot dan transaksi riwayat terkait akan dibersihkan; saldo dan tunggakan tetap sama.</p>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}{completedPayments.length ? <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Anggota</th><th>Nominal</th><th>Status</th><th>Catatan</th><th>Aksi</th></tr></thead><tbody>{completedPayments.map((p)=><tr key={p.id}><td>{date(p.created_at.slice(0,10))}</td><td>{p.member_profiles?.display_name || p.member_id}<br/><small>{p.member_profiles?.login_username || ""}</small></td><td>{money(p.amount)}</td><td><span className={"pill " + p.status}>{p.status === "approved" ? "Diterima" : "Ditolak"}</span></td><td>{p.review_note || "—"}</td><td><button className="danger-button" disabled={busy} onClick={()=>deleteCompletedPaymentHistory(p.id)}>Hapus riwayat</button></td></tr>)}</tbody></table></div> : <p className="muted">Belum ada riwayat pembayaran yang sudah diterima atau ditolak.</p>}</section><section id="admin-members" className="panel history-panel"><div className="section-head"><div><div className="eyebrow">ADMIN · MASTER DATA</div><h2>Manajemen anggota</h2></div><span className="pill">{filteredAdminMembers.length} anggota</span><button className="secondary" onClick={()=>downloadCsv("webkas-anggota.csv", [["Nama","Username","Status","Saldo (UIC)","Tunggakan (UIC)","Belum bayar dari","Bebas KAS"], ...filteredAdminMembers.map((m)=>[m.display_name,m.login_username,m.status,m.balance,m.arrears,m.unpaid_from,m.exempt_kas?"Ya":"Tidak"])])}>Ekspor CSV</button></div><p className="muted">Cari anggota, ubah nama, status, pengecualian KAS, pangkat, atau koreksi saldo saldo UIC. Semua koreksi dicatat ke ledger.</p>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<label className="member-search">Cari anggota<input type="search" value={memberSearch} onChange={(e)=>setMemberSearch(e.target.value)} placeholder="Cari nama, username, atau nomor HP" /></label>{isAdminMaster && <div className="stats-grid"><article className="stat"><span>Total tunggakan KAS</span><strong className="amount-danger">{money(filteredAdminMembers.filter((m)=>m.status==="active").reduce((sum,m)=>sum+Number(m.arrears||0),0))}</strong><small>Anggota aktif</small></article><article className="stat"><span>Tunggakan 7.000 UIC ke atas</span><strong>{filteredAdminMembers.filter((m)=>m.status==="active" && Number(m.arrears||0)>=7000).length}</strong><small>Ditampilkan lebih dahulu</small></article></div>}{filteredAdminMembers.filter((m)=>m.status==="active" && Number(m.arrears||0)>=7000).length ? <div className="notice"><strong>Prioritas penagihan · 7.000 UIC ke atas</strong><ul>{filteredAdminMembers.filter((m)=>m.status==="active" && Number(m.arrears||0)>=7000).map((m)=><li key={m.id}>{m.display_name} — <strong>{money(m.arrears)}</strong></li>)}</ul></div>:null}{filteredAdminMembers.length ? <div className="member-card-grid">{filteredAdminMembers.map((m)=>{return <article className="member-card" key={m.id}><div className="member-card-top"><div className="member-avatar-frame">{m.profile_photo_url ? <img className="member-avatar" src={m.profile_photo_url} alt={"Foto "+m.display_name} /> : <span className="member-avatar-fallback">{String(m.display_name||"?").slice(0,1).toUpperCase()}</span>}</div><div className="member-card-details"><div className="member-rank-line"><RankBadge rank={m.rank_code || "P1"} /><span className="member-rank-name">{rankNames[m.rank_code || "P1"] || "Anggota"}</span></div><div className="member-name-bar"><strong className="member-character-name">{m.display_name}</strong><button className="member-menu-toggle member-menu-icon-only" aria-label={"Pengaturan anggota "+m.display_name} title="Pengaturan anggota" aria-expanded={openMemberActions===m.id} onClick={()=>setOpenMemberActions((current)=>current===m.id?null:m.id)}><span className="member-menu-lines" aria-hidden="true">☰</span></button>{m.phone_number && <div className="member-phone-compact member-phone-inline"><button type="button" className="member-phone-toggle" aria-label={(openMemberPhone===m.id?"Sembunyikan":"Tampilkan")+" nomor HP "+m.display_name} aria-expanded={openMemberPhone===m.id} title={openMemberPhone===m.id?"Sembunyikan nomor HP":"Tampilkan nomor HP"} onClick={()=>setOpenMemberPhone((current)=>current===m.id?null:m.id)}><span aria-hidden="true">☎</span></button>{openMemberPhone===m.id && <a className="member-phone-link" href={"tel:" + m.phone_number.replace(/[^0-9+]/g, "")}>{m.phone_number}</a>}</div>}</div><small className="muted">@{m.login_username} · {m.status === "active" ? "Aktif" : m.status === "pending" ? "Menunggu" : m.status === "inactive" ? "Nonaktif" : "Ditolak"}</small></div></div><div className="member-finance-row"><div><span>Saldo</span><strong>{money(m.balance)}</strong></div><div><span>Tunggakan</span><strong className={Number(m.arrears||0)>0?"amount-danger":""}>{money(m.arrears)}</strong></div></div>{openMemberActions===m.id && <div className="member-modal-backdrop" onClick={(e)=>{if(e.target===e.currentTarget){setOpenMemberActions(null);setBalanceCorrection(null);}}}><div className="member-modal" role="dialog" aria-modal="true" aria-label={"Pengaturan anggota "+m.display_name} onClick={(e)=>e.stopPropagation()}><div className="member-modal-head"><div><div className="eyebrow">PENGATURAN ANGGOTA</div><h3>{m.display_name}</h3><small>@{m.login_username}</small></div><button type="button" className="modal-close" aria-label="Tutup pengaturan anggota" onClick={()=>{setOpenMemberActions(null);setBalanceCorrection(null);}}>×</button></div>{balanceCorrection?.memberId===m.id ? <form className="balance-correction-form" onSubmit={adjustMemberBalance}><div className="section-head"><div><div className="eyebrow">KOREKSI SALDO</div><h3>{balanceCorrection.displayName}</h3></div><button type="button" className="secondary" disabled={busy} onClick={()=>setBalanceCorrection(null)}>Kembali</button></div><p className="muted">Saldo saat ini: <strong>{money(balanceCorrection.balance)}</strong>. Angka positif menambah saldo, angka negatif mengurangi. Koreksi tercatat di ledger dan audit.</p><label>Nominal koreksi (UIC)<input type="number" value={balanceCorrection.amount} onChange={(e)=>setBalanceCorrection((v)=>({...v,amount:e.target.value}))} step="1" required placeholder="Contoh: 2000 atau -1000" /></label><label>Alasan koreksi<input value={balanceCorrection.reason} onChange={(e)=>setBalanceCorrection((v)=>({...v,reason:e.target.value}))} minLength={5} maxLength={500} required placeholder="Minimal 5 karakter" /></label><button className="primary" disabled={busy}>{busy ? "Menyimpan koreksi…" : "KONFIRMASI KOREKSI SALDO"}</button></form> : <div className="member-actions-panel"><label>Pangkat<select aria-label={"Pangkat "+m.login_username} value={m.rank_code || "P1"} onChange={(e)=>setAdminMembers((rows)=>rows.map((r)=>r.id===m.id?{...r,rank_code:e.target.value}:r))}><option value="P1">P1 · Newbie</option><option value="P2">P2 · Soldier</option><option value="P3">P3 · Captain</option>{isAdminMaster && <><option value="P4">P4 · Right Hand</option><option value="P5">P5 · UnderBoss</option><option value="P6">P6 · Boss</option><option value="P7">P7 · VIP (pangkat lama)</option></>}</select></label><button className="secondary" disabled={busy || m.status!=="active"} onClick={()=>setMemberRank(m)}>Simpan pangkat</button>{isAdminMaster && !["P1","P2","P3"].includes(m.rank_code || "P1") && <><label className="member-exempt-toggle"><input type="checkbox" checked={Boolean(m.exempt_kas)} onChange={(e)=>setAdminMembers((rows)=>rows.map((r)=>r.id===m.id?{...r,exempt_kas:e.target.checked}:r))}/> Bebas KAS</label><button className="secondary" disabled={busy} onClick={()=>saveMember(m)}>Simpan pengaturan KAS</button></>}<div className="member-actions-buttons"><button className="secondary" disabled={busy || !["active","inactive"].includes(m.status)} onClick={()=>setMemberStatus(m,m.status === "active" ? "inactive" : "active")}>{m.status === "active" ? "Nonaktifkan anggota" : "Aktifkan anggota"}</button><button className="secondary" disabled={busy} onClick={()=>{setError("");setMessage("");setBalanceCorrection({memberId:m.id,displayName:m.display_name,username:m.login_username,balance:Number(m.balance||0),amount:"",reason:""});}}>Koreksi saldo</button></div>{isAdminMaster && <><button className="secondary" disabled={busy} onClick={()=>{setError("");setMessage("");setMemberPasswordReset({memberId:m.id,newPassword:"",confirmPassword:""});}}>Reset kata sandi</button>{memberPasswordReset?.memberId===m.id && <form className="auth-form" onSubmit={(e)=>{e.preventDefault();resetMemberPassword(m);}}><div className="notice"><strong>Reset kata sandi anggota</strong><p>Developer tidak perlu mengetahui kata sandi lama. Masukkan kata sandi baru dan berikan langsung kepada pemilik akun melalui jalur pribadi.</p></div><label>Kata sandi baru<input type="password" value={memberPasswordReset.newPassword} onChange={(e)=>setMemberPasswordReset((v)=>({...v,newPassword:e.target.value}))} minLength={8} maxLength={72} autoComplete="new-password" required placeholder="Minimal 8 karakter" /></label><label>Konfirmasi kata sandi baru<input type="password" value={memberPasswordReset.confirmPassword} onChange={(e)=>setMemberPasswordReset((v)=>({...v,confirmPassword:e.target.value}))} minLength={8} maxLength={72} autoComplete="new-password" required placeholder="Ketik ulang kata sandi baru" /></label><div className="member-actions-buttons"><button className="primary" disabled={busy}>{busy ? "Mereset…" : "KONFIRMASI RESET"}</button><button type="button" className="secondary" disabled={busy} onClick={()=>setMemberPasswordReset(null)}>Batal</button></div></form>}</>}{isAdminMaster && m.status==="active" && <button className="secondary" disabled={busy} onClick={()=>setAssistantRole(m,true)}>JADIKAN ADMIN</button>}<button className="danger-button" disabled={busy || m.id===profile.id} onClick={()=>deleteMember(m)}>Hapus permanen akun</button><small className="muted">Penghapusan permanen dapat dilakukan meski ada saldo atau tunggakan. Saldo, tunggakan, transaksi, pengajuan, dan log tagihan diarsipkan dalam catatan audit admin sebelum akun dihapus. Penghapusan tidak dapat dibatalkan.</small></div>}</div></div>}</article>})}</div> :<p className="muted">{filteredAdminMembers.length ? "Tidak ada anggota yang cocok dengan pencarian." : (isAdminAssistant ? "Tidak ada anggota P1–P3 yang cocok dengan pencarian." : "Belum ada anggota terdaftar.")}</p>}{isAdminMaster && <section className="assistant-management-panel"><div className="section-head"><div><div className="eyebrow">AKSES KHUSUS SUPER ADMIN</div><h3>Admin</h3></div><span className="pill">{assistantAccounts.length} akun</span></div><p className="muted">Admin dapat membantu menerima pendaftaran dan memproses pembayaran serta mengelola anggota P1–P3. Mereka tidak dapat mengubah tarif, mengangkat admin, atau mengelola anggota P4 ke atas.</p>{assistantAccounts.length ? <div className="assistant-account-list">{assistantAccounts.map((assistant)=><div className="assistant-account-row" key={assistant.id}><div><strong>{assistant.display_name}</strong><small>@{assistant.login_username} · {assistant.status==="active" ? "Aktif" : assistant.status}</small></div><button className="danger-button" disabled={busy} onClick={()=>setAssistantRole(assistant,false)}>Cabut Admin</button></div>)}</div> : <p className="muted">Belum ada Admin yang diangkat.</p>}</section>}</section>
{isAdminMaster && <section id="admin-settings" className="panel history-panel"><div className="eyebrow">ADMIN · PENGATURAN</div><h2>Pengaturan iuran KAS</h2><p className="muted">Tarif baru berlaku mulai hari berikutnya. Tarif hari lampau tetap mengikuti riwayat tarif. Tanggal rekap hanya dapat dimajukan setelah seluruh pengujian kas lulus.</p><div className="stats-grid"><article className="stat"><span>Tanggal rekap saat ini</span><strong className="date-value">{date(settings?.report_date)}</strong><small>Zona waktu WIB</small></article><article className="stat"><span>Operasi kas</span><strong>{settings?.cash_operations_enabled ? "Terbuka" : "Terkunci"}</strong><small>Penguncian keamanan database</small></article></div><form className="auth-form" onSubmit={saveReportDate}><label>Tanggal rekap<input type="date" value={reportDateDraft} onChange={(e)=>setReportDateDraft(e.target.value)} disabled={!settings?.cash_operations_enabled} required/></label><button className="primary full" disabled={busy || !settings?.cash_operations_enabled}>{busy ? "Memproses…" : "SIMPAN TANGGAL & PROSES CATCH-UP"}</button>{!settings?.cash_operations_enabled && <small className="muted">Terkunci sampai pengujian kas lulus.</small>}</form><form className="auth-form" onSubmit={saveBranding}><div className="eyebrow">IDENTITAS & TEMA WEBSITE</div><label>Nama website<input value={siteNameDraft} onChange={(e)=>setSiteNameDraft(e.target.value)} minLength={3} maxLength={80} required placeholder="WEBKAS FAM VALKYRIE" /></label><label>Nama keluarga / komunitas<input value={familyNameDraft} onChange={(e)=>setFamilyNameDraft(e.target.value)} minLength={2} maxLength={60} required placeholder="FAM VALKYRIE" /></label><label>Teks kecil / subtitle<input value={subtitleDraft} onChange={(e)=>setSubtitleDraft(e.target.value)} minLength={2} maxLength={80} required placeholder="CATATAN KAS KELUARGA" /></label><div className="color-settings"><label>Warna aksen<input type="color" value={accentDraft} onChange={(e)=>setAccentDraft(e.target.value)} /></label><label>Warna latar belakang<input type="color" value={backgroundDraft} onChange={(e)=>setBackgroundDraft(e.target.value)} /></label></div><button className="primary full" disabled={busy}>{busy ? "Menyimpan…" : "SIMPAN IDENTITAS & TEMA"}</button></form><form className="auth-form" onSubmit={saveSettings}><label>Tarif iuran harian (UIC per hari)<input type="number" min="1" step="1" value={dailyDraft} onChange={(e)=>setDailyDraft(e.target.value)} required/></label><div className="notice"><strong>Administrasi pendaftaran</strong><p>Tidak dihitung sebagai tagihan otomatis. Anggota mengirim screenshot dan keterangan opsional pada formulir pendaftaran; admin memeriksa secara manual.</p></div><button className="primary full" disabled={busy}>{busy ? "Menyimpan…" : "SIMPAN TARIF KAS"}</button></form><form className="auth-form" onSubmit={saveProofRetention}><label>Hapus bukti pembayaran setelah<select value={retentionDraft} onChange={(e)=>setRetentionDraft(e.target.value)} required><option value="3">3 hari</option><option value="7">7 hari</option><option value="30">30 hari</option></select></label><button className="primary full" disabled={busy}>{busy ? "Menyimpan…" : "SIMPAN RETENSI BUKTI"}</button></form><button className="secondary full" onClick={cleanupProofs} disabled={busy}>{busy ? "Memproses…" : "BERSIHKAN BUKTI KEDALUWARSA"}</button><small className="muted">Pembersihan manual memakai retensi di atas dan selalu mempertahankan bukti pengajuan yang masih menunggu keputusan. Penjadwalan otomatis belum diaktifkan.</small></section>}
{isAdminMaster && <section id="admin-recap" className="panel history-panel"><div className="section-head"><div><div className="eyebrow">ADMIN · DIREKTORI</div><h2>List nama anggota di WEBKAS</h2></div><span className="pill">{new Map([...adminMembers, ...assistantAccounts, ...(profile?.role === "admin" ? [profile] : [])].filter((account)=>account?.id).map((account)=>[account.id,account])).size} total akun</span></div><p className="muted">Daftar nama seluruh akun yang tersedia pada data panel, termasuk Boss, Admin, dan Admin Assistant.</p><div className="notice"><strong>Nama akun terdaftar</strong><div className="registered-account-list">{Array.from(new Map([...adminMembers, ...assistantAccounts, ...(profile?.role === "admin" ? [profile] : [])].filter((account)=>account?.id).map((account)=>[account.id,account])).values()).sort((a,b)=>String(a.display_name || "").localeCompare(String(b.display_name || ""))).map((account,index)=><p key={account.id}>{index+1}. {account.display_name || "Tanpa nama"}</p>)}</div></div></section>}
{isAdminMaster && <section id="admin-transactions" className="panel history-panel"><div className="section-head"><div><div className="eyebrow">ADMIN · LAPORAN</div><h2>Transaksi kas terbaru</h2></div><span className="pill">{adminTransactions.length} transaksi</span><button className="secondary" onClick={()=>downloadCsv("webkas-transaksi.csv", [["Tanggal","Anggota","Username","Jenis","Nominal","Keterangan"], ...adminTransactions.map((t)=>[t.created_at,t.member_profiles?.display_name,t.member_profiles?.login_username,t.transaction_type,t.amount,t.description])])}>Ekspor CSV</button></div>{adminTransactions.length ? <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Anggota</th><th>Jenis</th><th>Nominal</th><th>Keterangan</th></tr></thead><tbody>{adminTransactions.map((t)=><tr key={t.id}><td>{date(t.created_at.slice(0,10))}</td><td>{t.member_profiles?.display_name || t.member_id}</td><td>{t.transaction_type}</td><td>{money(t.amount)}</td><td>{t.description || "—"}</td></tr>)}</tbody></table></div>:<p className="muted">Belum ada transaksi yang tercatat di database V2.</p>}</section>}
<section className="notice"><strong>Pembukuan otomatis</strong><p>Pembayaran UIC melunasi tunggakan terlebih dahulu; sisa nominal masuk ke saldo. Riwayat pembayaran tetap tersedia tanpa menyimpan screenshot setelah keputusan admin.</p>{!settings?.cash_operations_enabled && <p><strong>Mode aman aktif:</strong> persetujuan pembayaran masih dikunci sampai tes regresi kas selesai. Penolakan tetap tersedia.</p>}</section></div></div></> : <><section id="member-rate-panel" className="panel history-panel"><div className="eyebrow">TARIF KAS BERDASARKAN PANGKAT</div><h2>{rankNames[profile?.rank_code || "P1"] || "Pemula"}</h2><p className="muted">Tarif dasar komunitas: {money(settings?.daily_amount)} per hari.</p><div className="stat"><span>Tanggungan KAS harian Anda</span><strong>{wallet?.exempt_kas || ["P5","P6","P7"].includes(profile?.rank_code) ? "Bebas KAS" : money(dailyRateForRank(settings?.daily_amount, profile?.rank_code || "P1"))}</strong><small>{profile?.rank_code === "P3" ? "P3 membayar 80% dari tarif dasar." : profile?.rank_code === "P4" ? "P4 membayar 50% dari tarif dasar." : ["P5","P6","P7"].includes(profile?.rank_code) ? "Pangkat ini mendapatkan pengecualian KAS." : "Tarif mengikuti pengaturan harian admin."}</small></div></section><div className="stats-grid member-stats"><article className="stat"><span>Saldo UIC</span><strong>{money(wallet.balance)}</strong><small>Saldo tersedia</small></article><article className="stat"><span>Tunggakan Kas</span><strong className={Number(wallet.arrears) > 0 ? "amount-danger" : ""}>{money(wallet.arrears)}</strong><small>{Number(wallet.arrears) > 0 ? "Belum tertutup" : "Tidak ada tunggakan tercatat"}</small></article><article className="stat"><span>Nomor HP / WhatsApp</span>{profile.phone_number ? <a className="profile-phone-value" href={"tel:" + profile.phone_number.replace(/[^0-9+]/g, "")}>{profile.phone_number}</a> : <strong className="muted">Belum diisi</strong>}<small>Dapat ditekan untuk membuka aplikasi telepon</small></article></div><section id="member-history" className="panel history-panel"><div className="section-head"><div><div className="eyebrow">RIWAYAT PENGAJUAN</div><h2>Pembayaran saya</h2></div><span className="pill">{payments.length} terbaru</span></div>{payments.length ? <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Nominal</th><th>Status</th><th>Catatan admin</th></tr></thead><tbody>{payments.map((p) => <tr key={p.id}><td>{date(p.created_at.slice(0,10))}</td><td>{money(p.amount)}</td><td><span className={"pill " + p.status}>{p.status === "approved" ? "Diterima" : p.status === "rejected" ? "Ditolak" : "Menunggu"}</span></td><td>{p.review_note || "—"}</td></tr>)}</tbody></table></div> : <p className="muted">Belum ada pengajuan pembayaran.</p>}</section><section id="member-settings" className="panel history-panel"><div className="eyebrow">AKUN SAYA</div><h2>Pengaturan profil</h2><p className="muted">Atur nama karakter dan foto profil dari menu ini. Perubahan nama hanya dilakukan oleh pemilik akun.</p>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<div className="profile-photo-settings"><div className="profile-avatar-wrap">{profilePhotoUrl ? <img className="profile-avatar" src={profilePhotoUrl} alt={"Foto profil " + profile.display_name} /> : <span className="profile-avatar-fallback">{String(profile.display_name || "?").slice(0,1).toUpperCase()}</span>}</div><div className="profile-photo-controls"><RankBadge rank={profile.rank_code || "P1"} isAdmin={profile.role === "admin"} isAssistant={profile.role === "admin_assistant"} /><label>Nama karakter<input value={profileNameDraft} onChange={(e)=>setProfileNameDraft(e.target.value)} maxLength={80} required /></label><button className="secondary" disabled={busy || !profileNameDraft.trim() || profileNameDraft.trim()===profile.display_name} onClick={saveMyDisplayName}>{busy ? "Menyimpan…" : "SIMPAN NAMA SAYA"}</button><label>Foto profil (JPG/PNG/WEBP, maks. 3 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>setProfilePhotoFile(e.target.files?.[0] || null)} /></label><button className="secondary" disabled={busy || !profilePhotoFile} onClick={saveProfilePhoto}>{busy ? "Menyimpan…" : profile.profile_photo_path ? "GANTI FOTO PROFIL" : "PASANG FOTO PROFIL"}</button><small className="muted">Saat diganti, foto lama langsung dihapus dari penyimpanan.</small></div></div><form className="auth-form phone-number-settings" onSubmit={saveMyPhoneNumber}><label>Nomor HP / WhatsApp (opsional)<input type="tel" inputMode="tel" autoComplete="tel" value={phoneNumberDraft} onChange={(e)=>setPhoneNumberDraft(e.target.value)} maxLength={24} placeholder="Contoh: 081234567890" /></label><small className="muted">Kosongkan jika ingin menghapus nomor HP dari profil.</small><button className="secondary" disabled={busy}>{busy ? "Menyimpan…" : "SIMPAN NOMOR HP"}</button></form><div className="account-security-settings"><h3>Ganti username</h3><p className="muted">Ketik username baru dua kali dan verifikasi dengan kata sandi saat ini.</p><form className="auth-form" onSubmit={saveAccountUsername}><label>Username baru<input value={newUsernameDraft} onChange={(e)=>setNewUsernameDraft(e.target.value)} minLength={3} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" required placeholder="username_baru" /></label><label>Konfirmasi username baru<input value={confirmNewUsername} onChange={(e)=>setConfirmNewUsername(e.target.value)} minLength={3} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" required placeholder="Ketik ulang username baru" /></label><label>Kata sandi saat ini<input type="password" value={usernameCurrentPasswordDraft} onChange={(e)=>setUsernameCurrentPasswordDraft(e.target.value)} autoComplete="current-password" required /></label><button className="secondary" disabled={busy}>{busy ? "Menyimpan…" : "SIMPAN USERNAME"}</button></form><h3>Ganti kata sandi</h3><p className="muted">Kata sandi baru harus diketik ulang untuk mencegah salah ketik.</p><form className="auth-form" onSubmit={saveAccountPassword}><label>Kata sandi saat ini<input type="password" value={passwordCurrentPasswordDraft} onChange={(e)=>setPasswordCurrentPasswordDraft(e.target.value)} autoComplete="current-password" required /></label><label>Kata sandi baru<input type="password" value={newPasswordDraft} onChange={(e)=>setNewPasswordDraft(e.target.value)} minLength={8} maxLength={72} autoComplete="new-password" required placeholder="Minimal 8 karakter" /></label><label>Konfirmasi kata sandi baru<input type="password" value={confirmNewPassword} onChange={(e)=>setConfirmNewPassword(e.target.value)} minLength={8} maxLength={72} autoComplete="new-password" required placeholder="Ketik ulang kata sandi baru" /></label><button className="secondary" disabled={busy}>{busy ? "Menyimpan…" : "GANTI KATA SANDI"}</button></form></div></section><section id="member-payments" className="panel history-panel"><div className="eyebrow">KIRIM PEMBAYARAN</div><h2>Ajukan pembayaran</h2><p className="muted">Nominal dimasukkan dalam UIC (misalnya 1000 UIC). Bukti bersifat privat dan hanya dapat dilihat oleh kamu serta admin.</p>{payments.some((payment) => payment.status === "pending") && <div className="notice"><strong>Pengajuan sedang diperiksa</strong><p>Tunggu pengajuan sebelumnya diperiksa admin untuk melakukan pengajuan selanjutnya.</p></div>}{!settings?.cash_operations_enabled && <div className="notice"><strong>Mode aman aktif</strong><p>Pengajuan pembayaran belum dibuka sampai pengujian kas selesai. Jangan mengirim pembayaran melalui website untuk sementara.</p></div>}{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<form className="auth-form" onSubmit={submitPayment}><label>Jenis pembayaran<select disabled={!settings?.cash_operations_enabled} value="kas" onChange={()=>setPaymentType("kas")}><option value="kas">KAS (melunasi tunggakan dahulu, sisanya menjadi saldo)</option></select></label><label>Nominal pembayaran (UIC)<input disabled={!settings?.cash_operations_enabled} type="number" min="1" step="1" value={paymentAmount} onChange={(e)=>setPaymentAmount(e.target.value)} required placeholder="Contoh: 1000" /></label><label>Foto bukti pembayaran<input disabled={!settings?.cash_operations_enabled} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>setProofFile(e.target.files?.[0] || null)} required /></label><button className="primary full" disabled={busy || !settings?.cash_operations_enabled}>{busy ? "Mengirim…" : "KIRIM PENGAJUAN"}</button></form></section></>}<footer>©Designed by Vergil D Ajax</footer></main>
  }

  if (session && !profile) {
    return <main className="page-shell"><section className="panel"><Brand branding={branding} /><h1>Profil belum tersedia</h1><p className="intro">Sesi login aktif, tetapi profil anggota belum ditemukan. Keluar dan hubungi admin utama; jangan membuat akun ulang dengan username yang sama.</p><button className="secondary full" onClick={signOut}>Keluar</button><footer>©Designed by Vergil D Ajax</footer></section></main>;
  }

  return <main className="page-shell"><section className="panel auth-panel"><Brand branding={branding} /><div className="eyebrow"><span className="status-dot" /> WEBKAS FAM SOS V2</div><h1>{mode === "login" ? <>Masuk ke <span>WEBKAS</span></> : <>Daftar <span>anggota</span></>}</h1><p className="intro">{mode === "login" ? "Gunakan username dan kata sandi akun kas kamu." : "Buat akun anggota. Akses baru aktif setelah disetujui admin utama."}</p>{error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<form onSubmit={mode === "login" ? signIn : register} className="auth-form">{mode === "register" && <div className="registration-steps"><strong>Urutan pendaftaran</strong><ol><li>Buat username untuk login</li><li>Buat kata sandi</li><li>Isi nama karakter / nama IC</li><li>Unggah screenshot bukti administrasi di bagian paling bawah</li></ol></div>}<label>Username<input value={username} onChange={(e)=>setUsername(e.target.value)} minLength={3} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" required placeholder="username_kamu" /><small className="muted">{mode === "register" ? "Username ini akan dipakai untuk login. Gunakan 3–30 karakter: huruf kecil, angka, titik, _ atau -. Username tidak boleh sama dengan anggota lain." : "Masukkan username yang kamu gunakan saat mendaftar."}</small></label>{mode === "register" && <label>Ulangi username<input value={confirmUsername} onChange={(e)=>setConfirmUsername(e.target.value)} minLength={3} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" required placeholder="Ketik ulang username dengan tepat" /><small className="muted">Pastikan ejaan sama dengan username di atas.</small></label>}<label>Kata sandi<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} minLength={8} maxLength={72} autoComplete={mode === "login" ? "current-password" : "new-password"} required placeholder="Minimal 8 karakter" /></label>{mode === "register" && <label>Ulangi kata sandi<input type="password" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} minLength={8} maxLength={72} autoComplete="new-password" required placeholder="Ketik ulang kata sandi" /><small className="muted">Minimal 8 karakter; kedua kata sandi harus sama.</small></label>}{mode === "register" && <><label>Nama karakter / nama IC<input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} minLength={2} maxLength={80} autoComplete="nickname" required placeholder="Nama karakter di dalam game" /></label><label>Nomor HP / WhatsApp<input type="tel" inputMode="tel" autoComplete="tel" value={registrationPhone} onChange={(e)=>setRegistrationPhone(e.target.value)} maxLength={24} required placeholder="Contoh: 081234567890" /><small className="muted">Wajib diisi untuk kontak admin. Tidak ada verifikasi OTP.</small></label><label>Screenshot bukti administrasi<input type="file" accept="image/jpeg,image/png,image/webp" required onChange={(e)=>setRegistrationProofFile(e.target.files?.[0] || null)} /><small className="muted">Letakkan bukti administrasi di langkah terakhir. Format JPG, PNG, atau WEBP, maksimal 2 MB. Jika gagal, perkecil ukuran gambar lalu pilih kembali.</small></label><label>Keterangan bukti (opsional)<textarea value={registrationNote} onChange={(e)=>setRegistrationNote(e.target.value)} maxLength={500} rows={3} placeholder="Boleh dikosongkan. Contoh: keterangan pembayaran." /></label><div className="notice registration-proof-notice"><strong>Sebelum mengirim</strong><p>Periksa kembali username dan kata sandi untuk login. Pendaftaran baru aktif setelah disetujui admin. Screenshot hanya untuk pemeriksaan administrasi dan bukan otomatis saldo atau pembayaran tercatat.</p></div></>}<button className="primary full" disabled={busy}>{busy ? (mode === "login" ? "Memeriksa login…" : "Mengirim pendaftaran…") : mode === "login" ? "MASUK" : "KIRIM PENDAFTARAN"}</button></form><div className="auth-switch">{mode === "login" ? "Belum punya akun?" : "Sudah punya akun?"} <button className="text-button" onClick={()=>{setMode(mode === "login" ? "register" : "login");setError("");setMessage("");}}>{mode === "login" ? "Daftar anggota" : "Kembali masuk"}</button></div><div className="small-note">Akun baru berstatus menunggu sampai disetujui admin utama. Jangan bagikan kata sandi kepada siapa pun.</div><footer>©Designed by Vergil D Ajax</footer></section></main>;
}



function Brand({ compact = false, branding }) {
  const family = branding?.family_name || "FAM SOS";
  const site = branding?.site_name || "WEBKAS FAM SOS V2";
  return <div className={"brand-mark" + (compact ? " compact" : "")}><span className="brand-icon">{family.replace(/[^A-Za-z0-9]/g, "").slice(0,1).toUpperCase() || "K"}</span><div><strong>{site}</strong><small>{family} · {branding?.subtitle || "CATATAN KAS KELUARGA"}</small></div></div>;
}
