import { credenzialiUtente, logServer } from "./alpaca.server";
import { isCripto, paioCripto } from "./mercato.server";
import type { OrdinePianificato } from "./mercato.types";

const base = (reale: boolean) =>
  reale ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";

type Riga = {
  id: string;
  ticker: string;
  lato: string;
  importo: number | string;
  reale: boolean;
  esegui_il: string;
  stato: string;
  ordine_id: string | null;
  errore: string | null;
  eseguito_il: string | null;
};

const mappa = (r: Riga): OrdinePianificato => ({
  id: r.id,
  ticker: r.ticker,
  lato: r.lato === "sell" ? "sell" : "buy",
  importo: Number(r.importo) || 0,
  reale: Boolean(r.reale),
  eseguiIl: r.esegui_il,
  stato: r.stato,
  ordineId: r.ordine_id,
  errore: r.errore,
  eseguitoIl: r.eseguito_il,
});

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function listaPianificati(userId: string): Promise<OrdinePianificato[]> {
  try {
    const sb = await db();
    const { data } = await sb
      .from("ordini_pianificati")
      .select("*")
      .eq("user_id", userId)
      .order("esegui_il", { ascending: true })
      .limit(100);
    return ((data ?? []) as unknown as Riga[]).map(mappa);
  } catch (error) {
    logServer("pianificati.lista", error);
    return [];
  }
}

export async function creaPianificato(
  userId: string,
  input: { ticker: string; lato: "buy" | "sell"; importo: number; reale: boolean; eseguiIl: string },
): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const sb = await db();
    const { error } = await sb.from("ordini_pianificati").insert({
      user_id: userId,
      ticker: input.ticker,
      lato: input.lato,
      importo: input.importo,
      reale: input.reale,
      esegui_il: input.eseguiIl,
    } as never);
    if (error) throw error;
    return { ok: true, messaggio: "Ordine pianificato salvato." };
  } catch (error) {
    logServer("pianificati.crea", error);
    return { ok: false, messaggio: "Non riesco a salvare l'ordine pianificato." };
  }
}

export async function annullaPianificato(userId: string, id: string) {
  try {
    const sb = await db();
    await sb
      .from("ordini_pianificati")
      .update({ stato: "annullato" } as never)
      .eq("id", id)
      .eq("user_id", userId)
      .eq("stato", "in_attesa");
    return { ok: true };
  } catch (error) {
    logServer("pianificati.annulla", error);
    return { ok: false };
  }
}

/** Invia al broker tutti gli ordini pianificati scaduti. */
export async function eseguiPianificatiScaduti(
  userId: string,
): Promise<{ inviati: number; falliti: number }> {
  let inviati = 0;
  let falliti = 0;
  try {
    const sb = await db();
    const { data } = await sb
      .from("ordini_pianificati")
      .select("*")
      .eq("user_id", userId)
      .eq("stato", "in_attesa")
      .lte("esegui_il", new Date().toISOString())
      .limit(20);

    for (const riga of ((data ?? []) as unknown as Riga[])) {
      const o = mappa(riga);
      const cred = await credenzialiUtente(userId, o.reale);
      if (!cred || !cred.proprie) {
        falliti++;
        continue;
      }
      const cripto = isCripto(o.ticker);
      let ordineId: string | null = null;
      let errore: string | null = null;
      try {
        const res = await fetch(`${base(o.reale)}/v2/orders`, {
          method: "POST",
          headers: { ...cred.headers, "content-type": "application/json" },
          body: JSON.stringify({
            symbol: cripto ? paioCripto(o.ticker) : o.ticker,
            side: o.lato,
            type: "market",
            time_in_force: cripto ? "gtc" : "day",
            notional: o.importo,
          }),
        });
        if (res.ok) ordineId = String(((await res.json()) as { id?: string }).id ?? "");
        else errore = (await res.text()).slice(0, 200);
      } catch (e) {
        errore = e instanceof Error ? e.message : "Errore di rete";
      }

      await sb
        .from("ordini_pianificati")
        .update({
          stato: errore ? "errore" : "inviato",
          ordine_id: ordineId,
          errore,
          eseguito_il: new Date().toISOString(),
        } as never)
        .eq("id", o.id);

      if (errore) falliti++;
      else inviati++;
    }
  } catch (error) {
    logServer("pianificati.esegui", error);
  }
  return { inviati, falliti };
}
