import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Analisi del comitato del conto collegato attualmente (sola lettura). */
export const getAnalisiComitato = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { reale?: boolean }) => ({ reale: Boolean(i?.reale) }))
  .handler(async ({ data, context }) => {
    const { identitaAlpaca } = await import("../conti.server");
    const id = await identitaAlpaca(context.userId, data.reale);
    if (!id || id === "assente") return [];
    const { data: righe, error } = await context.supabase.from("analisi_comitato")
      .select("id, created_at, ticker, strategia, proposta, decisione, veto, esito_dibattito, motivo, agenti, dibattito, errore")
      .eq("user_id", context.userId).eq("ambiente", data.reale ? "reale" : "paper").eq("conto_id", id.contoId)
      .order("created_at", { ascending: false }).limit(20);
    if (error) throw new Error("Analisi del comitato non disponibili.");
    return JSON.parse(JSON.stringify(righe ?? [])) as {
      id: string; created_at: string; ticker: string; strategia: string; proposta: string; decisione: string; veto: boolean;
      esito_dibattito: string | null; motivo: string; errore: string | null;
      agenti: Record<string, { voto?: string; sintesi?: string; punti?: string[]; veto?: boolean; motivi?: string[]; livello?: string; motivazione?: string; contraddizioni?: string[] } | null>;
      dibattito: { agente: string; turno: number; posizione: string; argomenti: string[]; risposteObiezioni: string[] }[];
    }[];
  });
