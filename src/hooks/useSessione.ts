import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useSessione() {
  const [sessione, setSessione] = useState<Session | null>(null);
  const [caricata, setCaricata] = useState(false);

  useEffect(() => {
    let attivo = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!attivo) return;
      setSessione(data.session);
      setCaricata(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSessione(s);
      setCaricata(true);
    });
    return () => {
      attivo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { sessione, utente: sessione?.user ?? null, autenticato: Boolean(sessione), caricata };
}
