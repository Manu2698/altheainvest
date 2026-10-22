import { credenzialiUtente, logServer } from "./alpaca.server";
import { serieStorica } from "./trading.server";
import type { StrategyId } from "./strategies";
import type {
  EsitoSimulazione,
  PosizioneSimulata,
  RiepilogoStrategia,
  SettimanaStrategia,
  StatisticheStrategie,
} from "./report.types";

const IDS: StrategyId[] = ["conservativo", "medio", "aggressivo"];

const lunedi = (d: Date) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const g = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - g);
  return x.toISOString().slice(0, 10);
};

type Riga = {
  id: string;
  strategia: string;
  ticker: string;
  lato: string;
  importo: number;
  pnl_pct: number | null;
  motivo: string | null;
  created_at: string;
};

export function calcolaStatistiche(righe: Riga[]): StatisticheStrategie {
  // Lo stesso record ricevuto due volte non rappresenta due ordini diversi.
  righe = [...new Map(righe.map((r) => [r.id, r])).values()];
  const riepilogo: RiepilogoStrategia[] = IDS.map((s) => {
    const r = righe.filter((x) => x.strategia === s);
    const vendite = r.filter((x) => x.lato === "sell");
    return {
      strategia: s,
      ordini: r.length,
      acquisti: r.length - vendite.length,
      vendite: vendite.length,
      vincite: vendite.filter((x) => Number(x.pnl_pct ?? 0) > 0).length,
      perdite: vendite.filter((x) => Number(x.pnl_pct ?? 0) < 0).length,
      capitaleInvestito:
        Math.round(
          r.filter((x) => x.lato === "buy").reduce((a, x) => a + Number(x.importo), 0) * 100,
        ) / 100,
    };
  });

  const settimane: SettimanaStrategia[] = [];
  const oggi = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(oggi.getTime() - i * 7 * 86_400_000);
    settimane.push({ settimana: lunedi(d), conservativo: 0, medio: 0, aggressivo: 0 });
  }
  for (const r of righe) {
    const w = settimane.find((s) => s.settimana === lunedi(new Date(r.created_at)));
    if (w && IDS.includes(r.strategia as StrategyId)) w[r.strategia as StrategyId] += 1;
  }

  return {
    riepilogo,
    settimane,
    ultimi: righe.slice(0, 30).map((r) => ({
      id: r.id,
      strategia: r.strategia,
      ticker: r.ticker,
      lato: r.lato,
      importo: Number(r.importo),
      pnlPct: r.pnl_pct == null ? null : Number(r.pnl_pct),
      motivo: r.motivo,
      createdAt: r.created_at,
    })),
  };
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const isCripto = (t: string) => t.includes("/") || /^[A-Z]{2,6}USD$/.test(t);
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Buy & hold ipotetico: stesso capitale delle posizioni reali investito all'inizio della
 * finestra, con commissioni in entrata/uscita e dividendi (rendimento annuo, solo azioni/ETF).
 */
export async function simula(
  userId: string,
  reale: boolean,
  costoPct: number,
  dividendoPct: number,
  giorni: number,
): Promise<EsitoSimulazione> {
  const vuoto = (messaggio: string): EsitoSimulazione => ({
    ok: false,
    messaggio,
    giorni,
    posizioni: [],
    serie: [],
    totale: { costo: 0, valoreReale: 0, pnlReale: 0, valoreIpotetico: 0, pnlIpotetico: 0, dividendi: 0, costi: 0 },
  });
  const cred = await credenzialiUtente(userId, reale);
  if (!cred) return vuoto("Collega il conto Alpaca per simulare il portafoglio reale.");
  try {
    const url = reale ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";
    const res = await fetch(`${url}/v2/positions`, { headers: cred.headers });
    if (!res.ok) return vuoto("Non riesco a leggere le posizioni dal broker.");
    const pos = ((await res.json()) as Record<string, unknown>[]).map((p) => ({
      ticker: String(p["symbol"] ?? "").replace("/", ""),
      costo: Math.abs(num(p["cost_basis"])),
      valore: Math.abs(num(p["market_value"])),
      pnl: num(p["unrealized_pl"]),
    }));
    if (!pos.length) return vuoto("Nessuna posizione aperta sul conto da simulare.");

    const storico = await serieStorica(pos.map((p) => p.ticker), cred.headers);
    const c = costoPct / 100;
    const divGiorno = dividendoPct / 100 / 252;
    const lunghezza = Math.min(
      giorni,
      ...pos.map((p) => (storico[p.ticker]?.length ?? 0) || giorni),
    );

    const serieTot: number[] = new Array(lunghezza).fill(0);
    const posizioni: PosizioneSimulata[] = pos.map((p) => {
      const prezzi = (storico[p.ticker] ?? []).slice(-lunghezza);
      if (prezzi.length < 2) {
        for (let i = 0; i < lunghezza; i++) serieTot[i]! += p.costo;
        return {
          ticker: p.ticker,
          costo: r2(p.costo),
          valoreReale: r2(p.valore),
          pnlReale: r2(p.pnl),
          valoreIpotetico: r2(p.costo),
          pnlIpotetico: 0,
          dividendi: 0,
          costi: 0,
        };
      }
      const costoEntrata = p.costo * c;
      const quote = (p.costo - costoEntrata) / prezzi[0]!;
      const div = isCripto(p.ticker) ? 0 : divGiorno;
      let dividendi = 0;
      prezzi.forEach((px, i) => {
        if (i > 0) dividendi += quote * px * div;
        serieTot[i]! += quote * px + dividendi;
      });
      const lordo = quote * prezzi[prezzi.length - 1]! + dividendi;
      const costoUscita = lordo * c;
      const netto = lordo - costoUscita;
      return {
        ticker: p.ticker,
        costo: r2(p.costo),
        valoreReale: r2(p.valore),
        pnlReale: r2(p.pnl),
        valoreIpotetico: r2(netto),
        pnlIpotetico: r2(netto - p.costo),
        dividendi: r2(dividendi),
        costi: r2(costoEntrata + costoUscita),
      };
    });

    const costoTot = pos.reduce((a, p) => a + p.costo, 0);
    const oggi = Date.now();
    const somma = (k: keyof PosizioneSimulata) =>
      r2(posizioni.reduce((a, p) => a + Number(p[k]), 0));
    return {
      ok: true,
      giorni: lunghezza,
      posizioni,
      serie: serieTot.map((v, i) => ({
        data: new Date(oggi - (lunghezza - 1 - i) * 86_400_000 * 1.45).toISOString().slice(0, 10),
        ipotetico: r2(v),
        investito: r2(costoTot),
      })),
      totale: {
        costo: r2(costoTot),
        valoreReale: somma("valoreReale"),
        pnlReale: somma("pnlReale"),
        valoreIpotetico: somma("valoreIpotetico"),
        pnlIpotetico: somma("pnlIpotetico"),
        dividendi: somma("dividendi"),
        costi: somma("costi"),
      },
    };
  } catch (error) {
    logServer("report.simula", error, { reale });
    return vuoto("Simulazione non disponibile in questo momento.");
  }
}
