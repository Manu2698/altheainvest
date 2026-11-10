import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrainCircuit, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [errore, setErrore] = useState("");

  useEffect(() => {
    let attivo = true;

    async function completaAccesso() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
      const oauthError =
        url.searchParams.get("error_description") ??
        url.searchParams.get("error") ??
        hashParams.get("error_description") ??
        hashParams.get("error");

      if (oauthError) {
        throw new Error(oauthError);
      }

      // Supabase JS normally exchanges PKCE codes during initialization.
      // If no session was created automatically, complete the exchange explicitly.
      let { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (!data.session && code) {
        const result = await supabase.auth.exchangeCodeForSession(code);
        if (result.error) throw result.error;
        data = { session: result.data.session };
      }

      if (!data.session) {
        throw new Error(
          "Google ha completato il reindirizzamento, ma Supabase non ha restituito una sessione. Verifica gli URL autorizzati in Supabase Auth.",
        );
      }

      // Remove the one-time authorization code/token fragments from the address bar.
      window.history.replaceState({}, document.title, "/auth/callback");
      if (attivo) void navigate({ to: "/", replace: true });
    }

    void completaAccesso().catch((error: unknown) => {
      if (!attivo) return;
      setErrore(error instanceof Error ? error.message : "Accesso Google non riuscito.");
    });

    return () => {
      attivo = false;
    };
  }, [navigate]);

  return (
    <main className="grid-lines flex min-h-screen items-center justify-center px-5 py-16">
      <div className="panel w-full max-w-md p-6 text-center">
        <BrainCircuit className="mx-auto size-7 text-primary" />
        {errore ? (
          <>
            <h1 className="mt-4 text-lg font-semibold">Accesso non completato</h1>
            <p className="mt-2 break-words text-sm text-muted-foreground">{errore}</p>
            <Link
              to="/auth"
              className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Torna all'accesso
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-lg font-semibold">Verifica accesso</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Stiamo completando la sessione Google in modo sicuro.
            </p>
            <Loader2 className="mx-auto mt-5 size-5 animate-spin text-primary" />
          </>
        )}
      </div>
    </main>
  );
}
