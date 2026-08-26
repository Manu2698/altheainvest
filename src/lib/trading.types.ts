export type OrdineBroker = {
  id: string;
  ticker: string;
  lato: "buy" | "sell";
  quantita: number;
  importo: number | null;
  stato: string;
  tipo: string;
  prezzoMedio: number | null;
  creatoIl: string;
};

export type DecisioneIA = {
  ticker: string;
  azione: "compra" | "vendi" | "attendi";
  importo: number;
  motivo: string;
  eseguito: boolean;
  errore?: string;
};

export type EsitoCiclo = {
  ok: boolean;
  messaggio: string;
  mercatoAperto: boolean;
  decisioni: DecisioneIA[];
  eseguiti: number;
};
