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

export type AssetTipo = "azione" | "etf" | "cripto";

export type AssetInvestibile = {
  ticker: string;
  nome: string;
  tipo: AssetTipo;
  borsa: string;
  frazionabile: boolean;
  operabile: boolean;
};
