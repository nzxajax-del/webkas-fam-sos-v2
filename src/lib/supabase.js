import { createClient } from "@supabase/supabase-js";

// This is a public publishable key, designed to be included in browser apps.
// RLS and database grants are the security boundary. Never place service-role keys here.
const url = import.meta.env.VITE_SUPABASE_URL || "https://cdqmeenrwsbkcpclitgh.supabase.co";
const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_um2IJ0PsPMFk3oIHuY8L_g_N_oQymfP";

export const supabaseConfigured = Boolean(url && publishableKey);
export const createTemporarySupabaseClient = () => createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
export const supabase = supabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
