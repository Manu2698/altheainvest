export type Quotazione = {
  ticker: string;
  prezzo: number;
  variazionePct: number;
  volume: number;
  aggiornatoIl: string;
};

export type SegnaleStrumento = {
  ticker: string;
  prezzo: number;
  sma10: number;
  sma20: number;
  rsi14: number;
  volatilitaPct: number;
  scostamentoPct: number;
  tendenza: "rialzo" | "ribasso" | "laterale";
  giudizio: "compra" | "vendi" | "attendi";
  serie: number[];
};

export type OrdinePianificato = {
  id: string;
  ticker: string;
  lato: "buy" | "sell";
  importo: number;
  reale: boolean;
  eseguiIl: string;
  stato: string;
  ordineId: string | null;
  errore: string | null;
  eseguitoIl: string | null;
};
