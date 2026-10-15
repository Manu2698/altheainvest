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
