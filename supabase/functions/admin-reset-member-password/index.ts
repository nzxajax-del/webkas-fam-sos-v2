import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://webkas-fam-sos-v2.nzxajax.workers.dev",
  "https://webkas-fam-sos-v2.netlify.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://webkas-fam-sos-v2.nzxajax.workers.dev",
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

  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Sesi Super Admin diperlukan." }, 401, origin);
  let body: { memberId?: unknown; newPassword?: unknown; confirmPassword?: unknown };
  try { body = await req.json(); }
  catch { return json({ error: "Format permintaan tidak valid." }, 400, origin); }

  const memberId = typeof body.memberId === "string" ? body.memberId : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(memberId)) {
    return json({ error: "Akun anggota tidak valid." }, 400, origin);
  }
  if (newPassword.length < 8 || newPassword.length > 72) return json({ error: "Kata sandi baru harus 8–72 karakter." }, 400, origin);
  if (newPassword !== confirmPassword) return json({ error: "Konfirmasi kata sandi baru tidak sama." }, 400, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) return json({ error: "Konfigurasi server belum lengkap." }, 500, origin);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Sesi tidak valid atau sudah kedaluwarsa. Masuk kembali." }, 401, origin);

  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: actor, error: actorError } = await admin
    .from("member_profiles").select("role,status").eq("id", userData.user.id).maybeSingle();
  if (actorError) return json({ error: "Verifikasi hak akses gagal." }, 500, origin);
  if (actor?.role !== "admin" || actor?.status !== "active") {
    return json({ error: "Hanya Super Admin aktif yang dapat mereset kata sandi anggota." }, 403, origin);
  }

  const { data: target, error: targetError } = await admin
    .from("member_profiles").select("id,login_username,role,status").eq("id", memberId).maybeSingle();
  if (targetError) return json({ error: "Data akun tujuan gagal diperiksa." }, 500, origin);
  if (!target || target.role !== "member") return json({ error: "Reset hanya diizinkan untuk akun anggota, bukan akun admin." }, 404, origin);
  if (target.status === "rejected") return json({ error: "Akun yang ditolak tidak dapat direset." }, 403, origin);

  const { error: updateError } = await admin.auth.admin.updateUserById(memberId, { password: newPassword });
  if (updateError) return json({ error: "Kata sandi belum berhasil direset. Coba lagi." }, 400, origin);

  return json({ success: true, username: target.login_username }, 200, origin);
});
