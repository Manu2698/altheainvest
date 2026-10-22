import { credenzialiUtente } from "./alpaca.server";
import { controllaIstantanea, type PosizioneContabile } from "./riconciliazione";
import type { Json } from "@/integrations/supabase/types";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
const json = (v: unknown): Json => JSON.parse(JSON.stringify(v));
const numero = (v: unknown) => v == null || v === "" ? NaN : Number(v);
const terminali = new Set(["filled", "canceled", "expired", "rejected", "replaced"]);

export async function conLeaseConto<T>(userId: string, piattaforma: string, ambiente: string, fn: () => Promise<T>): Promise<T | null> {
  const client = await db();
  const owner = crypto.randomUUID();
  const { data, error } = await client.rpc("prendi_lease_conto", { p_user: userId, p_piattaforma: piattaforma, p_ambiente: ambiente, p_proprietario: owner });
  if (error) throw new Error("Registro contabile non disponibile: nessun nuovo ordine.");
  if (!data) return null;
  try { return await fn(); }
  finally { await client.from("lease_conti").delete().eq("user_id", userId).eq("piattaforma", piattaforma).eq("ambiente", ambiente).eq("proprietario", owner); }
}

export async function registraIntento(i: { userId: string; piattaforma: string; ambiente: string; contoId: string; ticker: string; lato: string; strategia: string; importo: number }) {
  const clientId = `althea-${crypto.randomUUID()}`;
  const client = await db();
  const { data: incerti, error: queryError } = await client.from("registro_ordini").select("id").eq("user_id", i.userId).eq("piattaforma", i.piattaforma).eq("ambiente", i.ambiente).eq("conto_id", i.contoId).in("stato", ["invio_in_corso", "esito_incerto"]).limit(1);
  if (queryError || incerti?.length) throw new Error("Esito di un ordine precedente non confermato: nessun nuovo invio.");
  const { data, error } = await client.from("registro_ordini").insert({ user_id: i.userId, piattaforma: i.piattaforma, ambiente: i.ambiente, conto_id: i.contoId, client_id: clientId, ticker: i.ticker, lato: i.lato, strategia: i.strategia, importo_richiesto: i.importo, stato: "invio_in_corso" }).select("id").single();
  if (error || !data) throw new Error("Ordine non inviato: impossibile registrarlo in modo persistente.");
  return { id: data.id, clientId };
}

/** Non salva mai payload grezzi, credenziali o messaggi di errore del broker. */
export async function aggiornaRicevuta(id: string, ricevuta: Record<string, unknown> | null, stato: string) {
  const client = await db();
  const { error } = await client.from("registro_ordini").update({ broker_id: ricevuta?.["id"] ? String(ricevuta["id"]) : null, stato: ricevuta?.["status"] ? String(ricevuta["status"]) : stato, quantita_eseguita: numero(ricevuta?.["filled_qty"]) || 0, prezzo_medio: Number.isFinite(numero(ricevuta?.["filled_avg_price"])) ? numero(ricevuta?.["filled_avg_price"]) : null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("Ricevuta da riconciliare: non ripetere l'ordine.");
}

/** Solo GET broker. Le letture complete vengono persistite, mai dedotte da ordini inviati. */
export async function riconciliaAlpacaPersistente(userId: string, reale: boolean) {
  const cred = await credenzialiUtente(userId, reale);
  if (!cred) throw new Error("Conto non collegato.");
  const client = await db();
  const ambiente = reale ? "reale" : "paper";
  const api = reale ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";
  const iniziato = new Date().toISOString();
  const leggi = async (path: string) => {
    const r = await fetch(`${api}${path}`, { headers: cred.headers, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error("Dati del broker non disponibili per la riconciliazione.");
    return r.json();
  };
  const prima = await leggi("/v2/account") as Record<string, unknown>;
  if (!prima["id"]) throw new Error("Identità del conto non disponibile.");
  const contoId = `alpaca:${String(prima["id"])}`;
  const dal = `${new Date(Date.now() - 90 * 86400000).toISOString().slice(0,10)}T00:00:00Z`;
  let completo = true;
  const attivita: Record<string, unknown>[] = [];
  const ordini: Record<string, unknown>[] = [];
  const paginaAttivita = async () => {
    let cursor = "";
    for (let n = 0; n < 50; n++) {
      const rows = await leggi(`/v2/account/activities?after=${encodeURIComponent(dal)}&direction=asc&page_size=100${cursor ? `&page_token=${encodeURIComponent(cursor)}` : ""}`) as Record<string, unknown>[];
      attivita.push(...rows);
      if (rows.length < 100) return;
      const next = String(rows.at(-1)?.["id"] ?? "");
      if (!next || next === cursor) break;
      cursor = next;
    }
    completo = false;
  };
  const paginaOrdini = async () => {
    let after = dal;
    for (let n = 0; n < 20; n++) {
      const rows = await leggi(`/v2/orders?status=all&direction=asc&limit=500&after=${encodeURIComponent(after)}`) as Record<string, unknown>[];
      ordini.push(...rows);
      if (rows.length < 500) return;
      // Timestamp condivisi al confine pagina non sono una paginazione garantita: non certificare.
      completo = false;
      const next = String(rows.at(-1)?.["created_at"] ?? "");
      if (!next || next === after) return;
      after = next;
    }
    completo = false;
  };
  let pos: Record<string, unknown>[] = [];
  let storico: { giorno: string; valore: number }[] = [];
  let dopo = prima;
  let stabili = false;
  try {
    await Promise.all([paginaAttivita(), paginaOrdini()]);
    const [positions, history] = await Promise.all([leggi("/v2/positions"), leggi("/v2/account/portfolio/history?period=3M&timeframe=1D")]);
    pos = positions as Record<string, unknown>[];
    const h = history as { timestamp?: number[]; equity?: (number | null)[] };
    if (!h.timestamp || !h.equity || h.timestamp.length !== h.equity.length) completo = false;
    storico = (h.timestamp ?? []).map((t, idx) => ({ giorno: new Date(t * 1000).toISOString().slice(0,10), valore: numero(h.equity?.[idx]) }));
    if (storico.some(p => !Number.isFinite(p.valore))) completo = false;
    // Importa anche gli ordini broker precedenti senza inventare la loro strategia.
    for (const o of [...new Map(ordini.map(o => [String(o["id"]), o])).values()]) {
      if (!o["id"] || !o["created_at"] || !o["symbol"]) { completo = false; continue; }
      const { error: importError } = await client.from("registro_ordini").upsert({ user_id: userId, piattaforma: "alpaca", ambiente, conto_id: contoId, broker_id: String(o["id"]), client_id: String(o["client_order_id"] ?? `broker-${o["id"]}`), ticker: String(o["symbol"]), lato: String(o["side"]), strategia: "non_attribuita", stato: String(o["status"]), created_at: String(o["created_at"]) }, { onConflict: "user_id,piattaforma,ambiente,conto_id,client_id", ignoreDuplicates: true });
      if (importError) throw importError;
    }
    const { data: registrati, error } = await client.from("registro_ordini").select("*").eq("user_id", userId).eq("piattaforma", "alpaca").eq("ambiente", ambiente).eq("conto_id", contoId);
    if (error) throw error;
    for (const o of registrati ?? []) {
      if (o.stato === "non_inviato" || o.stato === "rifiutato_http") continue;
      let broker = ordini.find(b => String(b["id"]) === o.broker_id || String(b["client_order_id"]) === o.client_id);
      if (!broker) {
        try { broker = await leggi(o.broker_id ? `/v2/orders/${encodeURIComponent(o.broker_id)}` : `/v2/orders:by_client_order_id?client_order_id=${encodeURIComponent(o.client_id)}`); }
        catch { completo = false; continue; }
      }
      if (!broker) { completo = false; continue; }
      ordini.push(broker);
      const qty = numero(broker["filled_qty"]);
      const fills = [...new Map(attivita.filter(a => a["activity_type"] === "FILL" && String(a["order_id"]) === String(broker["id"])).map(a => [String(a["id"]), a])).values()];
      const sum = fills.reduce((s, f) => s + numero(f["qty"]), 0);
      const confermato = Number.isFinite(qty) && Math.abs(sum - qty) < 1e-8;
      if (!confermato) completo = false;
      const { error: updateError } = await client.from("registro_ordini").update({ broker_id: String(broker["id"]), stato: String(broker["status"]), quantita_eseguita: Number.isFinite(qty) ? qty : 0, prezzo_medio: Number.isFinite(numero(broker["filled_avg_price"])) ? numero(broker["filled_avg_price"]) : null, eseguito_il: broker["filled_at"] ? String(broker["filled_at"]) : null, riconciliato_il: confermato ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", o.id);
      if (updateError) throw updateError;
    }
    const fills = [...new Map(attivita.filter(a => a["activity_type"] === "FILL").map(a => [String(a["id"]), a])).values()];
    for (const f of fills) {
      if (!f["id"] || !f["order_id"] || !Number.isFinite(numero(f["qty"])) || !Number.isFinite(numero(f["price"])) || !f["transaction_time"]) { completo = false; continue; }
      const { error } = await client.from("esecuzioni_broker").upsert({ user_id: userId, piattaforma: "alpaca", ambiente, conto_id: contoId, broker_fill_id: String(f["id"]), broker_order_id: String(f["order_id"]), ticker: String(f["symbol"]), lato: String(f["side"]), quantita: numero(f["qty"]), prezzo: numero(f["price"]), eseguito_il: String(f["transaction_time"]) }, { onConflict: "user_id,piattaforma,ambiente,conto_id,broker_fill_id" });
      if (error) throw error;
    }
    const fineOrdini = await leggi("/v2/orders?status=all&limit=500&direction=desc") as Record<string, unknown>[];
    const fingerprint = (rows: Record<string, unknown>[]) => [...new Map(rows.map(o => [String(o["id"]), `${o["id"]}|${o["status"]}|${o["filled_qty"]}|${o["filled_avg_price"]}`])).values()].sort().join(";");
    stabili = fingerprint(fineOrdini.filter(o => String(o["created_at"]) >= dal)) === fingerprint([...new Map(ordini.map(o => [String(o["id"]), o])).values()].sort((a,b) => String(b["created_at"]).localeCompare(String(a["created_at"]))).slice(0,500));
    dopo = await leggi("/v2/account");
    const finaleStorico = storico.at(-1)?.valore;
    if (finaleStorico == null || Math.round(finaleStorico * 100) !== Math.round(numero(dopo["equity"]) * 100)) completo = false;
  } catch { completo = false; }
  const posizioni: PosizioneContabile[] = pos.map(p => ({ ticker: String(p["symbol"]), quantita: numero(p["qty"]), valore: numero(p["market_value"]), costo: numero(p["cost_basis"]), pnl: numero(p["unrealized_pl"]) }));
  const flussi = attivita.filter(a => a["activity_type"] !== "FILL").map(a => ({ id: String(a["id"] ?? ""), tipo: String(a["activity_type"] ?? ""), giorno: String(a["date"] ?? a["transaction_time"] ?? "").slice(0,10), netto: Number.isFinite(numero(a["net_amount"])) ? numero(a["net_amount"]) : null }));
  // Journal di titoli o attività sconosciute non hanno un controvalore cash affidabile.
  if (flussi.some(f => !["CSD","CSW","FEE","JNLC","DIV","DIVNRA","DIVFT"].includes(f.tipo) || f.netto == null)) completo = false;
  const controllo = controllaIstantanea({ prima: { id: String(prima["id"]), equity: numero(prima["equity"]), cash: numero(prima["cash"]) }, dopo: { id: String(dopo["id"]), equity: numero(dopo["equity"]), cash: numero(dopo["cash"]) }, posizioni, datiCompleti: completo && storico.length > 0, ordiniStabili: stabili, ordiniPendenti: ordini.some(o => !terminali.has(String(o["status"]))) });
  const { data: snapshot, error } = await client.from("istantanee_contabili").insert({ user_id: userId, piattaforma: "alpaca", ambiente, conto_id: contoId, valuta: String(dopo["currency"] ?? "USD"), equity: Number.isFinite(numero(dopo["equity"])) ? numero(dopo["equity"]) : null, liquidita: Number.isFinite(numero(dopo["cash"])) ? numero(dopo["cash"]) : null, potere_acquisto: Number.isFinite(numero(dopo["buying_power"])) ? numero(dopo["buying_power"]) : null, posizioni: json(posizioni), storico: json(storico), flussi: json(flussi), stato: controllo.stato, motivo: controllo.motivo, scarto: controllo.scarto, osservato_dal: iniziato, osservato_al: new Date().toISOString() }).select("*").single();
  if (error || !snapshot) throw new Error("Impossibile conservare la riconciliazione.");
  return snapshot;
}