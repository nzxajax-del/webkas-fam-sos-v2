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
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Sesi admin diperlukan." }, 401, origin);
  let body: { submissionId?: unknown; bulk?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Format permintaan tidak valid." }, 400, origin); }
  const isBulk = body.bulk === true;
  const submissionId = typeof body.submissionId === "string" ? body.submissionId : "";
  if (!isBulk && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)) {
    return json({ error: "ID riwayat tidak valid." }, 400, origin);
  }
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) return json({ error: "Konfigurasi server belum lengkap." }, 500, origin);
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Sesi tidak valid atau kedaluwarsa." }, 401, origin);
  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile, error: profileError } = await admin.from("member_profiles").select("role,status").eq("id", userData.user.id).maybeSingle();
  if (profileError) return json({ error: "Verifikasi admin gagal." }, 500, origin);
  if (profile?.role !== "admin" || profile?.status !== "active") return json({ error: "Hanya admin aktif yang dapat menghapus riwayat." }, 403, origin);
  let query = admin.from("payment_submissions").select("id,proof_path,status,proof_storage_source").in("status", ["approved", "rejected"]).order("created_at", { ascending: true });
  if (!isBulk) query = query.eq("id", submissionId);
  const { data: rows, error: rowsError } = await query.limit(isBulk ? 1000 : 1);
  if (rowsError) return json({ error: "Riwayat pembayaran tidak dapat dibaca." }, 500, origin);
  if (!rows?.length) return json({ error: "Riwayat selesai tidak ditemukan; status pending/menunggu tidak dapat dihapus." }, 404, origin);
  const ids = rows.map((row) => row.id);
  // Only current-project objects may be removed. Legacy files stay in the source Storage project.
  const currentRows = rows.filter((row) => row.proof_storage_source === "current");
  const legacyProofsPreserved = rows.filter((row) => row.proof_storage_source !== "current" && typeof row.proof_path === "string" && row.proof_path.length > 0).length;
  const paths = [...new Set(currentRows.map((row) => row.proof_path).filter((path): path is string => typeof path === "string" && path.length > 0))];
  if (paths.length) {
    const { error: storageError } = await admin.storage.from("payment-proofs").remove(paths);
    if (storageError) return json({ error: "Screenshot belum dihapus; riwayat tidak diubah. " + storageError.message }, 502, origin);
  }
  const { data: deleted, error: deleteError } = await userClient.rpc("admin_delete_completed_payment_history", { p_submission_ids: ids });
  if (deleteError || deleted?.success !== true) {
    return json({ error: "Screenshot sudah dibersihkan, tetapi riwayat belum terhapus. Silakan ulangi penghapusan. " + (deleteError?.message || "Kesalahan database.") , proof_deleted: true }, 500, origin);
  }
  return json({ success: true, deleted_count: Number(deleted.deleted_count || 0), transaction_history_deleted: Number(deleted.transaction_history_deleted || 0), proof_deleted_count: paths.length, legacy_proofs_preserved_count: legacyProofsPreserved, bulk: isBulk, wallet_balances_changed: false, limited_to: isBulk && rows.length === 1000 ? "1000" : null }, 200, origin);
});