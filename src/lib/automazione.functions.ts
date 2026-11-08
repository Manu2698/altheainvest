import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StrategyId } from "./strategies";
import type { EsitoCiclo } from "./trading.types";
import { isPiattaforma, type Piattaforma } from "./piattaforme.types";

export type Ambiente = "paper" | "reale";

export type ContoAutomazione = {
  piattaforma: Piattaforma;
  ambiente: Ambiente;
  collegato: boolean;
  attivo: boolean;
  strategia: StrategyId;
  capitale: number;
  liquiditaLimite: number | null;
  acquistoLimite: number | null;
  modalita: "limite" | "conto";
  perditaMaxGiornaliera: number | null;
  pausaMotivo: string | null;
  pausaIl: string | null;
  ultimoCiclo: string | null;
  ultimoEsito: EsitoCiclo | null;
};

const STRATEGIE: StrategyId[] = ["conservativo", "medio", "aggressivo"];

const validaConto = (i: { piattaforma?: unknown; ambiente?: unknown }) => ({
  piattaforma: isPiattaforma(i?.piattaforma) ? i.piattaforma : ("alpaca" as Piattaforma),
  ambiente: (i?.ambiente === "reale" ? "reale" : "paper") as Ambiente,
});

export const getAutomazioni = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ conti: ContoAutomazione[] }> => {
    const [auto, broker, esterne] = await Promise.all([
      context.supabase.from("automazioni_conti").select("*").eq("user_id", context.userId),
      context.supabase
        .from("broker_credenziali")
        .select("ambiente")
        .eq("user_id", context.userId),
      context.supabase
        .from("piattaforme_credenziali")
        .select("piattaforma, ambiente")
        .eq("user_id", context.userId),
    ]);

    type Riga = NonNullable<typeof auto.data>[number];
    const righe = new Map<string, Riga>(
      (auto.data ?? []).map((r) => [`${r.piattaforma}:${r.ambiente}`, r]),
    );
    const chiavi = new Set<string>(righe.keys());
    for (const b of broker.data ?? []) chiavi.add(`alpaca:${b.ambiente === "reale" ? "reale" : "paper"}`);
    for (const e of esterne.data ?? []) {
      if (isPiattaforma(e.piattaforma) && e.piattaforma !== "alpaca") {
        chiavi.add(`${e.piattaforma}:${e.ambiente === "reale" ? "reale" : "paper"}`);
      }
    }

    const collegate = new Set<string>();
    for (const b of broker.data ?? []) collegate.add(`alpaca:${b.ambiente === "reale" ? "reale" : "paper"}`);
    for (const e of esterne.data ?? []) collegate.add(`${e.piattaforma}:${e.ambiente === "reale" ? "reale" : "paper"}`);

    // Le chiavi Alpaca di piattaforma (se presenti) rendono operativo il conto paper.
    const { statoCollegamento } = await import("./alpaca.server");
    const statoAlpaca = await statoCollegamento(context.userId);
    if (statoAlpaca.piattaforma) {
      chiavi.add("alpaca:paper");
      collegate.add("alpaca:paper");
    }

    const conti: ContoAutomazione[] = [...chiavi].sort().map((k) => {
      const [p, a] = k.split(":") as [Piattaforma, Ambiente];
      const r = righe.get(k);
      return {
        piattaforma: p,
        ambiente: a,
        collegato: collegate.has(k),
        attivo: r?.attivo ?? false,
        strategia: STRATEGIE.includes(r?.strategia as StrategyId)
          ? (r?.strategia as StrategyId)
          : "medio",
        capitale: r ? Number(r.capitale) : 0,
        liquiditaLimite: r?.liquidita_limite == null ? null : Number(r.liquidita_limite),
        acquistoLimite: r?.acquisto_limite == null ? null : Number(r.acquisto_limite),
        modalita: r?.modalita === "conto" ? "conto" : "limite",
        perditaMaxGiornaliera:
          r?.perdita_max_giornaliera != null ? Number(r.perdita_max_giornaliera) : null,
        pausaMotivo: r?.pausa_motivo ?? null,
        pausaIl: r?.pausa_il ?? null,
        ultimoCiclo: r?.ultimo_ciclo ?? null,
        ultimoEsito: (r?.ultimo_esito as unknown as EsitoCiclo) ?? null,
      };
    });
    return { conti };
  });

export const salvaAutomazione = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      piattaforma: Piattaforma;
      ambiente: Ambiente;
      attivo: boolean;
      strategia: StrategyId;
      capitale: number;
      modalita: "limite" | "conto";
    }) => {
      const capitale = Number(input?.capitale);
      return {
        ...validaConto(input ?? {}),
        attivo: Boolean(input?.attivo),
        strategia: STRATEGIE.includes(input?.strategia) ? input.strategia : ("medio" as StrategyId),
        capitale: Number.isFinite(capitale) ? Math.min(Math.max(capitale, 0), 10_000_000) : 0,
        modalita: input?.modalita === "conto" ? ("conto" as const) : ("limite" as const),
      };
    },
  )
  .handler(async ({ data, context }) => {
    if (data.attivo && data.ambiente === "reale") {
      throw new Error("Non puoi avviare il trading reale: Althea è bloccata in modalità PAPER durante i test.");
    }
    const { error } = await context.supabase.from("automazioni_conti").upsert({
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
  .inputValidator((input: { piattaforma: Piattaforma; ambiente: Ambiente; limite: number | null }) => {
    const n = Number(input?.limite);
    return {
      ...validaConto(input ?? {}),
      limite: input?.limite == null || !Number.isFinite(n) || n <= 0 ? null : Math.min(n, 10_000_000),
    };
  })
  .handler(async ({ data, context }) => {
    const { limite, ...conto } = data;
    const { error } = await context.supabase.from("automazioni_conti").upsert({
      user_id: context.userId,
      ...conto,
      perdita_max_giornaliera: limite,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Impossibile salvare il limite di perdita.");
    return { ok: true };
  });
