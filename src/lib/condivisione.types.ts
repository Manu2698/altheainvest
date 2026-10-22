import type { OpzioniCondivisione, StatoLink } from "./condivisione";
import type { ConfrontoConti } from "./piattaforme.types";

export type LinkCondivisione = {
  id: string;
  nome: string;
  opzioni: OpzioniCondivisione;
  scadeIl: string;
  revocatoIl: string | null;
  ultimoAccesso: string | null;
  accessi: number;
  creatoIl: string;
  stato: StatoLink;
};

/** Versione del motore decisionale (aggiornare quando cambia la logica d'investimento). */
export const VERSIONE_MOTORE = { versione: "2026.10 · segnali appresi", data: "2026-10-22" };

export type Fonte = "reale" | "paper";

export type VistaCondivisa = {
  generataIl: string;
  link: { nome: string; scadeIl: string };
  opzioni: OpzioniCondivisione;
  motore: typeof VERSIONE_MOTORE;
  avvisi: string[];
  collegamenti: { piattaforma: string; nome: string; ambiente: Fonte; stato: "collegato" | "errore" | "non collegato"; messaggio: string | null }[];
  confronto: {
    aggiornatoIl: string;
    attivi: (Omit<ConfrontoConti["attivi"][number], "contoId" | "capitale" | "pnlRealizzato" | "pnlNonRealizzato" | "flussi" | "settimana"> & {
      capitale: number | null;
      pnlRealizzato: number | null;
      pnlNonRealizzato: number | null;
      flussi: ConfrontoConti["attivi"][number]["flussi"];
      settimana: { data: string; pnl: number | null }[];
    })[];
    storici: (Omit<ConfrontoConti["storici"][number], "id" | "pnlRealizzato"> & { pnlRealizzato: number | null })[];
    nonDeterminati: (Omit<ConfrontoConti["nonDeterminati"][number], "pnlRealizzato"> & { pnlRealizzato: number | null })[];
  };
  posizioni: { piattaforma: string; nome: string; ambiente: Fonte; ticker: string; quantita: number; valore: number | null; pnlPct: number }[] | null;
  automazioni: {
    piattaforma: string;
    nome: string;
    ambiente: Fonte;
    attivo: boolean;
    strategia: string;
    modalita: string;
    capitale: number | null;
    perditaMaxGiornaliera: number | null;
    pausaMotivo: string | null;
    pausaIl: string | null;
    ultimoCiclo: string | null;
    modificatoIl: string;
    lezioni: string;
    ultimoEsito: {
      messaggio: string;
      eseguiti: number;
      mercatoAperto: boolean | null;
      decisioni: { ticker: string; azione: string; motivo: string; eseguito: boolean; errore: string | null }[];
    } | null;
  }[];
  strategie: Record<Fonte, { strategia: string; ordini: number; acquisti: number; vendite: number; vincite: number; perdite: number; capitaleInvestito: number | null }[]> ;
  ordiniIA: {
    createdAt: string;
    piattaforma: string;
    ambiente: Fonte;
    conto: string;
    strategia: string;
    ticker: string;
    lato: string;
    importo: number | null;
    pnlPct: number | null;
    segnale: string | null;
    motivo: string | null;
  }[] | null;
  ordiniBroker: { ambiente: Fonte; ticker: string; lato: string; stato: string; tipo: string; quantita: number; prezzoMedio: number | null; importo: number | null; creatoIl: string }[] | null;
  curva: Record<Fonte, { giorno: string; valore: number }[]> | null;
};

export type EsitoVista = { ok: true; vista: VistaCondivisa } | { ok: false; motivo: "non_valido" | "scaduto" | "revocato" | "troppe_richieste" };
