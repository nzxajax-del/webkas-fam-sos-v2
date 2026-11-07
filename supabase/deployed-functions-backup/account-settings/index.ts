import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://webkas-fam-sos-v2.nzxajax.workers.dev",
  "https://webkas-fam-sos-v2.netlify.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
function headers(origin: string | null) {
  return { "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://webkas-fam-sos-v2.nzxajax.workers.dev",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin", "Content-Type": "application/json" };
}
function reply(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}
const authEmail = (username: string) => username + "@login.webkas-fam-sos.invalid";
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (req.method !== "POST") return reply({ error: "Metode tidak didukung." }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return reply({ error: "Origin tidak diizinkan." }, 403, origin);
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return reply({ error: "Sesi login tidak valid." }, 401, origin);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Format permintaan tidak valid." }, 400, origin); }
  const action = typeof body.action === "string" ? body.action : "";
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) return reply({ error: "Konfigurasi server belum lengkap." }, 500, origin);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData.user;
  if (userError || !user) return reply({ error: "Sesi login kedaluwarsa. Masuk kembali." }, 401, origin);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile, error: profileError } = await admin.from("member_profiles").select("id,login_username,status").eq("id", user.id).maybeSingle();
  if (profileError || !profile || profile.status !== "active") return reply({ error: "Profil aktif tidak ditemukan." }, 403, origin);
  if (currentPassword.length < 1 || currentPassword.length > 72) return reply({ error: "Masukkan kata sandi saat ini." }, 400, origin);
  const verifier = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: verifyError } = await verifier.auth.signInWithPassword({ email: authEmail(profile.login_username), password: currentPassword });
  if (verifyError) return reply({ error: "Kata sandi saat ini salah." }, 403, origin);
  if (action === "username") {
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const confirmUsername = typeof body.confirmUsername === "string" ? body.confirmUsername.trim().toLowerCase() : "";
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) return reply({ error: "Username baru harus 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung." }, 400, origin);
    if (username !== confirmUsername) return reply({ error: "Konfirmasi username baru tidak sama." }, 400, origin);
    if (username === profile.login_username) return reply({ error: "Username baru sama dengan username saat ini." }, 400, origin);
    const { data: duplicate, error: duplicateError } = await admin.from("member_profiles").select("id").eq("login_username", username).maybeSingle();
    if (duplicateError) return reply({ error: "Username belum dapat diperiksa. Coba lagi." }, 500, origin);
    if (duplicate) return reply({ error: "Username sudah digunakan." }, 409, origin);
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(user.id, { email: authEmail(username), email_confirm: true, user_metadata: { ...(user.user_metadata || {}), login_username: username } });
    if (authUpdateError) return reply({ error: "Username belum dapat diubah. Coba gunakan username lain." }, 400, origin);
    const { error: profileUpdateError } = await admin.from("member_profiles").update({ login_username: username }).eq("id", user.id);
    if (profileUpdateError) {
      await admin.auth.admin.updateUserById(user.id, { email: authEmail(profile.login_username), email_confirm: true, user_metadata: { ...(user.user_metadata || {}), login_username: profile.login_username } });
      return reply({ error: "Perubahan username gagal disimpan. Tidak ada perubahan yang diterapkan." }, 500, origin);
    }
    return reply({ success: true, username }, 200, origin);
  }
  if (action === "password") {
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
    if (newPassword.length < 8 || newPassword.length > 72) return reply({ error: "Kata sandi baru harus 8–72 karakter." }, 400, origin);
    if (newPassword !== confirmPassword) return reply({ error: "Konfirmasi kata sandi baru tidak sama." }, 400, origin);
    if (newPassword === currentPassword) return reply({ error: "Kata sandi baru harus berbeda dari kata sandi saat ini." }, 400, origin);
    const { error: passwordError } = await admin.auth.admin.updateUserById(user.id, { password: newPassword });
    if (passwordError) return reply({ error: "Kata sandi belum berhasil diubah." }, 400, origin);
    return reply({ success: true }, 200, origin);
  }
  return reply({ error: "Jenis pengaturan tidak dikenal." }, 400, origin);
});