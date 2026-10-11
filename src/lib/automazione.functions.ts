import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StrategyId } from "./strategies";
import type { EsitoCiclo } from "./trading.types";

export type Automazione = {
  attivo: boolean;
  reale: boolean;
  strategia: StrategyId;
  capitale: number;
  modalita: "limite" | "conto";
  ultimoCiclo: string | null;
  ultimoEsito: EsitoCiclo | null;
};

export const getAutomazione = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Automazione | null> => {
    const { data } = await context.supabase
      .from("automazioni_ia")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!data) return null;
    return {
      attivo: data.attivo,
      reale: data.reale,
      strategia: data.strategia as StrategyId,
      capitale: Number(data.capitale),
      modalita: data.modalita === "conto" ? "conto" : "limite",
      ultimoCiclo: data.ultimo_ciclo,
      ultimoEsito: (data.ultimo_esito as unknown as EsitoCiclo) ?? null,
    };
  });

export const salvaAutomazione = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      attivo: boolean;
      reale: boolean;
      strategia: StrategyId;
      capitale: number;
      modalita: "limite" | "conto";
    }) => {
      const ammesse: StrategyId[] = ["conservativo", "medio", "aggressivo"];
      const capitale = Number(input?.capitale);
      return {
        attivo: Boolean(input?.attivo),
        reale: Boolean(input?.reale),
        strategia: ammesse.includes(input?.strategia) ? input.strategia : ("medio" as StrategyId),
        capitale: Number.isFinite(capitale) ? Math.min(Math.max(capitale, 0), 10_000_000) : 0,
        modalita: input?.modalita === "conto" ? ("conto" as const) : ("limite" as const),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("automazioni_ia").upsert({
      user_id: context.userId,
      ...data,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Impossibile salvare le impostazioni dell'IA.");
    return { ok: true };
  });
