import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://webkas-fam-sos-v2.nzxajax.workers.dev",
  "https://webkas-fam-sos-v2.netlify.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const bucket = "payment-proofs";

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
  let body: { submissionId?: unknown; decision?: unknown; note?: unknown };
  try { body = await req.json(); }
  catch { return json({ error: "Format permintaan tidak valid." }, 400, origin); }

  const submissionId = typeof body.submissionId === "string" ? body.submissionId : "";
  const decision = typeof body.decision === "string" ? body.decision : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)) {
    return json({ error: "ID pengajuan tidak valid." }, 400, origin);
  }
  if (!["approved", "rejected"].includes(decision)) return json({ error: "Keputusan harus approved atau rejected." }, 400, origin);

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
  if (!["admin", "admin_assistant"].includes(profile?.role) || profile?.status !== "active") {
    return json({ error: "Hanya admin aktif yang dapat memproses pembayaran." }, 403, origin);
  }

  const { data: submission, error: submissionError } = await admin
    .from("payment_submissions").select("id,proof_path,status").eq("id", submissionId).maybeSingle();
  if (submissionError) return json({ error: "Pengajuan pembayaran tidak dapat dibaca." }, 500, origin);
  if (!submission) return json({ error: "Pengajuan pembayaran tidak ditemukan." }, 404, origin);
  if (submission.status !== "pending") return json({ error: "Pengajuan ini sudah diproses." }, 409, origin);
  const proofPath = typeof submission.proof_path === "string" ? submission.proof_path : null;

  // Run the existing database transaction first; it atomically updates the wallet,
  // records the payment decision and preserves the financial ledger.
  const { data: reviewData, error: reviewError } = await userClient.rpc("review_payment", {
    p_submission_id: submissionId,
    p_decision: decision,
    p_note: note || null,
  });
  if (reviewError || reviewData?.success !== true) {
    return json({ error: reviewError?.message || "Pembayaran belum berhasil diproses." }, 400, origin);
  }

  if (!proofPath) return json({ success: true, proof_deleted: true, already_without_proof: true, status: decision }, 200, origin);

  // Retry once for transient Storage failures. Keep proof_path if Storage rejects
  // deletion so the file remains traceable for a later cleanup; it is not shown in
  // the pending queue because the payment status has already changed.
  let removed = false;
  let removalMessage = "";
  for (let attempt = 0; attempt < 2 && !removed; attempt++) {
    const { error } = await admin.storage.from(bucket).remove([proofPath]);
    if (!error) removed = true;
    else removalMessage = error.message;
  }
  if (!removed) {
    return json({
      success: true,
      proof_deleted: false,
      cleanup_pending: true,
      status: decision,
      message: "Keputusan pembayaran berhasil, tetapi screenshot belum dapat dihapus dari penyimpanan.",
    }, 200, origin);
  }

  const { error: clearPathError } = await admin.from("payment_submissions")
    .update({ proof_path: null }).eq("id", submissionId).eq("status", decision);
  if (clearPathError) {
    return json({
      success: true,
      proof_deleted: true,
      database_path_cleared: false,
      status: decision,
      message: "Screenshot sudah dihapus dari penyimpanan, tetapi jalur bukti di database belum berhasil dikosongkan.",
    }, 200, origin);
  }

  return json({
    success: true,
    proof_deleted: true,
    database_path_cleared: true,
    status: decision,
  }, 200, origin);
});
