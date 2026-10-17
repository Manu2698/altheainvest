import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StrategyId } from "./strategies";
import type { EsitoCiclo } from "./trading.types";
import { isPiattaforma, type Piattaforma } from "./piattaforme.types";

export type Automazione = {
  attivo: boolean;
  reale: boolean;
  strategia: StrategyId;
  capitale: number;
  modalita: "limite" | "conto";
  ultimoCiclo: string | null;
  ultimoEsito: EsitoCiclo | null;
  perditaMaxGiornaliera: number | null;
  pausaMotivo: string | null;
  pausaIl: string | null;
  piattaforma: Piattaforma;
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
      perditaMaxGiornaliera:
        data.perdita_max_giornaliera != null ? Number(data.perdita_max_giornaliera) : null,
      pausaMotivo: data.pausa_motivo,
      pausaIl: data.pausa_il,
      piattaforma: isPiattaforma(data.piattaforma) ? data.piattaforma : "alpaca",
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
      // Riavviare il motore cancella il motivo della pausa precedente.
      ...(data.attivo ? { pausa_motivo: null, pausa_il: null } : {}),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Impossibile salvare le impostazioni dell'IA.");
    return { ok: true };
  });

export const salvaLimitePerdita = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limite: number | null }) => {
    const n = Number(input?.limite);
    return { limite: input?.limite == null || !Number.isFinite(n) || n <= 0 ? null : Math.min(n, 10_000_000) };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("automazioni_ia").upsert({
      user_id: context.userId,
      perdita_max_giornaliera: data.limite,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Impossibile salvare il limite di perdita.");
    return { ok: true };
  });

export const salvaPiattaforma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { piattaforma: Piattaforma }) => ({
    piattaforma: isPiattaforma(input?.piattaforma) ? input.piattaforma : ("alpaca" as Piattaforma),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("automazioni_ia").upsert({
      user_id: context.userId,
      piattaforma: data.piattaforma,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Impossibile salvare la piattaforma.");
    return { ok: true };
  });
