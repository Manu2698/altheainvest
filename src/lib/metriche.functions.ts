import { leggiContabilita, venditeConfermate } from "./contabilita";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Flusso, Metriche, PuntoPrezzo } from "./metriche";

export type RisultatoMetriche = {
  ambiente: "paper" | "reale";
  giorni: number;
  benchmark: string;
  collegato: boolean;
  costiInclusi: string[];
  costiMancanti: string[];
  aggiornatoIl: string;
  metriche: Metriche | null;
};

/** Metriche del conto Alpaca (paper o reale) nel periodo scelto: dati del broker, nessun backtest. */
export const getMetrichePortafoglio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { reale?: boolean; giorni?: number } | undefined) => ({
    reale: Boolean(i?.reale),
    giorni: [7, 30, 90].includes(Number(i?.giorni)) ? Number(i?.giorni) : 30,
  }))
  .handler(async ({ data, context }): Promise<RisultatoMetriche> => {
    const { credenzialiUtente } = await import("./alpaca.server");
    const { calcolaMetriche } = await import("./metriche");
    const ambiente = data.reale ? "reale" : "paper";
    const base = {
      ambiente, giorni: data.giorni, benchmark: "SPY (ETF S&P 500, solo prezzo, dividendi esclusi)",
      costiInclusi: ["Commissioni e fee registrate da Alpaca (già comprese nel valore del conto)"],
      // Le statistiche per operazione usano il P&L% letto prima dell'esecuzione: escludono fee e slippage.
      costiMancanti: [
        "Spread e slippage non stimati separatamente",
        "Conti su altre piattaforme non inclusi",
        "Tasse non considerate",
      ],
      aggiornatoIl: new Date().toISOString(),
    } as const;
    const cred = await credenzialiUtente(context.userId, data.reale);
    if (!cred) return { ...base, collegato: false, costiInclusi: [...base.costiInclusi], costiMancanti: [...base.costiMancanti], metriche: null };
    const { identitaAlpaca } = await import("./conti.server");
    const identita = await identitaAlpaca(context.userId, data.reale);
    const contoId = identita && identita !== "assente" ? identita.contoId : "identita-non-verificabile";
    const { conLeaseConto, riconciliaAlpacaPersistente } = await import("./riconciliazione.server");
    try { await conLeaseConto(context.userId, "alpaca", ambiente, () => riconciliaAlpacaPersistente(context.userId, data.reale)); } catch { /* use persisted incomplete/stale state below */ }
    const { data: snapshot } = await context.supabase.from("istantanee_contabili").select("*").eq("user_id", context.userId).eq("piattaforma", "alpaca").eq("ambiente", ambiente).eq("conto_id", contoId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const riconciliato = snapshot?.stato === "riconciliato" && Date.now() - Date.parse(snapshot.osservato_al) < 120_000;
    const storicoPersistito = Array.isArray(snapshot?.storico) ? snapshot.storico as unknown as { giorno: string; valore: number }[] : [];
    const flussiPersistiti = Array.isArray(snapshot?.flussi) ? snapshot.flussi as unknown as { giorno: string; tipo: string; netto: number | null }[] : [];

    const dal = new Date(Date.now() - data.giorni * 86_400_000).toISOString().slice(0, 10);
    const api = data.reale ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";
    const [storico, att, bench, ordini] = await Promise.all([
      Promise.resolve(storicoPersistito),
      Promise.resolve(flussiPersistiti.filter(f => ["CSD", "CSW", "FEE", "JNLC", "JNLS"].includes(f.tipo)).map(f => ({ date: f.giorno, activity_type: f.tipo, net_amount: f.netto }))),
      fetch(`https://data.alpaca.markets/v2/stocks/bars?symbols=SPY&timeframe=1Day&start=${dal}&feed=iex&adjustment=raw&sort=asc&limit=1000`, { headers: cred.headers })
        .then(async (r) => (r.ok ? ((await r.json()) as { bars?: Record<string, { t: string; c: number }[]> }) : null))
        .catch(() => null),
      context.supabase
        .from("registro_ordini")
        .select("broker_id,stato,riconciliato_il,strategia")
        .eq("user_id", context.userId)
        .eq("ambiente", ambiente)
        .eq("piattaforma", "alpaca")
        .eq("lato", "sell")
        // Solo ordini attribuiti con certezza a un conto: i "non determinati" restano esclusi.
        .eq("conto_id", contoId)
        .limit(5000),
    ]);
    // Trasferimenti (journal JNLC/JNLS) trattati come versamenti/prelievi in base al segno.
    const tipo = (t: unknown, netto: number): Flusso["tipo"] =>
      t === "CSD" ? "deposito" : t === "CSW" ? "prelievo" : t === "FEE" ? "costo" : netto >= 0 ? "deposito" : "prelievo";
    const flussi: Flusso[] = (att ?? []).map((a) => {
      const netto = Number(a["net_amount"] ?? 0) || 0;
      return { giorno: String(a["date"] ?? "").slice(0, 10), tipo: tipo(a["activity_type"], netto), importo: Math.abs(netto) };
    });
    const benchmark: PuntoPrezzo[] = (bench?.bars?.["SPY"] ?? []).map((b) => ({ giorno: b.t.slice(0, 10), prezzo: Number(b.c) }));
    const metriche = calcolaMetriche({
      storico: storico.filter((p) => p.giorno >= dal),
      flussi,
      flussiCompleti: riconciliato,
      riconciliazioneCompleta: riconciliato,
      benchmark,
      chiuse: venditeConfermate(leggiContabilita(snapshot?.contabilita).vendite,ordini.data ?? []).filter(v=>v.ora.slice(0,10)>=dal).map(v=>({giorno:v.ora.slice(0,10),importo:v.costo+v.pnl,pnlPct:v.pnl/v.costo*100,strategia:v.strategia})),
    });
    metriche.avvisi.push("P&L delle vendite da esecuzioni effettive e costo medio verificabile, al lordo delle fee non allocate. Ordini aperti, storia incoerente e strategia non attribuita esclusi; nessuna stima pre-esecuzione utilizzata.");
    metriche.avvisi.unshift(snapshot ? `Registro persistente: ${snapshot.stato} · ${snapshot.motivo}` : "Nessuna istantanea contabile persistente disponibile.");
    return { ...base, aggiornatoIl: snapshot?.osservato_al ?? base.aggiornatoIl, collegato: true, costiInclusi: [...base.costiInclusi], costiMancanti: [...base.costiMancanti], metriche };
  });
