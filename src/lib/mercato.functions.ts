import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OrdinePianificato, Quotazione, SegnaleStrumento } from "./mercato.types";

export type { OrdinePianificato, Quotazione, SegnaleStrumento } from "./mercato.types";

const tickers = (input: unknown) =>
  (Array.isArray(input) ? input : [])
    .map((t) => String(t).toUpperCase().trim())
    .filter(Boolean)
    .slice(0, 60);

export const getQuotazioni = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reale?: boolean; tickers: string[] }) => ({
    reale: Boolean(input?.reale),
    tickers: tickers(input?.tickers),
  }))
  .handler(async ({ data, context }): Promise<Quotazione[]> => {
    const { quotazioni } = await import("./mercato.server");
    return quotazioni(context.userId, data.reale, data.tickers);
  });

export const getSegnali = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reale?: boolean; tickers: string[] }) => ({
    reale: Boolean(input?.reale),
    tickers: tickers(input?.tickers),
  }))
  .handler(async ({ data, context }): Promise<SegnaleStrumento[]> => {
    const { segnali } = await import("./mercato.server");
    return segnali(context.userId, data.reale, data.tickers);
  });

export const listaOrdiniPianificati = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrdinePianificato[]> => {
    const { listaPianificati } = await import("./pianificati.server");
    return listaPianificati(context.userId);
  });

export const creaOrdinePianificato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticker: string; lato: "buy" | "sell"; importo: number; reale?: boolean; eseguiIl: string }) => {
    const ticker = String(input?.ticker ?? "").toUpperCase().trim();
    const importo = Number(input?.importo);
    const eseguiIl = String(input?.eseguiIl ?? "");
    if (!ticker) throw new Error("Ticker mancante.");
    if (!Number.isFinite(importo) || importo < 1) throw new Error("Importo minimo 1 €.");
    if (!eseguiIl || Number.isNaN(Date.parse(eseguiIl))) throw new Error("Data/orario non valido.");
    return {
      ticker,
      lato: input.lato === "sell" ? ("sell" as const) : ("buy" as const),
      importo: Math.min(importo, 1_000_000),
      reale: Boolean(input?.reale),
      eseguiIl: new Date(eseguiIl).toISOString(),
    };
  })
  .handler(async ({ data, context }) => {
    const { creaPianificato } = await import("./pianificati.server");
    return creaPianificato(context.userId, data);
  });

export const annullaOrdinePianificato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .handler(async ({ data, context }) => {
    const { annullaPianificato } = await import("./pianificati.server");
    return annullaPianificato(context.userId, data.id);
  });

export const eseguiOrdiniScaduti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { eseguiPianificatiScaduti } = await import("./pianificati.server");
    return eseguiPianificatiScaduti(context.userId);
  });
