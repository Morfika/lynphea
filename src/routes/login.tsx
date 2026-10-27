import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSupabaseAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const auth = useSupabaseAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (auth.ready && auth.authenticated) window.location.replace("/dashboard");
  }, [auth.authenticated, auth.ready]);

  const submit = async () => {
    if (!email.includes("@") || password.length < 8) {
      setError("Ingresa un correo válido y una contraseña de al menos 8 caracteres.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const result = await auth.signIn(email.trim(), password);
      if (result.error) {
        setError(result.error);
      }
    } catch (cause) {
      console.error("No se pudo completar el acceso a Supabase:", cause);
      setError("No fue posible conectar con Supabase. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!auth.ready) return null;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        <p className="font-display text-4xl tracking-[0.2em]">LYNPHEA</p>
        <p className="mt-2 label-caps">Makeup • Beauty</p>
        <div className="mt-10">
          <h1 className="font-display text-3xl">Bienvenido</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Accede al panel de administración con tu cuenta Supabase.
          </p>
          {auth.configurationError && (
            <p className="mt-4 text-sm text-destructive">{auth.configurationError}</p>
          )}
          <div className="mt-6 grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm">Correo electrónico</label>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                disabled={Boolean(auth.configurationError) || submitting}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm">Contraseña</label>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={Boolean(auth.configurationError) || submitting}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={submit} disabled={Boolean(auth.configurationError) || submitting}>
              {submitting ? "Conectando..." : "Iniciar sesión"}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
