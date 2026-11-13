import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrainCircuit, Loader2, LogIn, Mail, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSessione } from "@/hooks/useSessione";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Accedi ad Althea — IA di investimento automatico" },
      {
        name: "description",
        content:
          "Accedi o registrati su Althea per collegare il tuo broker, depositare capitale e lasciare operare l'IA su conti paper o reali.",
      },
      { property: "og:title", content: "Accedi ad Althea" },
      {
        property: "og:description",
        content: "Login e registrazione all'IA di investimento automatico Althea.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PaginaAuth,
});

function PaginaAuth() {
  const navigate = useNavigate();
  const { autenticato, caricata } = useSessione();
  const [modo, setModo] = useState<"accesso" | "registrazione">("accesso");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [messaggio, setMessaggio] = useState<{ tipo: "ok" | "ko"; testo: string } | null>(
    null,
  );

  // Fallback OAuth: alcuni provider/proxy possono restituire il code su /auth
  // invece che su /auth/callback. Completiamo comunque il PKCE sulla stessa origine.
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const oauthError =
      url.searchParams.get("error_description") ?? url.searchParams.get("error");
    if (oauthError) {
      setMessaggio({ tipo: "ko", testo: oauthError });
      return;
    }
    if (!code) {
      if (caricata && autenticato) void navigate({ to: "/", replace: true });
      return;
    }

    let attivo = true;
    setInCorso(true);
    void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (!attivo) return;
      if (error) throw error;
      url.searchParams.delete("code");
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
      void navigate({ to: "/", replace: true });
    }).catch((error: unknown) => {
      if (!attivo) return;
      setMessaggio({
        tipo: "ko",
        testo: error instanceof Error ? error.message : "Accesso Google non riuscito.",
      });
      setInCorso(false);
    });

    return () => { attivo = false; };
  }, [caricata, autenticato, navigate]);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setInCorso(true);
    setMessaggio(null);
    try {
      if (modo === "accesso") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        void navigate({ to: "/", replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { nome },
          },
        });
        if (error) throw error;
        if (data.session) void navigate({ to: "/", replace: true });
        else
          setMessaggio({
            tipo: "ok",
            testo: "Ti ho inviato una mail di conferma: aprila per attivare l'account.",
          });
      }
    } catch (err) {
      setMessaggio({
        tipo: "ko",
        testo: err instanceof Error ? err.message : "Operazione non riuscita.",
      });
    } finally {
      setInCorso(false);
    }
  }

  async function google() {
    setMessaggio(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setMessaggio({ tipo: "ko", testo: error.message });
    }
  }

  return (
    <main className="grid-lines flex min-h-screen items-center justify-center px-5 py-16">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <BrainCircuit className="size-5 text-primary" />
          <span className="font-display text-lg font-semibold tracking-tight">Althea</span>
        </Link>

        <div className="panel p-6">
          <h1 className="text-xl font-semibold">
            {modo === "accesso" ? "Accedi al tuo conto" : "Crea il tuo conto"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Serve per collegare il broker, gestire depositi e prelievi e salvare le tue
            strategie.
          </p>

          <button
            onClick={() => void google()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2.5 text-sm font-medium transition-colors hover:bg-surface"
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.35 11.1H12v2.9h5.35c-.25 1.5-1.8 4.4-5.35 4.4a6.1 6.1 0 1 1 0-12.2c1.75 0 2.92.75 3.6 1.4l2.45-2.37C16.5 3.6 14.5 2.7 12 2.7a9.3 9.3 0 1 0 0 18.6c5.37 0 8.92-3.77 8.92-9.08 0-.61-.07-1.08-.17-1.52Z"
              />
            </svg>
            Continua con Google
          </button>

          <div className="my-5 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> oppure con email
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={invia} className="space-y-3">
            {modo === "registrazione" && (
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome"
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            )}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@esempio.it"
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min. 8 caratteri)"
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary"
            />

            {messaggio && (
              <p
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs",
                  messaggio.tipo === "ok"
                    ? "border-bull/40 bg-bull/10 text-bull"
                    : "border-bear/40 bg-bear/10 text-bear",
                )}
              >
                {messaggio.testo}
              </p>
            )}

            <button
              type="submit"
              disabled={inCorso}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {inCorso ? (
                <Loader2 className="size-4 animate-spin" />
              ) : modo === "accesso" ? (
                <LogIn className="size-4" />
              ) : (
                <UserPlus className="size-4" />
              )}
              {modo === "accesso" ? "Accedi" : "Registrati"}
            </button>
          </form>

          <button
            onClick={() => {
              setModo(modo === "accesso" ? "registrazione" : "accesso");
              setMessaggio(null);
            }}
            className="mt-4 flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Mail className="size-3" />
            {modo === "accesso"
              ? "Non hai un account? Registrati"
              : "Hai già un account? Accedi"}
          </button>
        </div>
      </div>
    </main>
  );
}
