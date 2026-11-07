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
  let body: { memberId?: unknown; decision?: unknown; note?: unknown };
  try { body = await req.json(); }
  catch { return json({ error: "Format permintaan tidak valid." }, 400, origin); }

  const memberId = typeof body.memberId === "string" ? body.memberId : "";
  const decision = typeof body.decision === "string" ? body.decision : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(memberId)) {
    return json({ error: "ID anggota tidak valid." }, 400, origin);
  }
  if (!["active", "rejected"].includes(decision)) return json({ error: "Keputusan harus active atau rejected." }, 400, origin);

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
  const { data: member, error: memberError } = await admin
    .from("member_profiles").select("id,role,status,registration_proof_path")
    .eq("id", memberId).maybeSingle();
  if (memberError) return json({ error: "Data permohonan anggota tidak dapat dibaca." }, 500, origin);
  if (!member) return json({ error: "Permohonan anggota tidak ditemukan." }, 404, origin);
  if (member.role !== "member" || member.status !== "pending") return json({ error: "Permohonan ini sudah diproses atau bukan permohonan anggota." }, 409, origin);

  // The existing RPC is the authority for admin authorization, state transition and audit logging.
  const { data: reviewData, error: reviewError } = await userClient.rpc("review_member_registration", {
    p_member_id: memberId,
    p_decision: decision,
    p_note: note || null,
  });
  if (reviewError || reviewData?.success !== true) {
    return json({ error: reviewError?.message || "Permohonan belum berhasil diproses." }, 400, origin);
  }

  const proofPath = typeof member.registration_proof_path === "string" ? member.registration_proof_path : null;
  let proofDeleted = !proofPath;

  if (proofPath) {
    for (let attempt = 0; attempt < 2 && !proofDeleted; attempt++) {
      const { error } = await admin.storage.from("registration-proofs").remove([proofPath]);
      if (!error) proofDeleted = true;
    }
    if (!proofDeleted) {
      return json({ success: true, proof_deleted: false, cleanup_pending: true, account_deleted: false, status: decision,
        message: "Keputusan tersimpan, tetapi screenshot belum dapat dihapus. Penghapusan akun ditunda agar bukti tidak menjadi berkas yatim." }, 200, origin);
    }

    const { error: clearPathError } = await admin.from("member_profiles")
      .update({ registration_proof_path: null }).eq("id", memberId).eq("status", decision);
    if (clearPathError && decision === "active") {
      return json({ success: true, proof_deleted: true, database_path_cleared: false, status: decision,
        message: "Screenshot sudah dihapus, tetapi referensi berkas di database belum berhasil dikosongkan." }, 200, origin);
    }
  }

  if (decision === "rejected") {
    // Rejected applicants should be removed completely when safe. Never delete an account
    // that already has financial history; preserve its audit/ledger trail instead.
    const [transactions, payments, dues] = await Promise.all([
      admin.from("wallet_transactions").select("id", { count: "exact", head: true }).eq("member_id", memberId),
      admin.from("payment_submissions").select("id", { count: "exact", head: true }).eq("member_id", memberId),
      admin.from("daily_dues_log").select("id", { count: "exact", head: true }).eq("member_id", memberId),
    ]);
    if (transactions.error || payments.error || dues.error) {
      return json({ success: true, proof_deleted: proofDeleted, account_deleted: false, status: decision,
        message: "Pendaftaran ditolak, tetapi pemeriksaan riwayat kas gagal. Akun dipertahankan demi keamanan data." }, 200, origin);
    }
    if ((transactions.count || 0) > 0 || (payments.count || 0) > 0 || (dues.count || 0) > 0) {
      return json({ success: true, proof_deleted: proofDeleted, account_deleted: false, status: decision,
        message: "Pendaftaran ditolak. Akun dipertahankan karena memiliki riwayat kas yang harus dijaga." }, 200, origin);
    }
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(memberId);
    if (deleteUserError) {
      return json({ success: true, proof_deleted: proofDeleted, account_deleted: false, status: decision,
        message: "Pendaftaran ditolak, tetapi akun belum dapat dihapus otomatis: " + deleteUserError.message }, 200, origin);
    }
    return json({ success: true, proof_deleted: proofDeleted, account_deleted: true, status: decision }, 200, origin);
  }

  return json({ success: true, proof_deleted: proofDeleted, database_path_cleared: true, status: decision }, 200, origin);
});
