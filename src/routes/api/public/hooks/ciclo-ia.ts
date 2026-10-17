import { createFileRoute } from "@tanstack/react-router";

// Chiamato ogni minuto dallo scheduler del database: fa girare l'IA per ogni
// utente con il motore automatico attivo, anche a sito chiuso.
// Ogni utente viene elaborato al massimo una volta ogni 55 secondi (lease nel DB),
// quindi chiamate ripetute non possono far operare l'IA più spesso del previsto.
const MAX_UTENTI = 25;

export const Route = createFileRoute("/api/public/hooks/ciclo-ia")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { eseguiCiclo } = await import("@/lib/trading.server");
        const adesso = new Date();
        const soglia = new Date(adesso.getTime() - 55_000).toISOString();

        const { data: righe } = await supabaseAdmin
          .from("automazioni_ia")
          .select("*")
          .eq("attivo", true)
          .or(`ultimo_ciclo.is.null,ultimo_ciclo.lt.${soglia}`)
          .or(`bloccato_fino.is.null,bloccato_fino.lt.${adesso.toISOString()}`)
          .order("ultimo_ciclo", { ascending: true, nullsFirst: true })
          .limit(MAX_UTENTI);

        let elaborati = 0;
        for (const r of righe ?? []) {
          // Acquisizione atomica del lease: se un'altra esecuzione l'ha già preso, salta.
          const { data: preso } = await supabaseAdmin
            .from("automazioni_ia")
            .update({
              bloccato_fino: new Date(Date.now() + 120_000).toISOString(),
              ultimo_ciclo: new Date().toISOString(),
            })
            .eq("user_id", r.user_id)
            .eq("attivo", true)
            .or(`ultimo_ciclo.is.null,ultimo_ciclo.lt.${soglia}`)
            .select("user_id");
          if (!preso?.length) continue;

          let esito;
          try {
            esito = await eseguiCiclo(r.user_id, {
              reale: r.reale,
              strategia: r.strategia as "conservativo" | "medio" | "aggressivo",
              capitale: Number(r.capitale),
              modalita: r.modalita === "conto" ? "conto" : "limite",
              universo: [],
              piattaforma: r.piattaforma,
              perditaMax: r.perdita_max_giornaliera != null ? Number(r.perdita_max_giornaliera) : null,
            });
          } catch (e) {
            esito = {
              ok: false,
              messaggio: e instanceof Error ? e.message : "Errore imprevisto.",
              mercatoAperto: false,
              decisioni: [],
              eseguiti: 0,
            };
          }
          const blocco = "bloccoPerdita" in esito && esito.bloccoPerdita;
          await supabaseAdmin
            .from("automazioni_ia")
            .update({
              ultimo_esito: JSON.parse(JSON.stringify(esito)),
              ultimo_ciclo: new Date().toISOString(),
              bloccato_fino: null,
              ...(blocco
                ? { attivo: false, pausa_motivo: esito.messaggio, pausa_il: new Date().toISOString() }
                : {}),
            })
            .eq("user_id", r.user_id);
          elaborati++;
        }
        return Response.json({ elaborati });
      },
    },
  },
});
