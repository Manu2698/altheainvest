import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Chiamato ogni minuto dallo scheduler Cloudflare dedicato alla Preview: fa girare l'IA per ogni
// conto PAPER con il motore automatico attivo, anche a sito chiuso.
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
        const adesso = new Date().toISOString();

        // Evita il filtro PostgREST .or(...): i due casi sono equivalenti ma più affidabili
        // come query distinte, soprattutto con timestamp timestamptz.
        const [senzaLease, leaseScaduti] = await Promise.all([
          supabaseAdmin
            .from("automazioni_conti")
            .select("*")
            .eq("attivo", true)
            .eq("ambiente", "paper")
            .is("bloccato_fino", null)
            .order("ultimo_ciclo", { ascending: true, nullsFirst: true })
            .limit(MAX_CONTI),
          supabaseAdmin
            .from("automazioni_conti")
            .select("*")
            .eq("attivo", true)
            .eq("ambiente", "paper")
            .lt("bloccato_fino", adesso)
            .order("ultimo_ciclo", { ascending: true, nullsFirst: true })
            .limit(MAX_CONTI),
        ]);

        if (senzaLease.error || leaseScaduti.error) {
          console.error("[Althea cron] lettura PAPER fallita", JSON.stringify({
            senzaLease: senzaLease.error?.code ?? null,
            leaseScaduti: leaseScaduti.error?.code ?? null,
            senzaLeaseMessage: senzaLease.error?.message ?? null,
            leaseScadutiMessage: leaseScaduti.error?.message ?? null,
          }));
          return Response.json({ errore: "Lettura delle automazioni non riuscita." }, { status: 500 });
        }

        const righe = [...(senzaLease.data ?? []), ...(leaseScaduti.data ?? [])]
          .sort((a, b) => {
            if (a.ultimo_ciclo == null) return b.ultimo_ciclo == null ? 0 : -1;
            if (b.ultimo_ciclo == null) return 1;
            return new Date(a.ultimo_ciclo).getTime() - new Date(b.ultimo_ciclo).getTime();
          })
          .slice(0, MAX_CONTI);

        let elaborati = 0;
        for (const r of righe) {
          // Acquisizione atomica: prima prova un lease libero, poi uno scaduto.
          const leaseNow = new Date().toISOString();
          const leaseUpdate = {
            bloccato_fino: new Date(Date.now() + 120_000).toISOString(),
            ultimo_ciclo: leaseNow,
          };
          const baseLease = () => supabaseAdmin
            .from("automazioni_conti")
            .update(leaseUpdate)
            .eq("user_id", r.user_id)
            .eq("piattaforma", r.piattaforma)
            .eq("ambiente", "paper")
            .eq("attivo", true);

          const libero = await baseLease().is("bloccato_fino", null).select("user_id");
          if (libero.error) {
            return Response.json({ errore: "Acquisizione del lease non riuscita." }, { status: 500 });
          }
          let preso = libero.data;
          if (!preso?.length) {
            const scaduto = await baseLease().lt("bloccato_fino", leaseNow).select("user_id");
            if (scaduto.error) {
              return Response.json({ errore: "Acquisizione del lease non riuscita." }, { status: 500 });
            }
            preso = scaduto.data;
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
