import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];
const supabaseAnonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"];

export const supabaseConfigError =
  !supabaseUrl || !supabaseAnonKey
    ? "Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local."
    : null;

export const supabase = supabaseConfigError
  ? null
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
