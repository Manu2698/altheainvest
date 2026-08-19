export type StrategyId = "conservativo" | "bilanciato" | "aggressivo";

export interface Strategy {
  id: StrategyId;
  nome: string;
  claim: string;
  descrizione: string;
  rischio: number; // 1-10
  rendimentoAtteso: string;
  drawdownMax: string;
  orizzonte: string;
  universo: string[];
  regole: string[];
  volatilita: number; // usata dalla simulazione
  drift: number;
}

export const STRATEGIE: Strategy[] = [
  {
    id: "conservativo",
    nome: "Conservativo",
    claim: "Guadagna poco, ma quasi sempre",
    descrizione:
      "L'IA seleziona titoli a bassa volatilità con dividendi storicamente stabili. Prende posizioni ampie, con leva zero e stop stretti: l'obiettivo è la continuità del rendimento, non il colpo grosso.",
    rischio: 2,
    rendimentoAtteso: "+4 / +7% annuo",
    drawdownMax: "-6%",
    orizzonte: "12-36 mesi",
    universo: ["KO", "JNJ", "PG", "NESN", "ENEL", "T-Bond 10Y"],
    regole: [
      "Massimo 8% del capitale per singolo titolo",
      "Nessuna leva finanziaria, nessuno short",
      "Esce dalla posizione se la volatilità a 30gg supera il 25%",
    ],
    volatilita: 0.0035,
    drift: 0.00022,
  },
  {
    id: "bilanciato",
    nome: "Bilanciato",
    claim: "Crescita costante con rischio sotto controllo",
    descrizione:
      "Mix di ETF ad ampia diffusione e blue chip in trend. L'IA ribilancia settimanalmente in base al momentum a medio termine, mantenendo sempre una quota di liquidità come cuscinetto.",
    rischio: 5,
    rendimentoAtteso: "+9 / +14% annuo",
    drawdownMax: "-15%",
    orizzonte: "6-24 mesi",
    universo: ["VOO", "MSFT", "ASML", "LVMH", "AAPL", "GLD"],
    regole: [
      "Ribilanciamento momentum ogni lunedì",
      "Cash buffer minimo del 10%",
      "Riduzione esposizione del 50% se l'indice rompe la media a 200 giorni",
    ],
    volatilita: 0.0085,
    drift: 0.00048,
  },
  {
    id: "aggressivo",
    nome: "Aggressivo",
    claim: "Volatilità alta, potenziale alto",
    descrizione:
      "Caccia a trend esplosivi su growth, small cap e cripto. L'IA entra rapidamente e taglia le perdite ancora più rapidamente: poche operazioni vincenti devono pagare tutte le perdenti.",
    rischio: 9,
    rendimentoAtteso: "+20 / +45% annuo",
    drawdownMax: "-38%",
    orizzonte: "1-6 mesi",
    universo: ["NVDA", "TSLA", "PLTR", "COIN", "BTC", "SOL"],
    regole: [
      "Stop loss automatico al -7% per posizione",
      "Leva massima 2x solo su segnali ad alta convinzione",
      "Chiusura forzata di tutto se il drawdown mensile supera il 20%",
    ],
    volatilita: 0.021,
    drift: 0.00105,
  },
];

export const getStrategia = (id: StrategyId): Strategy =>
  STRATEGIE.find((s) => s.id === id) ?? STRATEGIE[0]!;

/** RNG deterministico: stessa serie a ogni render, nessun mismatch SSR. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PuntoEquity {
  giorno: string;
  valore: number;
  benchmark: number;
}

export function generaEquity(
  strategia: Strategy,
  capitaleIniziale: number,
  giorni = 180,
): PuntoEquity[] {
  const rand = mulberry32(strategia.id.length * 7919 + strategia.rischio * 104729);
  let valore = capitaleIniziale;
  let benchmark = capitaleIniziale;
  const punti: PuntoEquity[] = [];
  const oggi = new Date(Date.UTC(2026, 7, 19));

  for (let i = giorni; i >= 0; i--) {
    const d = new Date(oggi.getTime() - i * 86400000);
    const shock = (rand() - 0.5) * 2;
    valore *= 1 + strategia.drift + shock * strategia.volatilita;
    benchmark *= 1 + 0.00035 + (rand() - 0.5) * 0.011;
    punti.push({
      giorno: d.toISOString().slice(0, 10),
      valore: Math.round(valore),
      benchmark: Math.round(benchmark),
    });
  }
  return punti;
}

export interface Operazione {
  id: string;
  ora: string;
  ticker: string;
  lato: "BUY" | "SELL";
  quantita: number;
  prezzo: number;
  pnl: number;
  motivazione: string;
}

const MOTIVAZIONI: Record<StrategyId, string[]> = {
  conservativo: [
    "Dividend yield sopra la media storica, ingresso graduale",
    "Volatilità a 30gg rientrata sotto soglia: riapro posizione",
    "Ribilanciamento difensivo del peso di portafoglio",
    "Presa di profitto parziale, capitale spostato su liquidità",
  ],
  bilanciato: [
    "Momentum a 12 settimane positivo, peso incrementato",
    "Rottura media a 50 giorni al rialzo confermata dai volumi",
    "Riduzione esposizione settoriale sopra il limite del 25%",
    "Rotazione da difensivi verso tecnologia in trend",
  ],
  aggressivo: [
    "Breakout su massimi a 60 giorni con volumi 3x",
    "Stop loss automatico attivato al -7%",
    "Segnale ad alta convinzione: leva 1.8x applicata",
    "Chiusura rapida, il trend ha perso forza in intraday",
  ],
};

export function generaOperazioni(strategia: Strategy, quante = 8): Operazione[] {
  const rand = mulberry32(strategia.rischio * 31337 + strategia.nome.length);
  const motivi = MOTIVAZIONI[strategia.id];
  return Array.from({ length: quante }, (_, i) => {
    const ticker = strategia.universo[Math.floor(rand() * strategia.universo.length)]!;
    const lato = rand() > 0.42 ? "BUY" : "SELL";
    const prezzo = 20 + rand() * 380;
    const magnitudo = strategia.volatilita * 12000;
    const vincita = rand() > (strategia.id === "aggressivo" ? 0.45 : 0.28);
    const pnl = (vincita ? 1 : -1) * (rand() * magnitudo + magnitudo * 0.15);
    const minuti = 9 * 60 + 30 + Math.floor(rand() * 380) - i * 7;
    return {
      id: `${strategia.id}-${i}`,
      ora: `${String(Math.floor(minuti / 60)).padStart(2, "0")}:${String(minuti % 60).padStart(2, "0")}`,
      ticker,
      lato,
      quantita: Math.max(1, Math.round((rand() * 12000) / prezzo)),
      prezzo: Math.round(prezzo * 100) / 100,
      pnl: Math.round(pnl * 100) / 100,
      motivazione: motivi[i % motivi.length]!,
    };
  });
}

export const formatEuro = (n: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

export const formatPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
