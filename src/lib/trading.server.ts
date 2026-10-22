import { credenzialiUtente, logServer } from "./alpaca.server";
import { getStrategia, type StrategyId } from "./strategies";
import type { LeaseConto } from "./riconciliazione.server";
import { capitalePendenti } from "./esecuzioni";
import type { DecisioneIA, EsitoCiclo, OrdineBroker } from "./trading.types";

const base = (reale: boolean) =>
  reale ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const isCripto = (t: string) => t.includes("/") || /^[A-Z]{2,6}USD$/.test(t);
const paioCripto = (t: string) => (t.includes("/") ? t : t.replace(/USD$/, "/USD"));

/** Ultimi prezzi giornalieri per ticker (azioni via IEX, cripto via endpoint dedicato). */
export async function serieStorica(
  tickers: string[],
  headers: Record<string, string>,
  /** Se fornito, riceve la data dell'ultima barra per ticker (controllo dati obsoleti). */
  ultimi?: Record<string, string>,
): Promise<Record<string, number[]>> {
  const azioni = tickers.filter((t) => !isCripto(t));
  const cripto = tickers.filter(isCripto);
  const out: Record<string, number[]> = {};

  const barre: Record<string, {c:number;t:string}[]> = {};
  const invalida = () => { for (const t of tickers) { delete out[t]; delete out[t.replace("/", "")]; if (ultimi) {delete ultimi[t];delete ultimi[t.replace("/", "")];} } };
  let fallito = false;
  const raccogli = (payload: unknown, mappa: (s: string) => string) => {
    const bars = (payload as {bars?:Record<string,{c:number;t?:string}[]>})?.bars;
    if (!bars || typeof bars !== "object") throw new Error("Storico incompleto.");
    for (const [sym,righe] of Object.entries(bars)) {
      const key=mappa(sym);
      for (const r of righe) {
        const prev=barre[key]?.at(-1);
        if (!r.t || !Number.isFinite(Date.parse(r.t)) || Date.parse(r.t)>Date.now() || !Number.isFinite(Number(r.c)) || Number(r.c)<=0 || (prev && Date.parse(r.t)<=Date.parse(prev.t))) throw new Error("Barre duplicate, future o non confrontabili.");
        (barre[key] ??= []).push({c:Number(r.c),t:r.t});
      }
      out[key]=(barre[key] ?? []).map(r=>r.c);
      const t=barre[key]?.at(-1)?.t;
      if (ultimi && t) ultimi[key]=t;
    }
  };

  const richieste: Promise<void>[] = [];
  // Alpaca restituisce un elenco vuoto se non si specifica una finestra temporale.
  const inizio = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const controlla = async (r: Response, origine: string) => {
    if (r.ok) return r.json();
    logServer(origine, new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`));
    return null;
  };
  const pagine = async (url: string, origine: string, mappa: (s: string) => string) => {
    let token: string | null = null;
    for (let pagina = 0; pagina < 30; pagina++) {
      const r = await fetch(`${url}${token ? `&page_token=${encodeURIComponent(token)}` : ""}`, { headers, signal: AbortSignal.timeout(15000) });
      const j = await controlla(r, origine) as { bars?: Record<string, { c: number; t?: string }[]>; next_page_token?: string | null } | null;
      if (!j) { fallito=true; invalida(); return; }
      raccogli(j, mappa);
      token = j.next_page_token ?? null;
      if (!token) return;
    }
    // Serie troncata: non presentarla al motore come completa.
    fallito=true; invalida();
  };

  if (azioni.length) {
    const url = `https://data.alpaca.markets/v2/stocks/bars?symbols=${encodeURIComponent(
      azioni.join(","),
    )}&timeframe=1Day&limit=1000&start=${inizio}&feed=iex&adjustment=split&sort=asc`;
    richieste.push(
      pagine(url, "trading.serieStorica.azioni", (s) => s)
        .catch((e) => { fallito=true; invalida(); logServer("trading.serieStorica.azioni", e); }),
    );
  }

  if (cripto.length) {
    const url = `https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=${encodeURIComponent(
      cripto.map(paioCripto).join(","),
    )}&timeframe=1Day&limit=1000&start=${inizio}&sort=asc`;
    richieste.push(
      pagine(url, "trading.serieStorica.cripto", (s) => s.replace("/", ""))
        .catch((e) => { fallito=true; invalida(); logServer("trading.serieStorica.cripto", e); }),
    );
  }


  await Promise.all(richieste);
  if (fallito) invalida();
  return out;
}

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

type Posizione = { ticker: string; valore: number; pnlPct: number };

export function decide(
  strategia: StrategyId,
  ticker: string,
  chiusure: number[],
  posizione: Posizione | undefined,
  quotaTarget: number,
): { azione: "compra" | "vendi" | "attendi"; importo: number; motivo: string } {
  if (chiusure.length < 6) {
    return { azione: "attendi", importo: 0, motivo: "Storico prezzi insufficiente." };
  }
  const ultimo = chiusure.at(-1) ?? 0;
  const sma10 = media(chiusure.slice(-10));
  const sma20 = media(chiusure.slice(-20));
  const scostamento = ((ultimo - sma10) / sma10) * 100;
  const posseduto = posizione?.valore ?? 0;
  const mancante = Math.max(0, quotaTarget - posseduto);
  const pnl = posizione?.pnlPct ?? 0;

  if (strategia === "conservativo") {
    if (pnl <= -10)
      return { azione: "vendi", importo: posseduto, motivo: `Stop di protezione a ${pnl.toFixed(1)}%.` };
    if (mancante > quotaTarget * 0.2)
      return {
        azione: "compra",
        importo: mancante,
        motivo: `Accumulo graduale verso la quota target (prezzo ${scostamento.toFixed(1)}% dalla media 10g).`,
      };
    return { azione: "attendi", importo: 0, motivo: "Posizione già alla quota prevista." };
  }

  if (strategia === "medio") {
    if (ultimo > sma20 && mancante > quotaTarget * 0.2)
      return {
        azione: "compra",
        importo: mancante,
        motivo: "Trend positivo: prezzo sopra la media a 20 giorni.",
      };
    if (ultimo < sma20 * 0.97 && posseduto > 0)
      return {
        azione: "vendi",
        importo: posseduto,
        motivo: "Rottura al ribasso della media a 20 giorni.",
      };
    if (pnl <= -8 && posseduto > 0)
      return { azione: "vendi", importo: posseduto, motivo: `Stop di rischio a ${pnl.toFixed(1)}%.` };
    return { azione: "attendi", importo: 0, motivo: "Nessun segnale netto sul trend." };
  }

  // aggressivo: compra sui ribassi, vende sui rimbalzi
  if (posseduto > 0 && pnl >= 5)
    return {
      azione: "vendi",
      importo: posseduto,
      motivo: `Presa di profitto a +${pnl.toFixed(1)}% prima del rientro.`,
    };
  if (posseduto > 0 && pnl <= -7)
    return { azione: "vendi", importo: posseduto, motivo: `Taglio perdita a ${pnl.toFixed(1)}%.` };
  if (scostamento <= -2 && mancante > quotaTarget * 0.2)
    return {
      azione: "compra",
      importo: mancante,
      motivo: `Ribasso del ${scostamento.toFixed(1)}% sotto la media 10g: entrata sul calo.`,
    };
  return { azione: "attendi", importo: 0, motivo: "Prezzo non ancora abbastanza sceso." };
}

export async function leggiOrdini(
  userId: string,
  reale: boolean,
  limite = 25,
): Promise<OrdineBroker[]> {
  const cred = await credenzialiUtente(userId, reale);
  if (!cred) return [];
  try {
    const res = await fetch(
      `${base(reale)}/v2/orders?status=all&limit=${limite}&direction=desc`,
      { headers: cred.headers },
    );
    if (!res.ok) return [];
    const righe = (await res.json()) as Record<string, unknown>[];
    return righe.map((o) => ({
      id: String(o["id"] ?? ""),
      ticker: String(o["symbol"] ?? ""),
      lato: o["side"] === "sell" ? "sell" : "buy",
      quantita: num(o["filled_qty"]),
      importo: o["notional"] ? num(o["notional"]) : null,
      stato: String(o["status"] ?? ""),
      tipo: String(o["type"] ?? ""),
      prezzoMedio: o["filled_avg_price"] ? num(o["filled_avg_price"]) : null,
      creatoIl: String(o["created_at"] ?? ""),
    }));
  } catch (error) {
    logServer("trading.leggiOrdini", error, { reale });
    return [];
  }
}

export async function eseguiCiclo(
  userId: string,
  input: Parameters<typeof eseguiCicloInterno>[1],
): Promise<EsitoCiclo> {
  const { conLeaseConto, riconciliaAlpacaPersistente } = await import("./riconciliazione.server");
  const p = input.piattaforma || "alpaca";
  const result = await conLeaseConto(userId, p, input.reale ? "reale" : "paper", async (lease) => {
    // Nessun invio senza registro disponibile; la riconciliazione non invia ordini.
    if (p !== "alpaca") return {ok:false,messaggio:"Operazioni bloccate: questo broker non espone ancora esecuzioni, identità e capitale pendente verificabili.",mercatoAperto:false,decisioni:[],eseguiti:0};
    const snapshot = await riconciliaAlpacaPersistente(userId, input.reale, lease);
    if (snapshot.stato !== "riconciliato") return {ok:false,messaggio:`Nessun ordine inviato: ${snapshot.motivo}`,mercatoAperto:false,decisioni:[],eseguiti:0};
    const esito = await eseguiCicloInterno(userId, input, lease);
    if (p === "alpaca") {
      try { await riconciliaAlpacaPersistente(userId, input.reale, lease); }
      catch { esito.messaggio += " Riconciliazione incompleta: rendimento non definitivo."; }
    }
    return esito;
  });
  return result ?? { ok: false, messaggio: "Un altro ciclo o una riconciliazione è già in corso.", mercatoAperto: false, decisioni: [], eseguiti: 0 };
}

async function eseguiCicloInterno(
  userId: string,
  input: {
    reale: boolean;
    strategia: StrategyId;
    capitale: number;
    universo: string[];
    modalita?: "limite" | "conto";
    perditaMax?: number | null;
    piattaforma?: string | null;
  },
  lease: LeaseConto,
): Promise<EsitoCiclo> {
  if (input.piattaforma && input.piattaforma !== "alpaca") {
    const { eseguiCicloEsterno } = await import("./piattaforme.server");
    const { isPiattaforma } = await import("./piattaforme.types");
    if (isPiattaforma(input.piattaforma) && input.piattaforma !== "alpaca")
      return eseguiCicloEsterno(userId, input.piattaforma, input, decide);
  }
  const { reale } = input;
  let capitale = input.capitale;
  const strategia = getStrategia(input.strategia);
  const cred = await credenzialiUtente(userId, reale);
  if (!cred || !cred.proprie) {
    return {
      ok: false,
      messaggio: cred
        ? "Collega le tue chiavi API personali per far operare l'IA su questo conto."
        : "Nessun broker collegato: inserisci le chiavi API.",
      mercatoAperto: false,
      decisioni: [],
      eseguiti: 0,
    };
  }

  const headers = cred.headers;
  const url = base(reale);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: fondi, error: erroreFondi } = await supabaseAdmin.from("automazioni_conti").select("liquidita_limite, acquisto_limite, limiti_conto_id, perdita_max_giornaliera").eq("user_id", userId).eq("piattaforma", "alpaca").eq("ambiente", reale ? "reale" : "paper").maybeSingle();
  if (erroreFondi) throw new Error("Limiti utilizzabili non verificabili: ciclo non eseguito.");

  // L'IA sceglie da sola su cosa investire analizzando il mercato.
  const { selezionaUniverso } = await import("./selezione.server");
  const auto = await selezionaUniverso(headers, reale, input.strategia);
  const universo = (auto.universo.length ? auto.universo : strategia.universo)
    .map((t) => t.toUpperCase().trim())
    .filter(Boolean)
    .slice(0, 200);
  const selezione = auto.motivo;

  // Modalità "conto": l'IA usa tutto il capitale del conto Alpaca.
  let liquidita = 0;
  let perditaOggi: number | null = null;
  let contoId: string | null = null; // solo per registrare a quale conto appartiene l'ordine
  let contoOk = false;
  try {
    const acc = await fetch(`${url}/v2/account`, { headers });
    if (acc.ok) {
      const a = (await acc.json()) as Record<string, unknown>;
      contoOk = Boolean(a["id"]) && a["cash"] != null && a["equity"] != null && a["buying_power"] != null
        && [a["cash"], a["equity"], a["buying_power"]].every((v) => Number.isFinite(Number(v)))
        && a["trading_blocked"] !== true && a["account_blocked"] !== true;
      if (a["id"]) contoId = `alpaca:${String(a["id"])}`;
      const { fondiUtilizzabili } = await import("./fondi");
      liquidita = fondiUtilizzabili(num(a["cash"]), num(a["buying_power"]), fondi?.liquidita_limite == null ? null : Number(fondi.liquidita_limite), fondi?.acquisto_limite == null ? null : Number(fondi.acquisto_limite));
      if (fondi?.limiti_conto_id && fondi.limiti_conto_id !== contoId) { contoOk = false; liquidita = 0; }
      if (input.modalita === "conto") capitale = num(a["portfolio_value"] ?? a["equity"]);
      // Perdita della giornata: valore a chiusura di ieri meno valore attuale.
      if (a["last_equity"] != null && a["equity"] != null && Number.isFinite(Number(a["last_equity"])) && Number.isFinite(Number(a["equity"]))) {
        perditaOggi = num(a["last_equity"]) - num(a["equity"]);
      }
    }
  } catch (error) {
    logServer("trading.account", error, { reale });
  }

  // Limite di perdita giornaliera: se raggiunto, l'IA si ferma prima di operare.
  const limite = fondi?.perdita_max_giornaliera == null ? null : Number(fondi.perdita_max_giornaliera);
  if (limite != null && (!Number.isFinite(limite) || limite < 0)) throw new Error("Limite giornaliero incoerente: nessun ordine.");
  if (limite && limite > 0 && perditaOggi != null && perditaOggi >= limite) {
    return {
      ok: false,
      messaggio: `Trading sospeso: perdita di oggi ${perditaOggi.toFixed(2)} $ ha raggiunto il limite giornaliero di ${limite.toFixed(2)} $.`,
      mercatoAperto: false,
      decisioni: [],
      eseguiti: 0,
      bloccoPerdita: { perdita: Math.round(perditaOggi * 100) / 100, limite },
    };
  }

  if (!universo.length || capitale <= 0) {
    return {
      ok: false,
      messaggio: "Imposta il capitale prima di avviare il motore.",
      mercatoAperto: false,
      decisioni: [],
      eseguiti: 0,
    };
  }


  try {
    const ultimiGiorni: Record<string, string> = {};
    const [clockRes, posRes, storico, apertiRes] = await Promise.all([
      fetch(`${url}/v2/clock`, { headers }),
      fetch(`${url}/v2/positions`, { headers }),
      serieStorica(universo, headers, ultimiGiorni),
      fetch(`${url}/v2/orders?status=open&limit=500`, { headers }).catch(() => null),
    ]);
    // Ordini ancora aperti presso il broker: niente nuovi ordini sullo stesso titolo (anti-duplicati).
    const { motivoBloccoAcquisti, problemaDati, problemaAccumulo, simboliAperti } = await import("./protezioni");
    let aperti = new Set<string>();
    const apertiRaw = apertiRes?.ok ? await apertiRes.json() as Record<string,unknown>[] : null;
    const impegno = apertiRaw ? capitalePendenti(apertiRaw) : null;
    const ordiniApertiOk = Array.isArray(apertiRaw) && apertiRaw.length < 500 && impegno != null;
    if (apertiRaw) aperti = simboliAperti(apertiRaw);
    const bloccoAcquisti = motivoBloccoAcquisti({
      contoOk,
      posizioniOk: posRes.ok,
      ordiniApertiOk,
      limitePerdita: limite,
      perditaOggi,
    });
    if (bloccoAcquisti) logServer("trading.protezione", new Error(bloccoAcquisti), { reale });

    const mercatoAperto = clockRes.ok
      ? Boolean(((await clockRes.json()) as { is_open?: boolean }).is_open)
      : false;

    const posizioni = new Map<string, Posizione>();
    if (posRes.ok) {
      for (const p of (await posRes.json()) as Record<string, unknown>[]) {
        const t = String(p["symbol"] ?? "").replace("/", "");
        posizioni.set(t, {
          ticker: t,
          valore: Math.abs(num(p["market_value"])),
          pnlPct: num(p["unrealized_plpc"]) * 100,
        });
      }
    }

    // Le posizioni già aperte vengono sempre rianalizzate (per poterle vendere).
    for (const t of posizioni.keys()) if (!universo.includes(t)) universo.push(t);
    const mancanti = universo.filter((t) => !storico[t]);
    if (mancanti.length) Object.assign(storico, await serieStorica(mancanti, headers, ultimiGiorni));

    // Tetto rigido: il totale investito non supera mai il capitale scelto dall'utente.
    const investito = [...posizioni.values()].reduce((a, p) => a + p.valore, 0);
    let residuo = Math.max(0, Math.min(capitale - investito - (impegno ?? capitale), liquidita));
    const quota = capitale / Math.max(1, auto.universo.length || universo.length);
    const decisioni: DecisioneIA[] = [];
    const { leggiLezioni, applicaLezioni } = await import("./apprendimento");
    const lezioni = await leggiLezioni(userId, "alpaca", reale ? "reale" : "paper", input.strategia, contoId);

    for (const ticker of universo) {
      const chiusure = storico[ticker] ?? storico[ticker.replace("/", "")] ?? [];
      const scelta = applicaLezioni(
        decide(input.strategia, ticker, chiusure, posizioni.get(ticker), quota),
        input.strategia,
        ticker,
        posizioni.get(ticker),
        lezioni,
      );
      const chiave = ticker.replace("/", "").toUpperCase();
      if (scelta.azione !== "attendi" && (!ordiniApertiOk || aperti.has(chiave))) {
        scelta.azione = "attendi";
        scelta.importo = 0;
        scelta.motivo = "Ordine già in corso presso il broker: nessun nuovo ordine su questo titolo.";
      }
      if (scelta.azione === "compra") {
        const problema = bloccoAcquisti ?? problemaDati(chiusure, ultimiGiorni[ticker] ?? ultimiGiorni[ticker.replace("/", "")])
          ?? problemaAccumulo(input.strategia, posizioni.get(ticker), chiusure);
        if (problema) {
          scelta.azione = "attendi";
          scelta.importo = 0;
          scelta.motivo = problema;
          logServer("trading.protezione.dati", new Error(problema), { ticker, reale });
        }
      }
      if (scelta.azione === "compra") {
        // Negoziabilità verificata presso il broker prima di ogni acquisto.
        const sym = isCripto(ticker) ? paioCripto(ticker) : ticker;
        const asset = await fetch(`${url}/v2/assets/${encodeURIComponent(sym)}`, { headers })
          .then(async (r) => (r.ok ? ((await r.json()) as Record<string, unknown>) : null))
          .catch(() => null);
        const motivoAsset = !asset
          ? "Negoziabilità non verificabile: acquisto saltato."
          : asset["tradable"] !== true || asset["status"] !== "active"
            ? "Strumento non negoziabile presso il broker: acquisto saltato."
            : !isCripto(ticker) && asset["fractionable"] !== true
              ? "Strumento non frazionabile: ordine in importo non consentito, acquisto saltato."
              : null;
        if (motivoAsset) {
          scelta.azione = "attendi";
          scelta.importo = 0;
          scelta.motivo = motivoAsset;
          logServer("trading.protezione.asset", new Error(motivoAsset), { ticker, reale });
        }
      }
      if (scelta.azione === "compra") {
        const { data: attuali, error: errore } = await supabaseAdmin.from("automazioni_conti").select("liquidita_limite, acquisto_limite, limiti_conto_id, perdita_max_giornaliera").eq("user_id", userId).eq("piattaforma", "alpaca").eq("ambiente", reale ? "reale" : "paper").maybeSingle();
        if (errore || (attuali?.limiti_conto_id && attuali.limiti_conto_id !== contoId)) throw new Error("Limiti del conto non verificabili: nessun nuovo acquisto.");
        // Il residuo del ciclo scende soltanto; le riduzioni salvate durante l'analisi valgono subito.
        residuo = Math.min(residuo, attuali?.liquidita_limite == null ? Infinity : Number(attuali.liquidita_limite), attuali?.acquisto_limite == null ? Infinity : Number(attuali.acquisto_limite));
        // Arrotonda per difetto: l'arrotondamento al centesimo non supera la liquidità residua.
        scelta.importo = Math.floor(Math.min(scelta.importo, residuo) * 100) / 100;
        if (scelta.importo < 1) {
          scelta.azione = "attendi";
          scelta.motivo = `Capitale impostato (${capitale} $) già interamente investito.`;
        }
      }
      const decisione: DecisioneIA = {
        ticker,
        azione: scelta.azione,
        importo: Math.round(scelta.importo * 100) / 100,
        motivo: scelta.motivo,
        eseguito: false,
      };

      // Rivalida conto/posizioni/pendenti immediatamente prima dell'invio, non dopo una lunga analisi.
      if (scelta.azione !== "attendi") {
        const [ar,pr,orr] = await Promise.all([fetch(`${url}/v2/account`,{headers,signal:AbortSignal.timeout(15000)}),fetch(`${url}/v2/positions`,{headers,signal:AbortSignal.timeout(15000)}),fetch(`${url}/v2/orders?status=open&limit=500`,{headers,signal:AbortSignal.timeout(15000)})]);
        if (!ar.ok || !pr.ok || !orr.ok) throw new Error("Verifica pre-invio incompleta: nessun nuovo ordine.");
        const a=await ar.json() as Record<string,unknown>, positions=await pr.json() as Record<string,unknown>[], pending=await orr.json() as Record<string,unknown>[];
        const committed=capitalePendenti(pending);
        if (`alpaca:${a["id"]}`!==contoId || a["trading_blocked"]===true || a["account_blocked"]===true || a["currency"]!=="USD" || ![a["cash"],a["equity"],a["buying_power"],a["last_equity"]].every(v=>v!=null && v!=="" && Number.isFinite(Number(v))) || positions.some(p=>![p["market_value"],p["qty"]].every(v=>v!=null && Number.isFinite(Number(v)))) || committed==null || pending.length>=500 || simboliAperti(pending).has(chiave)) throw new Error("Conto o ordini incoerenti nella verifica pre-invio: operazione bloccata.");
        if (limite && Number(a["last_equity"])-Number(a["equity"])>=limite) return {ok:false,messaggio:"Trading sospeso: raggiunto il limite giornaliero durante l’analisi.",mercatoAperto,decisioni,eseguiti:decisioni.filter(d=>d.eseguito).length,bloccoPerdita:{perdita:Number(a["last_equity"])-Number(a["equity"]),limite}};
        if (scelta.azione === "compra") {
          const presente = positions.find(p => String(p["symbol"] ?? "").replace("/", "").toUpperCase() === chiave);
          const bloccoAccumulo = problemaAccumulo(input.strategia, presente ? { valore: Math.abs(Number(presente["market_value"])), pnlPct: presente["unrealized_plpc"] == null ? NaN : Number(presente["unrealized_plpc"]) * 100 } : undefined, chiusure);
          if (bloccoAccumulo) { decisione.azione="attendi";decisione.importo=0;decisione.motivo=bloccoAccumulo;decisioni.push(decisione);continue; }
          const budget=input.modalita==="conto" ? Number(a["equity"]) : capitale;
          const esposto=positions.reduce((sum,p)=>sum+Math.abs(Number(p["market_value"])),0);
          decisione.importo=Math.floor(Math.max(0,Math.min(decisione.importo,residuo,budget-esposto-committed,Number(a["cash"]),Number(a["buying_power"]))) *100)/100;
          if (decisione.importo<1) { decisione.azione="attendi";decisione.motivo="Capitale impegnato o fondi insufficienti nella verifica pre-invio.";decisioni.push(decisione);continue; }
        }
      }
      const { registraIntento, aggiornaRicevuta, verificaLease } = await import("./riconciliazione.server");
      const invio = scelta.azione !== "attendi" && contoId
        ? await registraIntento({ userId, piattaforma: "alpaca", ambiente: reale ? "reale" : "paper", contoId, ticker, lato: scelta.azione === "vendi" ? "sell" : "buy", strategia: input.strategia, importo: decisione.importo }, lease) : null;
      if (scelta.azione !== "attendi" && !invio) {
        decisione.azione = "attendi";
        decisione.motivo = "Identità o registro non disponibili: nessun ordine inviato.";
        decisioni.push(decisione);
        continue;
      }
      if (scelta.azione === "vendi" && posizioni.has(ticker)) {
        // Vendita esplicita con lo stesso client ID persistito: recuperabile anche dopo timeout.
        const sym = isCripto(ticker) ? paioCripto(ticker) : ticker;
        const position = await fetch(`${url}/v2/positions/${encodeURIComponent(sym)}`, {headers,signal:AbortSignal.timeout(15000)});
        const actual = position.ok ? await position.json() as Record<string,unknown> : null;
        const quantity = Number(actual?.["qty"]);
        if (!Number.isFinite(quantity) || quantity<=0) { if (invio) await aggiornaRicevuta(invio.id,null,"non_inviato"); throw new Error("Quantità da vendere non verificabile."); }
        await verificaLease(lease);
        const res = await fetch(`${url}/v2/orders`, {method:"POST",headers:{...headers,"content-type":"application/json"},signal:AbortSignal.timeout(15000),body:JSON.stringify({symbol:sym,side:"sell",type:"market",qty:String(actual?.["qty"]),time_in_force:isCripto(ticker)?"gtc":"day",client_order_id:invio?.clientId})});
        if (res.ok) {
          decisione.eseguito = true;
          if (invio) await aggiornaRicevuta(invio.id, await res.json(), "accettato");
        }
        else {
          if (invio) await aggiornaRicevuta(invio.id, null, [400,401,403,422].includes(res.status) ? "rifiutato_http" : "esito_incerto");
          const testo = await res.text();
          decisione.errore = testo.slice(0, 180);
          logServer("trading.chiusura", new Error(testo), { ticker, reale });
        }
      } else if (scelta.azione === "compra" && decisione.importo >= 1) {
        residuo -= decisione.importo;
        const cripto = isCripto(ticker);
        await verificaLease(lease);
        const res = await fetch(`${url}/v2/orders`, {
          signal: AbortSignal.timeout(15000),
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({
            symbol: cripto ? paioCripto(ticker) : ticker,
            side: "buy",
            type: "market",
            time_in_force: cripto ? "gtc" : "day",
            notional: decisione.importo,
            client_order_id: invio?.clientId,
          }),
        });
        if (res.ok) {
          decisione.eseguito = true;
          if (invio) await aggiornaRicevuta(invio.id, await res.json(), "accettato");
        }
        else {
          if (invio) await aggiornaRicevuta(invio.id, null, [400,401,403,422].includes(res.status) ? "rifiutato_http" : "esito_incerto");
          const testo = await res.text();
          decisione.errore = testo.slice(0, 180);
          logServer("trading.ordine", new Error(testo), { ticker, reale });
        }
      } else if (scelta.azione !== "attendi") {
        decisione.azione = "attendi";
        decisione.motivo = "Importo troppo piccolo per un ordine.";
      }


      decisioni.push(decisione);
    }

    const eseguiti = decisioni.filter((d) => d.eseguito).length;

    // Registro per strategia (statistiche, report): non blocca il ciclo se fallisce.
    if (eseguiti) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("ordini_ia").insert(
          decisioni
            .filter((d) => d.eseguito)
            .map((d) => ({
              user_id: userId,
              strategia: input.strategia,
              ambiente: reale ? "reale" : "paper",
              piattaforma: "alpaca",
              ticker: d.ticker,
              lato: d.azione === "vendi" ? "sell" : "buy",
              importo: d.importo,
              pnl_pct: d.azione === "vendi" ? (posizioni.get(d.ticker)?.pnlPct ?? null) : null,
              motivo: d.motivo,
              conto_id: contoId,
              conto_attribuzione: contoId ? "motore" : null,
            })),
        );
      } catch (error) {
        logServer("trading.registro", error, { reale });
      }
    }
    return {
      ok: true,
      mercatoAperto,
      decisioni,
      eseguiti,
      universo,
      selezione: `${selezione} ${lezioni.riepilogo}`,
      messaggio: eseguiti
        ? `${eseguiti} ordini inviati al conto ${reale ? "reale" : "paper"}${
            mercatoAperto ? "." : " (mercato chiuso: verranno eseguiti all'apertura)."
          }`
        : "Nessun segnale operativo in questo ciclo: l'IA resta in attesa.",
    };

  } catch (error) {
    logServer("trading.eseguiCiclo", error, { reale });
    return {
      ok: false,
      messaggio: error instanceof Error ? `${error.message} Gli invii con esito incerto restano bloccati fino alla riconciliazione; nessun tentativo automatico di reinvio.` : "Verifica non riuscita: nessun reinvio automatico.",
      mercatoAperto: false,
      decisioni: [],
      eseguiti: 0,
    };
  }
}
