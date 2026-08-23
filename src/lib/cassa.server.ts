import type { Movimento } from "./alpaca.types";
import { credenzialiUtente, logServer } from "./alpaca.server";

export async function leggiMovimenti(userId: string): Promise<Movimento[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("movimenti")
      .select("id, tipo, importo, valuta, ambiente, metodo, stato, riferimento, note, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      tipo: r.tipo as Movimento["tipo"],
      importo: Number(r.importo),
      valuta: r.valuta as string,
      ambiente: r.ambiente as Movimento["ambiente"],
      metodo: r.metodo as string,
      stato: r.stato as Movimento["stato"],
      riferimento: (r.riferimento as string | null) ?? null,
      note: (r.note as string | null) ?? null,
      createdAt: r.created_at as string,
    }));
  } catch (error) {
    logServer("cassa.leggiMovimenti", error);
    return [];
  }
}

/**
 * Registra un deposito o un prelievo.
 * In paper trading l'operazione è immediata (fondi virtuali).
 * Sul conto reale la richiesta resta "in attesa": il trasferimento di denaro
 * viene eseguito dal broker sul conto bancario collegato.
 */
export async function registraMovimento(
  userId: string,
  m: { tipo: "deposito" | "prelievo"; importo: number; metodo: string; reale: boolean; note: string },
): Promise<{ ok: boolean; messaggio: string }> {
  const ambiente = m.reale ? "reale" : "paper";

  if (m.tipo === "prelievo") {
    const conto = await disponibilita(userId, m.reale);
    if (conto !== null && m.importo > conto) {
      return {
        ok: false,
        messaggio: `Liquidità insufficiente: disponibili ${conto.toFixed(2)}.`,
      };
    }
  }

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("movimenti").insert({
      user_id: userId,
      tipo: m.tipo,
      importo: m.importo,
      ambiente,
      metodo: m.metodo,
      stato: m.reale ? "in_attesa" : "completato",
      note: m.note || null,
      riferimento: `ALT-${Date.now().toString(36).toUpperCase()}`,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    logServer("cassa.registraMovimento", error, { tipo: m.tipo, ambiente });
    return { ok: false, messaggio: "Non sono riuscito a registrare l'operazione." };
  }

  return {
    ok: true,
    messaggio: m.reale
      ? `${m.tipo === "deposito" ? "Deposito" : "Prelievo"} inviato: il broker lo elabora entro 1-3 giorni lavorativi.`
      : `${m.tipo === "deposito" ? "Deposito" : "Prelievo"} virtuale registrato sul conto paper.`,
  };
}

async function disponibilita(userId: string, reale: boolean): Promise<number | null> {
  try {
    const cred = await credenzialiUtente(userId, reale);
    if (!cred) return null;
    const res = await fetch(
      `${reale ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets"}/v2/account`,
      { headers: cred.headers },
    );
    if (!res.ok) return null;
    const account = (await res.json()) as Record<string, unknown>;
    const cash = Number(account["cash"]);
    return Number.isFinite(cash) ? cash : null;
  } catch {
    return null;
  }
}
