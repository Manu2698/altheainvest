import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useSessione() {
  const [sessione, setSessione] = useState<Session | null>(null);
  const [caricata, setCaricata] = useState(false);

  useEffect(() => {
    let attivo = true;
    let eventoAuthRicevuto = false;

    // Subscribe first: an OAuth callback can publish a fresh session while
    // getSession() is still resolving. Never let that older read overwrite it.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, session) => {
      if (!attivo) return;
      eventoAuthRicevuto = true;
      setSessione(session);
      setCaricata(true);
    });

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!attivo || eventoAuthRicevuto) return;
        if (error) {
          console.error("[Althea auth] Impossibile leggere la sessione:", error);
        }
        setSessione(data.session);
        setCaricata(true);
      })
      .catch((error: unknown) => {
        if (!attivo || eventoAuthRicevuto) return;
        console.error("[Althea auth] Errore durante il caricamento della sessione:", error);
        setSessione(null);
        setCaricata(true);
      });

    return () => {
      attivo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    sessione,
    utente: sessione?.user ?? null,
    autenticato: Boolean(sessione),
    caricata,
  };
}
