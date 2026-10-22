import { leggiContabilita, venditeConfermate } from "./contabilita";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EsitoSimulazione, StatisticheStrategie } from "./report.types";

export type * from "./report.types";

export const getStatisticheStrategie = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reale?: boolean } | undefined) => ({ reale: Boolean(input?.reale) }))
  .handler(async ({ data, context }): Promise<StatisticheStrategie> => {
    const { calcolaStatistiche } = await import("./report.server");
    const { identitaAlpaca } = await import("./conti.server");
    const identita = await identitaAlpaca(context.userId, data.reale);
    const ids = identita && identita !== "assente" ? [identita.contoId] : [];
    if (!ids.length) return calcolaStatistiche([]);
    const [{data:rows,error},{data:snapshots}] = await Promise.all([
      context.supabase.from("registro_ordini").select("*").eq("user_id",context.userId).eq("ambiente",data.reale?"reale":"paper").eq("piattaforma","alpaca").in("conto_id",ids).order("created_at",{ascending:false}).limit(5000),
      context.supabase.from("istantanee_contabili").select("conto_id,contabilita,created_at").eq("user_id",context.userId).eq("ambiente",data.reale?"reale":"paper").eq("piattaforma","alpaca").in("conto_id",ids).order("created_at",{ascending:false}).limit(100)
    ]);
    if (error) throw new Error("Statistiche delle esecuzioni non disponibili.");
    const latest = new Map<string,NonNullable<typeof snapshots>[number]>();
    for (const s of snapshots ?? []) if (!latest.has(s.conto_id)) latest.set(s.conto_id,s);
    const sales=ids.flatMap(id=>venditeConfermate(leggiContabilita(latest.get(id)?.contabilita).vendite,(rows ?? []).filter(o=>o.conto_id===id)));
    return calcolaStatistiche((rows ?? []).filter(o=>["conservativo","medio","aggressivo"].includes(o.strategia) && o.quantita_eseguita>0 && o.riconciliato_il && ["filled","canceled","expired"].includes(o.stato)).map(o=>{
      const sale=sales.find(v=>v.ordine===o.broker_id);
      return {id:o.id,strategia:o.strategia,ticker:o.ticker,lato:o.lato,importo:o.quantita_eseguita*Number(o.prezzo_medio ?? 0),pnl_pct:sale ? sale.pnl/sale.costo*100 : null,motivo:o.riconciliazione_motivo,created_at:o.eseguito_il ?? o.created_at};
    }));
  });

export const simulaPortafoglio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { reale?: boolean; costoPct?: number; dividendoPct?: number; giorni?: number }) => {
      const lim = (v: unknown, min: number, max: number, def: number) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
      };
      return {
        reale: Boolean(input?.reale),
        costoPct: lim(input?.costoPct, 0, 5, 0.1),
        dividendoPct: lim(input?.dividendoPct, 0, 15, 1.5),
        giorni: Math.round(lim(input?.giorni, 10, 80, 60)),
      };
    },
  )
  .handler(async ({ data, context }): Promise<EsitoSimulazione> => {
    const { simula } = await import("./report.server");
    return simula(context.userId, data.reale, data.costoPct, data.dividendoPct, data.giorni);
  });
