import { createClient } from "@supabase/supabase-js";

// This is a public publishable key, designed to be included in browser apps.
// RLS and database grants are the security boundary. Never place service-role keys here.
const url = import.meta.env.VITE_SUPABASE_URL || "https://lzciyzibqbujshoizlbu.supabase.co";
const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_5dAQkGDqGl0W4GeIhWuO4A_gXkomasS";

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
