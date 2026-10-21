import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://webkas-fam-sos-v2.netlify.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const bucket = "payment-proofs";

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://webkas-fam-sos-v2.netlify.app",
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

  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Sesi admin diperlukan." }, 401, origin);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) return json({ error: "Konfigurasi server belum lengkap." }, 500, origin);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Sesi tidak valid atau sudah kedaluwarsa." }, 401, origin);

  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile, error: profileError } = await admin
    .from("member_profiles").select("role,status").eq("id", userData.user.id).maybeSingle();
  if (profileError) return json({ error: "Verifikasi admin gagal." }, 500, origin);
  if (profile?.role !== "admin" || profile?.status !== "active") {
    return json({ error: "Hanya admin aktif yang dapat membersihkan bukti pembayaran." }, 403, origin);
  }

  const { data: settings, error: settingsError } = await admin
    .from("dues_settings").select("proof_retention_days").eq("id", 1).maybeSingle();
  if (settingsError || !settings) return json({ error: "Pengaturan retensi bukti tidak ditemukan." }, 500, origin);
  const retentionDays = Number(settings.proof_retention_days);
  if (![3, 7, 30].includes(retentionDays)) return json({ error: "Nilai retensi bukti tidak valid." }, 500, origin);

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const pendingPaths = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data: pendingRows, error: pendingError } = await admin
      .from("payment_submissions").select("proof_path").eq("status", "pending").range(offset, offset + 999);
    if (pendingError) return json({ error: "Daftar pengajuan pending tidak dapat dibaca." }, 500, origin);
    for (const row of pendingRows || []) {
      if (row.proof_path) pendingPaths.add(row.proof_path);
    }
    if (!pendingRows || pendingRows.length < 1000) break;
  }
  const candidates: string[] = [];

  async function scanFolder(folder: string) {
    let offset = 0;
    while (true) {
      const { data, error } = await admin.storage.from(bucket).list(folder, {
        limit: 1000,
        offset,
        sortBy: { column: "created_at", order: "asc" },
      });
      if (error) throw new Error("Gagal membaca daftar bukti dari penyimpanan.");
      const entries = data || [];
      for (const entry of entries) {
        const path = folder ? folder + "/" + entry.name : entry.name;
        if (!entry.id || !entry.metadata) {
          await scanFolder(path);
          continue;
        }
        const createdAt = entry.created_at || entry.updated_at;
        if (createdAt && new Date(createdAt).getTime() < cutoff.getTime() && !pendingPaths.has(path)) {
          candidates.push(path);
        }
      }
      if (entries.length < 1000) break;
      offset += entries.length;
    }
  }

  try {
    await scanFolder("");
    let deleted = 0;
    for (let i = 0; i < candidates.length; i += 100) {
      const batch = candidates.slice(i, i + 100);
      const { data, error } = await admin.storage.from(bucket).remove(batch);
      if (error) return json({ error: "Sebagian bukti gagal dihapus.", deleted_count: deleted, retention_days: retentionDays }, 500, origin);
      deleted += data?.length || batch.length;
    }
    return json({
      success: true,
      retention_days: retentionDays,
      cutoff: cutoff.toISOString(),
      scanned_old_candidates: candidates.length,
      deleted_count: deleted,
      pending_proofs_preserved: pendingPaths.size,
    }, 200, origin);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Pembersihan bukti gagal." }, 500, origin);
  }
});
