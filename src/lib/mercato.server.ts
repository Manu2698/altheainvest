import { credenzialiUtente, logServer } from "./alpaca.server";
import type { Quotazione, SegnaleStrumento } from "./mercato.types";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const isCripto = (t: string) => t.includes("/") || /^[A-Z]{2,6}USD$/.test(t);
export const paioCripto = (t: string) => (t.includes("/") ? t : t.replace(/USD$/, "/USD"));

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

function rsi(chiusure: number[], periodo = 14) {
  if (chiusure.length < periodo + 1) return 50;
  let su = 0;
  let giu = 0;
  for (let i = chiusure.length - periodo; i < chiusure.length; i++) {
    const d = chiusure[i]! - chiusure[i - 1]!;
    if (d >= 0) su += d;
    else giu -= d;
  }
  if (giu === 0) return 100;
  const rs = su / periodo / (giu / periodo);
  return 100 - 100 / (1 + rs);
}

/** Prezzi e volumi correnti per una lista di strumenti. */
export async function quotazioni(
  userId: string,
  reale: boolean,
  tickers: string[],
): Promise<Quotazione[]> {
  const cred = await credenzialiUtente(userId, reale);
  if (!cred || !tickers.length) return [];
  const headers = cred.headers;
  const azioni = tickers.filter((t) => !isCripto(t));
  const cripto = tickers.filter(isCripto);
  const out: Quotazione[] = [];
  const adesso = new Date().toISOString();

  const aggiungi = (
    sym: string,
    snap: { latestTrade?: { p?: number; t?: string }; dailyBar?: { c?: number; v?: number }; prevDailyBar?: { c?: number } },
  ) => {
    const prezzo = num(snap.latestTrade?.p) || num(snap.dailyBar?.c);
    const prec = num(snap.prevDailyBar?.c) || prezzo;
    out.push({
      ticker: sym.replace("/", ""),
      prezzo,
      variazionePct: prec ? ((prezzo - prec) / prec) * 100 : 0,
      volume: num(snap.dailyBar?.v),
      aggiornatoIl: snap.latestTrade?.t ?? adesso,
    });
  };

  const richieste: Promise<void>[] = [];

  if (azioni.length) {
    const url = `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(
      azioni.join(","),
    )}&feed=iex`;
    richieste.push(
      fetch(url, { headers })
        .then(async (r) => {
          if (!r.ok) {
            logServer("mercato.quotazioni.azioni", new Error(`HTTP ${r.status}`));
            return;
          }
          const j = (await r.json()) as Record<string, never>;
          for (const [sym, snap] of Object.entries(j)) aggiungi(sym, snap);
        })
        .catch((e) => logServer("mercato.quotazioni.azioni", e)),
    );
  }

  if (cripto.length) {
    const url = `https://data.alpaca.markets/v1beta3/crypto/us/snapshots?symbols=${encodeURIComponent(
      cripto.map(paioCripto).join(","),
    )}`;
    richieste.push(
      fetch(url, { headers })
        .then(async (r) => {
          if (!r.ok) {
            logServer("mercato.quotazioni.cripto", new Error(`HTTP ${r.status}`));
            return;
          }
          const j = (await r.json()) as { snapshots?: Record<string, never> };
          for (const [sym, snap] of Object.entries(j.snapshots ?? {})) aggiungi(sym, snap);
        })
        .catch((e) => logServer("mercato.quotazioni.cripto", e)),
    );
  }

  await Promise.all(richieste);
  return out;
}

/** Indicatori tecnici usati dal motore prima di investire. */
export async function segnali(
  userId: string,
  reale: boolean,
  tickers: string[],
): Promise<SegnaleStrumento[]> {
  const cred = await credenzialiUtente(userId, reale);
  if (!cred || !tickers.length) return [];
  const { serieStorica } = await import("./trading.server");
  const storico = await serieStorica(tickers, cred.headers);

  return tickers.map((ticker) => {
    const serie = storico[ticker] ?? storico[ticker.replace("/", "")] ?? [];
    const prezzo = serie.length ? serie[serie.length - 1]! : 0;
    const sma10 = media(serie.slice(-10));
    const sma20 = media(serie.slice(-20));
    const r = rsi(serie);
    const rendimenti = serie
      .slice(-21)
      .map((v, i, a) => (i === 0 || !a[i - 1] ? 0 : (v / a[i - 1]! - 1) * 100));
    const m = media(rendimenti);
    const volatilita = Math.sqrt(media(rendimenti.map((x) => (x - m) ** 2)));
    const scostamento = sma10 ? ((prezzo - sma10) / sma10) * 100 : 0;
    const tendenza: SegnaleStrumento["tendenza"] =
      sma20 && prezzo > sma20 * 1.005 ? "rialzo" : sma20 && prezzo < sma20 * 0.995 ? "ribasso" : "laterale";
    const giudizio: SegnaleStrumento["giudizio"] =
      serie.length < 6
        ? "attendi"
        : r < 35 || (tendenza === "rialzo" && scostamento > -1)
          ? "compra"
          : r > 70 || tendenza === "ribasso"
            ? "vendi"
            : "attendi";

    return {
      ticker,
      prezzo,
      sma10,
      sma20,
      rsi14: r,
      volatilitaPct: volatilita,
      scostamentoPct: scostamento,
      tendenza,
      giudizio,
      serie: serie.slice(-60),
    };
  });
}
