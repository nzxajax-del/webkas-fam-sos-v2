import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://webkas-fam-sos-v2.netlify.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function corsHeaders(origin: string | null) {
  const allowed = origin && allowedOrigins.has(origin) ? origin : "https://webkas-fam-sos-v2.netlify.app";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}

function json(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Metode tidak didukung." }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return json({ error: "Origin tidak diizinkan." }, 403, origin);

  let body: { displayName?: unknown; username?: unknown; password?: unknown };
  try { body = await req.json(); }
  catch { return json({ error: "Format permintaan tidak valid." }, 400, origin); }

  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (displayName.length < 2 || displayName.length > 80) return json({ error: "Nama karakter harus 2–80 karakter." }, 400, origin);
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return json({ error: "Username harus 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung." }, 400, origin);
  if (password.length < 8 || password.length > 72) return json({ error: "Kata sandi harus 8–72 karakter." }, 400, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Konfigurasi server belum lengkap." }, 500, origin);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: duplicate, error: lookupError } = await admin
    .from("member_profiles").select("id").eq("login_username", username).maybeSingle();
  if (lookupError) return json({ error: "Pemeriksaan akun gagal. Coba lagi nanti." }, 500, origin);
  if (duplicate) return json({ error: "Username sudah digunakan." }, 409, origin);

  const { data, error } = await admin.auth.admin.createUser({
    email: username + "@login.webkas-fam-sos.invalid",
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, login_username: username },
    app_metadata: { role: "member" },
  });
  if (error || !data.user) {
    const duplicateLike = error?.message?.toLowerCase().includes("already") || error?.message?.toLowerCase().includes("duplicate");
    return json({ error: duplicateLike ? "Username sudah digunakan." : "Pendaftaran gagal diproses. Periksa data dan coba lagi." }, duplicateLike ? 409 : 400, origin);
  }
  return json({ success: true, message: "Pendaftaran berhasil dikirim. Akun menunggu persetujuan admin utama." }, 201, origin);
});
