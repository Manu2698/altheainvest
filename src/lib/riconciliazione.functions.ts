import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validaLimiteFondi } from "./fondi";
import { isPiattaforma } from "./piattaforme.types";

export const getRiconciliazione = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { reale: boolean }) => ({ reale: Boolean(i.reale) }))
  .handler(async ({ data, context }) => {
    const { conLeaseConto, riconciliaAlpacaPersistente } = await import("./riconciliazione.server");
    let r = await conLeaseConto(context.userId, "alpaca", data.reale ? "reale" : "paper", () => riconciliaAlpacaPersistente(context.userId, data.reale));
    if (!r) {
      const { identitaAlpaca } = await import("./conti.server");
      const identity = await identitaAlpaca(context.userId, data.reale);
      if (identity && identity !== "assente") {
        const { data: saved } = await context.supabase.from("istantanee_contabili").select("*").eq("user_id", context.userId).eq("piattaforma", "alpaca").eq("ambiente", data.reale ? "reale" : "paper").eq("conto_id", identity.contoId).order("created_at", { ascending: false }).limit(1).maybeSingle();
        r = saved;
      }
    }
    if (!r) throw new Error("Ciclo in corso: riconciliazione disponibile al termine.");
    return { stato: r.stato, motivo: r.motivo, equity: r.equity, liquidita: r.liquidita, potereAcquisto: r.potere_acquisto, valuta: r.valuta, aggiornatoIl: r.osservato_al };
  });

export const getRegistroOrdini = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { reale: boolean }) => ({ reale: Boolean(i.reale) }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("registro_ordini").select("id,piattaforma,ticker,lato,stato,quantita_eseguita,prezzo_medio,riconciliato_il,created_at,strategia").eq("user_id", context.userId).eq("ambiente", data.reale ? "reale" : "paper").order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error("Registro non disponibile.");
    return rows ?? [];
  });

export const salvaFondi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { piattaforma: string; ambiente: string; liquidita: number | null; acquisto: number | null }) => {
    if (!isPiattaforma(i.piattaforma)) throw new Error("Piattaforma non valida.");
    return { piattaforma: i.piattaforma, ambiente: i.ambiente === "reale" ? "reale" : "paper", liquidita: validaLimiteFondi(i.liquidita), acquisto: validaLimiteFondi(i.acquisto) };
  })
  .handler(async ({ data, context }) => {
    if (data.piattaforma !== "alpaca") throw new Error("Limiti separati disponibili sui conti Alpaca; gli altri broker espongono solo liquidità.");
    const { conLeaseConto, riconciliaAlpacaPersistente } = await import("./riconciliazione.server");
    const result = await conLeaseConto(context.userId, data.piattaforma, data.ambiente, async () => {
      const s = await riconciliaAlpacaPersistente(context.userId, data.ambiente === "reale");
      if (s.liquidita == null || s.potere_acquisto == null) throw new Error("Fondi del conto non verificabili.");
      if ((data.liquidita != null && data.liquidita > Math.max(0, Number(s.liquidita))) || (data.acquisto != null && data.acquisto > Math.max(0, Number(s.potere_acquisto)))) throw new Error("Il limite non può superare i fondi disponibili presso il broker.");
      const { error } = await context.supabase.from("automazioni_conti").upsert({ user_id: context.userId, piattaforma: data.piattaforma, ambiente: data.ambiente, liquidita_limite: data.liquidita, acquisto_limite: data.acquisto, limiti_conto_id: s.conto_id });
      if (error) throw new Error("Impossibile salvare i fondi utilizzabili.");
      return { ok: true };
    });
    if (!result) throw new Error("Ciclo in corso: riprova al termine.");
    return result;
  });