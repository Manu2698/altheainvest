import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DURATE_ORE, generaToken, hashToken, normalizzaOpzioni, statoLink, type OpzioniCondivisione } from "./condivisione";
import type { EsitoVista, LinkCondivisione } from "./condivisione.types";

export const creaLinkCondivisione = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { nome: string; durataOre: number; opzioni: Partial<OpzioniCondivisione> }) => {
    const nome = String(i?.nome ?? "").trim().slice(0, 80) || "Analisi Althea";
    const durataOre = Number(i?.durataOre);
    if (!(DURATE_ORE as readonly number[]).includes(durataOre)) throw new Error("Scadenza non valida.");
    return { nome, durataOre, opzioni: normalizzaOpzioni(i?.opzioni) };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { salvaEvento } = await import("./event-log.server");
    const token = generaToken();
    const scade = new Date(Date.now() + data.durataOre * 3_600_000).toISOString();
    const { data: riga, error } = await supabaseAdmin
      .from("link_condivisione")
      .insert({ user_id: context.userId, nome: data.nome, token_hash: await hashToken(token), opzioni: data.opzioni, scade_il: scade })
      .select("id")
      .single();
    if (error || !riga) throw new Error("Impossibile creare il link.");
    await salvaEvento({
      livello: "info",
      origine: "condivisione.creata",
      tipo: "Condivisione",
      messaggio: "Link di analisi creato.",
      contesto: { link_id: riga.id, scade_il: scade, opzioni: data.opzioni },
    });
    // Il token viene restituito solo ora: nel database resta soltanto la sua impronta.
    return { id: riga.id, token, scadeIl: scade };
  });

export const listaLinkCondivisione = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LinkCondivisione[]> => {
    const { data } = await context.supabase
      .from("link_condivisione")
      .select("id, nome, opzioni, scade_il, revocato_il, ultimo_accesso, accessi, creato_il")
      .order("creato_il", { ascending: false })
      .limit(50);
    return (data ?? []).map((l) => ({
      id: l.id,
      nome: l.nome,
      opzioni: normalizzaOpzioni(l.opzioni as Partial<OpzioniCondivisione>),
      scadeIl: l.scade_il,
      revocatoIl: l.revocato_il,
      ultimoAccesso: l.ultimo_accesso,
      accessi: l.accessi,
      creatoIl: l.creato_il,
      stato: statoLink(l),
    }));
  });

export const revocaLinkCondivisione = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => {
    const id = String(i?.id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Link non valido.");
    return { id };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { salvaEvento } = await import("./event-log.server");
    const { data: righe } = await supabaseAdmin
      .from("link_condivisione")
      .update({ revocato_il: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .is("revocato_il", null)
      .select("id");
    if (righe?.length)
      await salvaEvento({ livello: "info", origine: "condivisione.revocata", tipo: "Condivisione", messaggio: "Link di analisi revocato.", contesto: { link_id: data.id } });
    return { ok: Boolean(righe?.length) };
  });

/** Pubblica: unica porta d'accesso per chi ha il link. Verifica il token sul server a ogni richiesta. */
export const vistaCondivisa = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string }) => ({ token: String(i?.token ?? "").slice(0, 64) }))
  .handler(async ({ data }): Promise<EsitoVista> => {
    const { apriVista, logCondivisione } = await import("./condivisione.server");
    try {
      return await apriVista(data.token);
    } catch (e) {
      logCondivisione(e);
      throw new Error("Vista non disponibile al momento.");
    }
  });
