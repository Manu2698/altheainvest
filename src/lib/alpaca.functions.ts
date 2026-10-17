import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  AssetInvestibile,
  AssetTipo,
  ContoBroker,
  StatoCollegamento,
} from "./alpaca.types";
import type { EsitoCiclo, OrdineBroker } from "./trading.types";
import type { StrategyId } from "./strategies";

export type {
  AssetInvestibile,
  AssetTipo,
  ContoBroker,
  PosizioneBroker,
  StatoCollegamento,
} from "./alpaca.types";
export type { DecisioneIA, EsitoCiclo, OrdineBroker } from "./trading.types";

export const getContoBroker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reale?: boolean } | undefined) => ({
    reale: Boolean(input?.reale),
  }))
  .handler(async ({ data, context }): Promise<ContoBroker> => {
    const { leggiConto } = await import("./alpaca.server");
    return leggiConto(data.reale, context.userId);
  });

export const getStatoBroker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StatoCollegamento> => {
    const { statoCollegamento } = await import("./alpaca.server");
    return statoCollegamento(context.userId);
  });

export const collegaBroker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { keyId: string; secret: string; reale?: boolean }) => {
    const keyId = String(input?.keyId ?? "").trim();
    const secret = String(input?.secret ?? "").trim();
    if (keyId.length < 8 || secret.length < 8) {
      throw new Error("Chiavi non valide: controlla di averle copiate per intero.");
    }
    return { keyId: keyId.slice(0, 200), secret: secret.slice(0, 400), reale: Boolean(input.reale) };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; messaggio: string }> => {
    const { salvaChiaviUtente } = await import("./alpaca.server");
    return salvaChiaviUtente(context.userId, data.reale, data.keyId, data.secret);
  });

export const scollegaBroker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reale?: boolean } | undefined) => ({
    reale: Boolean(input?.reale),
  }))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { scollegaChiaviUtente } = await import("./alpaca.server");
    return scollegaChiaviUtente(context.userId, data.reale);
  });

export const cercaAsset = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      input:
        | { q?: string; tipo?: AssetTipo | "tutti"; limite?: number; reale?: boolean }
        | undefined,
    ) => ({
      q: String(input?.q ?? "").trim().slice(0, 40),
      tipo: (input?.tipo ?? "tutti") as AssetTipo | "tutti",
      limite: Math.min(Math.max(Number(input?.limite ?? 100), 20), 500),
      reale: Boolean(input?.reale),
    }),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      risultati: AssetInvestibile[];
      totale: number;
      totaleFiltrato: number;
      conteggi: Record<AssetTipo, number>;
    }> => {
      const { cercaAssets } = await import("./alpaca.server");
      return cercaAssets(context.userId, data.reale, data.q, data.tipo, data.limite);
    },
  );


export const getOrdiniBroker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reale?: boolean } | undefined) => ({
    reale: Boolean(input?.reale),
  }))
  .handler(async ({ data, context }): Promise<OrdineBroker[]> => {
    const { leggiOrdini } = await import("./trading.server");
    return leggiOrdini(context.userId, data.reale);
  });

export const eseguiCicloIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      reale?: boolean;
      strategia: StrategyId;
      capitale: number;
      universo?: string[];
      modalita?: "limite" | "conto";
    }) => {
      const ammesse: StrategyId[] = ["conservativo", "medio", "aggressivo"];
      const strategia = ammesse.includes(input?.strategia) ? input.strategia : "medio";
      const capitale = Number(input?.capitale);
      return {
        reale: Boolean(input?.reale),
        strategia,
        capitale: Number.isFinite(capitale) ? Math.min(Math.max(capitale, 0), 10_000_000) : 0,
        modalita: input?.modalita === "conto" ? ("conto" as const) : ("limite" as const),
        universo: (Array.isArray(input?.universo) ? input.universo : [])
          .map((t) => String(t).toUpperCase().trim())
          .filter(Boolean)
          .slice(0, 200),
      };
    },
  )
  .handler(async ({ data, context }): Promise<EsitoCiclo> => {
    const { eseguiCiclo } = await import("./trading.server");
    const { data: auto } = await context.supabase
      .from("automazioni_ia")
      .select("perdita_max_giornaliera, piattaforma")
      .eq("user_id", context.userId)
      .maybeSingle();
    const perditaMax =
      auto?.perdita_max_giornaliera != null ? Number(auto.perdita_max_giornaliera) : null;
    const esito = await eseguiCiclo(context.userId, { ...data, perditaMax, piattaforma: auto?.piattaforma ?? "alpaca" });
    if (esito.bloccoPerdita) {
      await context.supabase
        .from("automazioni_ia")
        .update({
          attivo: false,
          pausa_motivo: esito.messaggio,
          pausa_il: new Date().toISOString(),
          ultimo_esito: JSON.parse(JSON.stringify(esito)),
        })
        .eq("user_id", context.userId);
    }
    return esito;
  });
