import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Quotazione, SegnaleStrumento } from "./mercato.types";

export type { Quotazione, SegnaleStrumento } from "./mercato.types";

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
