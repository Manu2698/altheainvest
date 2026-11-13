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
import { isPiattaforma, type Piattaforma } from "./piattaforme.types";
import type { Json } from "@/integrations/supabase/types";
import { ordiniContoAttuale } from "./storico-conto";

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
    return leggiConto(data.reale, context.userId, context.supabase);
  });

export const getStatoBroker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StatoCollegamento> => {
    const { statoCollegamento } = await import("./alpaca.server");
    return statoCollegamento(context.supabase, context.userId);
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
    return salvaChiaviUtente(context.supabase, context.userId, data.reale, data.keyId, data.secret);
  });

export const scollegaBroker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reale?: boolean } | undefined) => ({
    reale: Boolean(input?.reale),
  }))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { scollegaChiaviUtente } = await import("./alpaca.server");
    return scollegaChiaviUtente(context.supabase, context.userId, data.reale);
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
      piattaforma?: string;
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
        piattaforma: isPiattaforma(input?.piattaforma) ? input.piattaforma : ("alpaca" as Piattaforma),
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
    if (data.reale) throw new Error("Modalità reale temporaneamente disabilitata: Althea opera solo in PAPER durante i test.");
    const { eseguiCiclo } = await import("./trading.server");
    const { data: auto, error: autoError } = await context.supabase
      .from("automazioni_conti")
      .select("perdita_max_giornaliera")
      .eq("user_id", context.userId)
      .eq("piattaforma", data.piattaforma)
      .eq("ambiente", data.reale ? "reale" : "paper")
      .maybeSingle();
    if (autoError) throw new Error("Limite di perdita non verificabile: nessun ciclo eseguito.");
    const perditaMax =
      auto?.perdita_max_giornaliera != null ? Number(auto.perdita_max_giornaliera) : null;
    const esito = await eseguiCiclo(context.userId, { ...data, perditaMax });
    const aggiornamento: {
      ultimo_esito: Json;
      ultimo_ciclo: string;
      attivo?: boolean;
      pausa_motivo?: string;
      pausa_il?: string;
    } = {
      ultimo_esito: JSON.parse(JSON.stringify(esito)),
      ultimo_ciclo: new Date().toISOString(),
    };
    if (esito.bloccoPerdita) {
      aggiornamento.attivo = false;
      aggiornamento.pausa_motivo = esito.messaggio;
      aggiornamento.pausa_il = new Date().toISOString();
    }
    await context.supabase
      .from("automazioni_conti")
      .upsert({
        user_id: context.userId,
        piattaforma: data.piattaforma,
        ambiente: data.reale ? "reale" : "paper",
        ...aggiornamento,
      });
    return esito;
  });

export type DecisioneLog = {
  id: string;
  createdAt: string;
  ticker: string;
  lato: string;
  importo: number;
  pnlPct: number | null;
  motivo: string | null;
  strategia: string;
  piattaforma: string;
};

export const getAndamentoConto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reale?: boolean } | undefined) => ({ reale: Boolean(input?.reale) }))
  .handler(async ({ data, context }) => {
    const { storicoConto } = await import("./alpaca.server");
    const { identitaAlpaca } = await import("./conti.server");
    const identita = await identitaAlpaca(context.userId, data.reale);
    if (!identita || identita === "assente") return { storico: [], decisioni: [] };
    const ambiente = data.reale ? "reale" : "paper";
    const [storico, ordini] = await Promise.all([
      storicoConto(context.userId, data.reale),
      context.supabase
        .from("ordini_ia")
        .select("id, created_at, ticker, lato, importo, pnl_pct, motivo, strategia, piattaforma, ambiente, conto_id, conto_attribuzione")
        .eq("user_id", context.userId)
        .eq("ambiente", ambiente)
        .eq("piattaforma", "alpaca")
        .eq("conto_id", identita.contoId)
        .in("conto_attribuzione", ["motore", "verificato_broker"])
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (ordini.error) throw new Error("Storico del conto non disponibile.");
    const decisioni: DecisioneLog[] = ordiniContoAttuale(ordini.data ?? [], "alpaca", ambiente, identita.contoId).map((o) => ({
      id: o.id,
      createdAt: o.created_at,
      ticker: o.ticker,
      lato: o.lato,
      importo: Number(o.importo),
      pnlPct: o.pnl_pct == null ? null : Number(o.pnl_pct),
      motivo: o.motivo,
      strategia: o.strategia,
      piattaforma: o.piattaforma,
    }));
    return { storico, decisioni };
  });
