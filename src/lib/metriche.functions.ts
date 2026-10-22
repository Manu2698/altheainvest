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
    const { storicoConto, credenzialiUtente } = await import("./alpaca.server");
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

    const dal = new Date(Date.now() - data.giorni * 86_400_000).toISOString().slice(0, 10);
    const api = data.reale ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";
    const [storico, att, bench, ordini] = await Promise.all([
      storicoConto(context.userId, data.reale),
      fetch(`${api}/v2/account/activities?activity_types=CSD,CSW,FEE,JNLC,JNLS&after=${dal}&page_size=100`, { headers: cred.headers })
        .then(async (r) => (r.ok ? ((await r.json()) as Record<string, unknown>[]) : null))
        .catch(() => null),
      fetch(`https://data.alpaca.markets/v2/stocks/bars?symbols=SPY&timeframe=1Day&start=${dal}&feed=iex&adjustment=raw&sort=asc&limit=1000`, { headers: cred.headers })
        .then(async (r) => (r.ok ? ((await r.json()) as { bars?: Record<string, { t: string; c: number }[]> }) : null))
        .catch(() => null),
      context.supabase
        .from("ordini_ia")
        .select("created_at, importo, pnl_pct, strategia, piattaforma")
        .eq("user_id", context.userId)
        .eq("ambiente", ambiente)
        .eq("piattaforma", "alpaca")
        .eq("lato", "sell")
        // Solo ordini attribuiti con certezza a un conto: i "non determinati" restano esclusi.
        .not("conto_id", "is", null)
        .not("pnl_pct", "is", null)
        .gte("created_at", dal)
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
      flussiCompleti: att != null && att.length < 100,
      benchmark,
      chiuse: (ordini.data ?? []).map((o) => ({
        giorno: o.created_at.slice(0, 10),
        importo: Number(o.importo),
        pnlPct: Number(o.pnl_pct),
        strategia: o.strategia,
      })),
    });
    return { ...base, collegato: true, costiInclusi: [...base.costiInclusi], costiMancanti: [...base.costiMancanti], metriche };
  });
