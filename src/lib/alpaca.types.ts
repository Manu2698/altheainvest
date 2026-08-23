export type PosizioneBroker = {
  ticker: string;
  quantita: number;
  prezzoMedio: number;
  valore: number;
  pnl: number;
  pnlPct: number;
};

export type ContoBroker =
  | {
      stato: "collegato";
      ambiente: "paper" | "reale";
      proprieChiavi: boolean;
      numeroConto: string;
      valuta: string;
      valorePortafoglio: number;
      liquidita: number;
      poterAcquisto: number;
      pnlGiornaliero: number;
      bloccato: boolean;
      posizioni: PosizioneBroker[];
    }
  | { stato: "non_configurato"; messaggio: string }
  | { stato: "errore"; messaggio: string };

export type StatoCollegamento = {
  paper: { collegato: boolean; chiave: string | null };
  reale: { collegato: boolean; chiave: string | null };
  piattaforma: boolean;
};

export type AssetTipo = "azione" | "etf" | "cripto";

export type AssetInvestibile = {
  ticker: string;
  nome: string;
  tipo: AssetTipo;
  borsa: string;
  frazionabile: boolean;
  operabile: boolean;
};

export type Movimento = {
  id: string;
  tipo: "deposito" | "prelievo";
  importo: number;
  valuta: string;
  ambiente: "paper" | "reale";
  metodo: string;
  stato: "in_attesa" | "completato" | "rifiutato";
  riferimento: string | null;
  note: string | null;
  createdAt: string;
};
