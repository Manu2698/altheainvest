export type StrategyId = "conservativo" | "medio" | "aggressivo";

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
    claim: "Quota target e protezione del capitale",
    descrizione:
      "Propone acquisti verso la quota target configurata e uscite quando la posizione perde almeno il 10%. Le protezioni possono bloccare gli ingressi; nessuna garanzia di rendimento.",
    rischio: 2,
    rendimentoAtteso: "Non stimato",
    drawdownMax: "Non garantito",
    orizzonte: "12-36 mesi",
    universo: ["KO", "JNJ", "PG", "NESN", "ENEL", "T-Bond 10Y"],
    regole: [
      "Acquisto se manca oltre il 20% della quota target",
      "Nessuna leva finanziaria, nessuno short",
      "Stop sulla posizione al -10%; prezzo di uscita non garantito",
    ],
    volatilita: 0.0035,
    drift: 0.00022,
  },
  {
    id: "medio",
    nome: "Medio",
    claim: "Segue il trend a 20 giorni",
    descrizione:
      "Acquista sopra la media a 20 giorni verso la quota target. Esce al -8% o sotto il 97% della media; le uscite precedono gli ingressi. Non applica ripartizioni difensive o ribilanciamenti settimanali.",
    rischio: 5,
    rendimentoAtteso: "Non stimato",
    drawdownMax: "Non garantito",
    orizzonte: "6-24 mesi",
    universo: ["VOO", "MSFT", "ASML", "AAPL", "NVDA", "GLD"],
    regole: [
      "Ingresso sopra SMA20 se manca oltre il 20% della quota target",
      "Uscita sotto il 97% della SMA20 o perdita almeno dell'8%",
      "Accumulo soltanto con trend positivo e posizione non in perdita",
    ],
    volatilita: 0.0085,
    drift: 0.00048,
  },
  {
    id: "aggressivo",
    nome: "Aggressivo",
    claim: "Compra sui ribassi, vende prima del ritorno",
    descrizione:
      "Propone ingressi almeno il 2% sotto la media a 10 giorni, prende profitto al +5% e taglia le perdite al -7%. I controlli sui dati bloccano ribassi anomali; non usa RSI o deviazioni standard come segnali.",
    rischio: 9,
    rendimentoAtteso: "Non stimato",
    drawdownMax: "Non garantito",
    orizzonte: "giorni / settimane",
    universo: ["NVDA", "TSLA", "PLTR", "COIN", "BTC", "SOL"],
    regole: [
      "Ingresso almeno il 2% sotto SMA10",
      "Presa di profitto della posizione al +5%",
      "Stop della posizione al -7%; nessun limite mensile automatico",
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
  medio: [
    "Momentum a 12 settimane positivo, peso incrementato",
    "Rottura media a 50 giorni al rialzo confermata dai volumi",
    "Riduzione esposizione settoriale sopra il limite del 25%",
    "Rotazione da difensivi verso tecnologia in trend",
  ],
  aggressivo: [
    "Prezzo a -2 dev. std dalla media: accumulo sul ribasso",
    "Stop loss automatico attivato al -7%",
    "Rimbalzo al target: chiudo prima che il momentum si esaurisca",
    "RSI sotto 30 su forte volume: primo ingresso parziale",
  ],
};

export function generaOperazioni(
  strategia: Strategy,
  quante = 8,
  universo?: string[],
): Operazione[] {
  const lista = universo && universo.length > 0 ? universo : strategia.universo;
  const rand = mulberry32(strategia.rischio * 31337 + strategia.nome.length + lista.length);
  const motivi = MOTIVAZIONI[strategia.id];
  return Array.from({ length: quante }, (_, i) => {
    const ticker = lista[Math.floor(rand() * lista.length)]!;
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

// Formattazione deterministica (l'ICU del runtime server può differire dal browser).
export const formatEuro = (n: number) => {
  const seg = Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${seg} €`;
};


export const formatPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
