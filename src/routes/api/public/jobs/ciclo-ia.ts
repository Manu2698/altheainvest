import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Chiamato ogni minuto dallo scheduler Cloudflare dedicato alla Preview: fa girare l'IA per ogni
// conto (piattaforma + ambiente) con il motore automatico attivo, anche a sito chiuso.
// Il lease atomico nel DB impedisce cicli sovrapposti; la scadenza di 120 secondi
// protegge anche da esecuzioni duplicate o cicli che superano l'intervallo del cron.
const MAX_CONTI = 25;

export const Route = createFileRoute("/api/public/jobs/ciclo-ia")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Solo lo scheduler gestito può avviare i cicli: il segreto viene verificato, non solo la presenza.
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { eseguiCiclo } = await import("@/lib/trading.server");
        const adesso = new Date();
        const { data: righe, error: erroreRighe } = await supabaseAdmin
          .from("automazioni_conti")
          .select("*")
          .eq("attivo", true)
          .eq("ambiente", "paper")
          .or(`bloccato_fino.is.null,bloccato_fino.lt.${adesso.toISOString()}`)
          .order("ultimo_ciclo", { ascending: true, nullsFirst: true })
          .limit(MAX_CONTI);

        if (erroreRighe) {
          return Response.json({ errore: "Lettura delle automazioni non riuscita." }, { status: 500 });
        }

        let elaborati = 0;
        for (const r of righe ?? []) {
          // Acquisizione atomica del lease: se un'altra esecuzione l'ha già preso, salta.
          const { data: preso, error: erroreLease } = await supabaseAdmin
            .from("automazioni_conti")
            .update({
              bloccato_fino: new Date(Date.now() + 120_000).toISOString(),
              ultimo_ciclo: new Date().toISOString(),
            })
            .eq("user_id", r.user_id)
            .eq("piattaforma", r.piattaforma)
            .eq("ambiente", "paper")
            .eq("attivo", true)
            .or(`bloccato_fino.is.null,bloccato_fino.lt.${adesso.toISOString()}`)
            .select("user_id");
          if (erroreLease) {
            return Response.json({ errore: "Acquisizione del lease non riuscita." }, { status: 500 });
          }
          if (!preso?.length) continue;

          let esito;
          try {
            esito = await eseguiCiclo(r.user_id, {
              reale: false,
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
          const { error: erroreEsito } = await supabaseAdmin
            .from("automazioni_conti")
            .update({
              ultimo_esito: JSON.parse(JSON.stringify(esito)),
              ultimo_ciclo: new Date().toISOString(),
              bloccato_fino: null,
              ...(blocco
                ? { attivo: false, pausa_motivo: esito.messaggio, pausa_il: new Date().toISOString() }
                : {}),
            })
            .eq("user_id", r.user_id)
            .eq("piattaforma", r.piattaforma)
            .eq("ambiente", "paper");
          if (erroreEsito) {
            return Response.json({ errore: "Salvataggio dell'esito non riuscito." }, { status: 500 });
          }
          elaborati++;
        }
        return Response.json({ elaborati });
      },
    },
  },
});
