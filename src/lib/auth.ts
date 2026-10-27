import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigError } from "@/lib/supabase";

function clearLegacyCredentials() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("lynphea:account");
    window.localStorage.removeItem("lynphea:session");
  }
}

export function useSupabaseAuth() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }

    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setReady(true);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        if (active) {
          setSession(data.session);
          setReady(true);
        }
      })
      .catch((error: unknown) => {
        console.error("No se pudo recuperar la sesión de Supabase:", error);
        if (active) setReady(true);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return {
    ready,
    authenticated: Boolean(session),
    session,
    configurationError: supabaseConfigError,
    async signIn(email: string, password: string) {
      if (!supabase) return { error: supabaseConfigError };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) clearLegacyCredentials();
      return { error: error?.message ?? null };
    },
    async signOut() {
      if (!supabase) return { error: supabaseConfigError };
      const { error } = await supabase.auth.signOut();
      return { error: error?.message ?? null };
    },
  };
}
