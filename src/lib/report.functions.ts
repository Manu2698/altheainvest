import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EsitoSimulazione, StatisticheStrategie } from "./report.types";

export type * from "./report.types";

export const getStatisticheStrategie = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reale?: boolean } | undefined) => ({ reale: Boolean(input?.reale) }))
  .handler(async ({ data, context }): Promise<StatisticheStrategie> => {
    const { calcolaStatistiche } = await import("./report.server");
    const { data: righe } = await context.supabase
      .from("ordini_ia")
      .select("id, strategia, ticker, lato, importo, pnl_pct, motivo, created_at")
      .eq("ambiente", data.reale ? "reale" : "paper")
      .order("created_at", { ascending: false })
      .limit(2000);
    return calcolaStatistiche(righe ?? []);
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
