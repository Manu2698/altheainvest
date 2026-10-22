import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { leggiContabilita, venditeConfermate } from "./contabilita";
import { calcolaMetriche, type Flusso, type PuntoValore } from "./metriche";
import { raggruppaEsiti, riepilogaEsiti, type EsitoValutabile } from "./valutazione";

/** Lettura contabile, con sola verifica GET dell'identità broker; nessun ordine o modifica. */
export const getEvaluationStrategie = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { reale?: boolean; giorni?: number }) => ({ reale: Boolean(i?.reale), giorni: [7, 30, 90].includes(Number(i?.giorni)) ? Number(i.giorni) : 30 }))
  .handler(async ({ data, context }) => {
    const ambiente = data.reale ? "reale" : "paper";
    const { identitaAlpaca } = await import("./conti.server");
    const identita = await identitaAlpaca(context.userId, data.reale);
    const ids = identita && identita !== "assente" ? [identita.contoId] : [];
    const dal = new Date(Date.now() - data.giorni * 86400000).toISOString().slice(0, 10);
    const esiti: EsitoValutabile[] = [];
    const contabili = [];
    let esclusi = 0;
    for (const conto of ids) {
      const [snap, orders] = await Promise.all([
        context.supabase.from("istantanee_contabili").select("*").eq("user_id", context.userId).eq("piattaforma", "alpaca").eq("ambiente", ambiente).eq("conto_id", conto).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        context.supabase.from("registro_ordini").select("broker_id,stato,riconciliato_il,strategia,eseguito_il,created_at,lato").eq("user_id", context.userId).eq("piattaforma", "alpaca").eq("ambiente", ambiente).eq("conto_id", conto).order("created_at", { ascending: false }).limit(5000),
      ]);
      if (snap.error || orders.error) throw new Error("Valutazione contabile non disponibile.");
      const s = snap.data;
      const age = s ? Date.now() - Date.parse(s.osservato_al) : Infinity;
      const completo = Boolean(s && s.stato === "riconciliato" && age >= 0 && age < 120000 && (orders.data?.length ?? 0) < 5000);
      const vendite = completo ? venditeConfermate(leggiContabilita(s?.contabilita).vendite, orders.data ?? []).filter(v => v.ora.slice(0, 10) >= dal) : [];
      esiti.push(...vendite.map(v => ({ id: v.ordine, conto, ticker: v.ticker, strategia: v.strategia, ora: v.ora, pnlLordo: v.pnl, costoAllocato: null, settore: null, mercato: null })));
      esclusi += (orders.data ?? []).filter(o => o.lato === "sell" && (o.eseguito_il ?? o.created_at).slice(0, 10) >= dal && !vendite.some(v => v.ordine === o.broker_id)).length;
      const storico = Array.isArray(s?.storico) ? s.storico as unknown as PuntoValore[] : [];
      const flussiRaw = Array.isArray(s?.flussi) ? s.flussi as unknown as { giorno: string; tipo: string; netto: number | null }[] : [];
      const flussiValidi = flussiRaw.every(f => f.netto != null && Number.isFinite(f.netto));
      const flussi: Flusso[] = flussiRaw.filter(f => ["CSD", "CSW", "JNLC", "JNLS", "FEE"].includes(f.tipo)).map(f => ({ giorno: f.giorno.slice(0,10), tipo: f.tipo === "FEE" ? "costo" : f.tipo === "CSW" || ((f.tipo === "JNLC" || f.tipo === "JNLS") && (f.netto ?? 0) < 0) ? "prelievo" : "deposito", importo: Math.abs(f.netto ?? 0) }));
      const metriche = calcolaMetriche({ storico: storico.filter(p => p.giorno >= dal), flussi, chiuse: [], benchmark: [], flussiCompleti: completo && flussiValidi, riconciliazioneCompleta: completo });
      contabili.push({ conto, completo, aggiornatoIl: s?.osservato_al ?? null, motivo: s?.motivo ?? "Nessuna istantanea", metriche });
    }
    return { ambiente, giorni: data.giorni, dal, al: new Date().toISOString().slice(0,10), totale: riepilogaEsiti(esiti), perTitolo: raggruppaEsiti(esiti, "ticker"), perStrategia: raggruppaEsiti(esiti, "strategia"), esclusi, conti: contabili };
  });