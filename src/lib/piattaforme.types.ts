export type PiattaformaEsterna = "trading212" | "binance" | "kraken" | "coinbase" | "etoro";
export type Piattaforma = "alpaca" | PiattaformaEsterna;

export const PIATTAFORME_ESTERNE: PiattaformaEsterna[] = [
  "trading212",
  "binance",
  "kraken",
  "coinbase",
  "etoro",
];

export const isPiattaforma = (v: unknown): v is Piattaforma =>
  v === "alpaca" || PIATTAFORME_ESTERNE.includes(v as PiattaformaEsterna);

export type InfoPiattaforma = {
  nome: string;
  mercati: string;
  campoChiave: string;
  campoSegreto: string;
  /** Cosa significa "paper" su questa piattaforma. */
  paper: string;
  guida: string;
  sito: string;
};

export const INFO_PIATTAFORME: Record<Piattaforma, InfoPiattaforma> = {
  alpaca: {
    nome: "Alpaca",
    mercati: "Azioni USA, ETF, cripto",
    campoChiave: "API Key ID",
    campoSegreto: "Secret Key",
    paper: "conto paper Alpaca",
    guida: "",
    sito: "https://app.alpaca.markets",
  },
  trading212: {
    nome: "Trading 212",
    mercati: "Azioni USA ed europee",
    campoChiave: "API Key",
    campoSegreto: "API Secret",
    paper: "conto Practice (demo)",
    guida: "App Trading 212 → Impostazioni → API (Beta) → Genera chiave. Usa chiavi Practice per il paper.",
    sito: "https://app.trading212.com",
  },
  binance: {
    nome: "Binance",
    mercati: "Cripto (contro USDT)",
    campoChiave: "API Key",
    campoSegreto: "Secret Key",
    paper: "Spot Testnet (testnet.binance.vision)",
    guida: "Gestione API → Crea API con permesso 'Spot trading'. Per il paper genera le chiavi su testnet.binance.vision.",
    sito: "https://www.binance.com",
  },
  kraken: {
    nome: "Kraken",
    mercati: "Cripto (contro USD)",
    campoChiave: "API Key",
    campoSegreto: "Private Key",
    paper: "ordini solo convalidati da Kraken, senza esecuzione",
    guida: "Impostazioni → API → Crea chiave con 'Query funds' e 'Create & modify orders'.",
    sito: "https://pro.kraken.com",
  },
  coinbase: {
    nome: "Coinbase",
    mercati: "Cripto (contro USD)",
    campoChiave: "Nome chiave (organizations/…/apiKeys/…)",
    campoSegreto: "Chiave privata ECDSA (-----BEGIN EC PRIVATE KEY-----)",
    paper: "anteprima ordini Coinbase, senza esecuzione",
    guida: "developer.coinbase.com → API Keys → crea chiave 'Trade' con algoritmo ECDSA.",
    sito: "https://www.coinbase.com/advanced-trade",
  },
  etoro: {
    nome: "eToro",
    mercati: "Azioni, ETF e cripto",
    campoChiave: "Public API Key (x-api-key)",
    campoSegreto: "User Key (x-user-key)",
    paper: "conto virtuale (demo) eToro",
    guida: "Impostazioni → Trading → API Key → crea chiave con permesso di scrittura (Demo per il paper, Real per il reale).",
    sito: "https://www.etoro.com",
  },
};

export type StatoPiattaforme = Record<
  PiattaformaEsterna,
  { paper: string | null; reale: string | null }
>;

/** Pannello dashboard di un conto collegato (piattaforma + ambiente): conto, posizioni, ordini IA. */
export type PannelloPiattaforma = {
  piattaforma: Piattaforma;
  ambiente: "paper" | "reale";
  nome: string;
  stato: "collegato" | "errore";
  messaggio: string | null;
  valuta: string;
  valore: number;
  liquidita: number;
  posizioni: { ticker: string; quantita: number; valore: number; pnlPct: number }[];
  ordini: { id: string; ticker: string; lato: string; importo: number; createdAt: string }[];
  /** Totale investito dall'IA per giorno, ultimi 14 giorni (data ISO YYYY-MM-DD). */
  giorni: { data: string; totale: number }[];
};

/** Quadro sintetico di un conto collegato: capitale live e risultati dell'IA (ultimi 30 gg). */
export type RiepilogoConto = {
  piattaforma: Piattaforma;
  ambiente: "paper" | "reale";
  nome: string;
  stato: "collegato" | "errore";
  valuta: string;
  /** Identificativo stabile del conto (alpaca:<id> o impronta:<hash>), null se non leggibile. */
  contoId: string | null;
  /** Etichetta mostrabile (es. ultime cifre del numero di conto). */
  etichetta: string | null;
  /** True se l'identità del conto è stata confermata dal broker (non da un'impronta delle chiavi). */
  verificato: boolean;
  /** Valore attuale del conto letto dalla piattaforma (0 se non raggiungibile). */
  capitale: number;
  ordini: number;
  /** Vendite chiuse in guadagno / in perdita. */
  vincite: number;
  perdite: number;
  /** Guadagno/perdita realizzato totale (somma dei P&L delle vendite). */
  pnlRealizzato: number;
  /** Guadagno/perdita delle posizioni ancora aperte. */
  pnlNonRealizzato: number;
  /** Flussi del conto (solo dove il broker li fornisce; null = non disponibile). */
  flussi: { iniziale: number | null; versamenti: number; prelievi: number; costi: number } | null;
  rendimentoNettoPct: number | null;
  /** P&L realizzato per giorno, ultimi 7 giorni (data ISO YYYY-MM-DD). */
  settimana: { data: string; pnl: number }[];
};

/** Conto non più collegato: da confermare (identità non verificabile) o archiviato. */
export type ContoStorico = {
  id: string;
  piattaforma: Piattaforma;
  ambiente: "paper" | "reale";
  nome: string;
  etichetta: string | null;
  stato: "da_confermare" | "archiviato";
  motivo: string | null;
  ultimoVisto: string;
  archiviatoIl: string | null;
  ordini: number;
  vincite: number;
  perdite: number;
  pnlRealizzato: number;
};

/** Ordini registrati prima che venisse salvato il conto e non abbinabili a un conto verificato. */
export type OrdiniNonDeterminati = {
  piattaforma: Piattaforma;
  ambiente: "paper" | "reale";
  nome: string;
  ordini: number;
  vincite: number;
  perdite: number;
  pnlRealizzato: number;
  dal: string | null;
  al: string | null;
};

export type ConfrontoConti = {
  aggiornatoIl: string;
  attivi: RiepilogoConto[];
  storici: ContoStorico[];
  nonDeterminati: OrdiniNonDeterminati[];
};
