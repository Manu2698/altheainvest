import { credenzialiUtente, logServer } from "./alpaca.server";
import { getStrategia, type StrategyId } from "./strategies";
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
async function serieStorica(
  tickers: string[],
  headers: Record<string, string>,
): Promise<Record<string, number[]>> {
  const azioni = tickers.filter((t) => !isCripto(t));
  const cripto = tickers.filter(isCripto);
  const out: Record<string, number[]> = {};

  const raccogli = (payload: unknown, mappa: (s: string) => string) => {
    const bars = (payload as { bars?: Record<string, { c: number }[]> })?.bars ?? {};
    for (const [sym, righe] of Object.entries(bars)) {
      out[mappa(sym)] = righe.map((r) => num(r.c));
    }
  };

  const richieste: Promise<void>[] = [];

  if (azioni.length) {
    const url = `https://data.alpaca.markets/v2/stocks/bars?symbols=${encodeURIComponent(
      azioni.join(","),
    )}&timeframe=1Day&limit=40&feed=iex&adjustment=raw`;
    richieste.push(
      fetch(url, { headers })
        .then(async (r) => (r.ok ? raccogli(await r.json(), (s) => s) : undefined))
        .catch((e) => logServer("trading.serieStorica.azioni", e)),
    );
  }

  if (cripto.length) {
    const url = `https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=${encodeURIComponent(
      cripto.map(paioCripto).join(","),
    )}&timeframe=1Day&limit=40`;
    richieste.push(
      fetch(url, { headers })
        .then(async (r) =>
          r.ok ? raccogli(await r.json(), (s) => s.replace("/", "")) : undefined,
        )
        .catch((e) => logServer("trading.serieStorica.cripto", e)),
    );
  }

  await Promise.all(richieste);
  return out;
}

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

type Posizione = { ticker: string; valore: number; pnlPct: number };

function decide(
  strategia: StrategyId,
  ticker: string,
  chiusure: number[],
  posizione: Posizione | undefined,
  quotaTarget: number,
): { azione: "compra" | "vendi" | "attendi"; importo: number; motivo: string } {
  if (chiusure.length < 6) {
    return { azione: "attendi", importo: 0, motivo: "Storico prezzi insufficiente." };
  }
  const ultimo = chiusure[chiusure.length - 1]!;
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
      quantita: num(o["filled_qty"] || o["qty"]),
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
  input: { reale: boolean; strategia: StrategyId; capitale: number; universo: string[] },
): Promise<EsitoCiclo> {
  const { reale, capitale } = input;
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
  const universo = (input.universo.length ? input.universo : strategia.universo)
    .map((t) => t.toUpperCase().trim())
    .filter(Boolean)
    .slice(0, 12);

  if (!universo.length || capitale <= 0) {
    return {
      ok: false,
      messaggio: "Imposta capitale e universo investibile prima di avviare il motore.",
      mercatoAperto: false,
      decisioni: [],
      eseguiti: 0,
    };
  }

  try {
    const [clockRes, posRes, storico] = await Promise.all([
      fetch(`${url}/v2/clock`, { headers }),
      fetch(`${url}/v2/positions`, { headers }),
      serieStorica(universo, headers),
    ]);

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

    const quota = capitale / universo.length;
    const decisioni: DecisioneIA[] = [];

    for (const ticker of universo) {
      const chiusure = storico[ticker] ?? storico[ticker.replace("/", "")] ?? [];
      const scelta = decide(input.strategia, ticker, chiusure, posizioni.get(ticker), quota);
      const decisione: DecisioneIA = {
        ticker,
        azione: scelta.azione,
        importo: Math.round(scelta.importo * 100) / 100,
        motivo: scelta.motivo,
        eseguito: false,
      };

      if (scelta.azione !== "attendi" && decisione.importo >= 5) {
        const cripto = isCripto(ticker);
        const body: Record<string, unknown> = {
          symbol: cripto ? paioCripto(ticker) : ticker,
          side: scelta.azione === "compra" ? "buy" : "sell",
          type: "market",
          time_in_force: cripto ? "gtc" : "day",
        };
        if (scelta.azione === "vendi" && posizioni.get(ticker)) {
          body["notional"] = undefined;
          delete body["notional"];
          body["qty"] = undefined;
          delete body["qty"];
          body["notional"] = decisione.importo;
        } else {
          body["notional"] = decisione.importo;
        }

        const res = await fetch(`${url}/v2/orders`, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          decisione.eseguito = true;
        } else {
          const testo = await res.text();
          decisione.errore = testo.slice(0, 180);
          logServer("trading.ordine", new Error(testo), { ticker, reale });
        }
      }

      decisioni.push(decisione);
    }

    const eseguiti = decisioni.filter((d) => d.eseguito).length;
    return {
      ok: true,
      mercatoAperto,
      decisioni,
      eseguiti,
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
      messaggio: "Non riesco a raggiungere il broker in questo momento.",
      mercatoAperto: false,
      decisioni: [],
      eseguiti: 0,
    };
  }
}
