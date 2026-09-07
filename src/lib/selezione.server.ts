import { logServer } from "./alpaca.server";
import { serieStorica } from "./trading.server";
import type { StrategyId } from "./strategies";

type Headers = Record<string, string>;

type Candidato = {
  ticker: string;
  prezzo: number;
  sma10: number;
  sma20: number;
  momentum: number;
  volatilita: number;
};

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

/** Titoli più scambiati del giorno + principali cripto: il pool da cui l'IA sceglie. */
async function candidati(headers: Headers, reale: boolean): Promise<string[]> {
  const out: string[] = [];

  try {
    const res = await fetch(
      "https://data.alpaca.markets/v1beta1/screener/stocks/most-actives?by=volume&top=60",
      { headers },
    );
    if (res.ok) {
      const j = (await res.json()) as { most_actives?: { symbol?: string }[] };
      for (const r of j.most_actives ?? []) {
        const s = String(r.symbol ?? "").toUpperCase();
        if (s && /^[A-Z.]{1,6}$/.test(s)) out.push(s);
      }
    } else {
      logServer("selezione.mostActives", new Error(`HTTP ${res.status}`));
    }
  } catch (error) {
    logServer("selezione.mostActives", error);
  }

  try {
    const base = reale ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";
    const res = await fetch(`${base}/v2/assets?status=active&asset_class=crypto`, { headers });
    if (res.ok) {
      const righe = (await res.json()) as Record<string, unknown>[];
      const cripto = righe
        .map((a) => String(a["symbol"] ?? "").toUpperCase())
        .filter((s) => s.endsWith("/USD"))
        .slice(0, 20)
        .map((s) => s.replace("/", ""));
      out.push(...cripto);
    }
  } catch (error) {
    logServer("selezione.cripto", error);
  }

  // Riferimenti sempre validi anche se lo screener non risponde.
  out.push("SPY", "VOO", "QQQ", "GLD", "AAPL", "MSFT", "NVDA");

  return Array.from(new Set(out)).slice(0, 70);
}

function misura(ticker: string, chiusure: number[]): Candidato | null {
  if (chiusure.length < 25) return null;
  const prezzo = chiusure[chiusure.length - 1]!;
  if (!prezzo) return null;
  const sma10 = media(chiusure.slice(-10));
  const sma20 = media(chiusure.slice(-20));
  const rend: number[] = [];
  const finestra = chiusure.slice(-21);
  for (let i = 1; i < finestra.length; i++) {
    const prec = finestra[i - 1]!;
    if (prec) rend.push((finestra[i]! - prec) / prec);
  }
  const m = media(rend);
  const varianza = media(rend.map((r) => (r - m) ** 2));
  return {
    ticker,
    prezzo,
    sma10,
    sma20,
    momentum: sma20 ? ((prezzo - sma20) / sma20) * 100 : 0,
    volatilita: Math.sqrt(varianza) * 100,
  };
}

/**
 * L'IA analizza l'intero pool investibile e sceglie da sola gli strumenti,
 * con criteri diversi per ogni corrente di pensiero.
 */
export async function selezionaUniverso(
  headers: Headers,
  reale: boolean,
  strategia: StrategyId,
): Promise<{ universo: string[]; motivo: string }> {
  const pool = await candidati(headers, reale);
  if (!pool.length) return { universo: [], motivo: "Nessuno strumento disponibile dal broker." };

  const storico = await serieStorica(pool, headers);
  const misure = pool
    .map((t) => misura(t, storico[t] ?? storico[t.replace("/", "")] ?? []))
    .filter((c): c is Candidato => Boolean(c));

  if (!misure.length) {
    return { universo: [], motivo: "Dati di mercato non disponibili per la selezione." };
  }

  let scelti: Candidato[];
  let motivo: string;

  if (strategia === "conservativo") {
    scelti = misure
      .filter((c) => c.momentum > -1 && c.prezzo > c.sma20 * 0.97)
      .sort((a, b) => a.volatilita - b.volatilita)
      .slice(0, 8);
    motivo = "titoli più stabili e non in discesa";
  } else if (strategia === "medio") {
    scelti = misure
      .filter((c) => c.prezzo > c.sma20 && c.sma10 >= c.sma20)
      .sort((a, b) => b.momentum / (1 + b.volatilita) - a.momentum / (1 + a.volatilita))
      .slice(0, 10);
    motivo = "trend positivi con volatilità contenuta";
  } else {
    scelti = misure
      .filter((c) => c.volatilita > 1)
      .sort((a, b) => Math.abs(b.momentum) - Math.abs(a.momentum))
      .slice(0, 12);
    motivo = "strumenti con i movimenti più ampi";
  }

  if (!scelti.length) {
    scelti = [...misure].sort((a, b) => b.momentum - a.momentum).slice(0, 6);
    motivo = "migliori andamenti disponibili";
  }

  return {
    universo: scelti.map((c) => c.ticker),
    motivo: `Selezione automatica su ${misure.length} strumenti analizzati: ${motivo}.`,
  };
}
