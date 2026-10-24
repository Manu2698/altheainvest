import type { confrontaFattore } from "./valutazione";

/** Offline only. These inputs are evidence, not forecasts produced by this module. */
export type StimaRotazione = {
  conto: string;
  ticker: string;
  valuta: string;
  strategiaVersione: string;
  osservatoIl: string;
  validoFino: string;
  orizzonteFine: string;
  fonte: string;
  rendimentoLordoMinPct: number | null;
  rendimentoLordoMaxPct: number | null;
};

export type EvidenzaRotazione = {
  adesso: string;
  conto: string;
  valuta: string;
  riconciliato: boolean;
  ordiniPendenti: boolean;
  uscitaPrioritaria: boolean;
  soloLiquiditaInsufficiente: boolean;
  controlliAcquistoSuperati: boolean;
  negoziabile: boolean;
  liquiditaDisponibile: number;
  acquistoRichiesto: number;
  posizione: {
    long: boolean;
    costoRiconciliato: boolean;
    valoreUscitaPrudente: number;
    costoMedioTotale: number;
  };
  mantenere: StimaRotazione;
  candidato: StimaRotazione;
  /** Complete proportional costs for the compared capital, fees + spread + slippage.
   * Costs already embedded in a forecast must not be supplied again.
   */
  costiRotazionePct: number | null;
  costiMantenimentoPct: number | null;
  costiUscitaPosizione: number | null;
  costiCompleti: boolean;
  prova: {
    riferimento: string;
    strategiaVersione: string;
    disponibileIl: string;
    confronto: Pick<ReturnType<typeof confrontaFattore>, "completo" | "validato" | "rischioConfrontabile" | "miglioramento">;
  };
};

type CodiceBlocco = "dati" | "conto" | "pendenti" | "uscita_prioritaria" | "acquisto" | "fondi" | "costi" | "profitto" | "confronto" | "validazione" | "vantaggio";
export type PropostaRotazione =
  | { valutabile: false; codice: CodiceBlocco; motivo: string; attivazioneAutomatica: false }
  | { valutabile: true; da: string; verso: string; capitaleDaLiberareNetto: number; vantaggioPrudentePct: number; profittoUscitaStimato: number; attivazioneAutomatica: false };

const nonNegativo = (n: number | null): n is number => n != null && Number.isFinite(n) && n >= 0;
const data = (s: string) => Date.parse(s);

/** Hypothetical comparison only; no broker calls, persistent writes or default risk thresholds. */
export function valutaRotazioneOffline(e: EvidenzaRotazione): PropostaRotazione {
  const blocca = (codice: CodiceBlocco, motivo: string): PropostaRotazione => ({ valutabile: false, codice, motivo, attivazioneAutomatica: false });
  const now = data(e.adesso);
  if (!Number.isFinite(now) || !e.riconciliato) return blocca("dati", "Contabilità o data di valutazione non verificabile.");
  if (!e.conto || !e.valuta || [e.mantenere, e.candidato].some(s => s.conto !== e.conto || s.valuta !== e.valuta)) return blocca("conto", "Conto o valuta non comparabili.");
  if (e.ordiniPendenti) return blocca("pendenti", "Ordini pendenti: nessuna proposta di rotazione.");
  if (e.uscitaPrioritaria) return blocca("uscita_prioritaria", "Le uscite di rischio ordinarie hanno priorità.");
  if (!e.controlliAcquistoSuperati || !e.negoziabile) return blocca("acquisto", "Il candidato non supera tutti i controlli di acquisto.");
  if (!nonNegativo(e.liquiditaDisponibile) || !nonNegativo(e.acquistoRichiesto) || e.acquistoRichiesto <= e.liquiditaDisponibile || !e.soloLiquiditaInsufficiente) return blocca("fondi", "Nessuna carenza di liquidità isolata: non aggirare limiti o blocchi.");
  if (!e.costiCompleti || !nonNegativo(e.costiRotazionePct) || !nonNegativo(e.costiMantenimentoPct) || !nonNegativo(e.costiUscitaPosizione)) return blocca("costi", "Costi completi non disponibili per entrambe le alternative.");
  const p = e.posizione;
  const profitto = p.valoreUscitaPrudente - p.costoMedioTotale - e.costiUscitaPosizione;
  const capitale = e.acquistoRichiesto - e.liquiditaDisponibile;
  if (!p.long || !p.costoRiconciliato || !nonNegativo(p.valoreUscitaPrudente) || !nonNegativo(p.costoMedioTotale) || p.costoMedioTotale === 0 || !Number.isFinite(profitto) || profitto <= 0 || p.valoreUscitaPrudente - e.costiUscitaPosizione < capitale) return blocca("profitto", "Posizione non riconciliata, non in guadagno netto o insufficiente a finanziare il candidato.");
  const valido = (s: StimaRotazione) => Boolean(s.ticker.trim() && s.fonte.trim() && s.strategiaVersione.trim())
    && Number.isFinite(data(s.osservatoIl)) && data(s.osservatoIl) <= now
    && Number.isFinite(data(s.validoFino)) && data(s.validoFino) > now
    && Number.isFinite(data(s.orizzonteFine)) && data(s.orizzonteFine) > now
    && data(s.validoFino) <= data(s.orizzonteFine)
    && s.rendimentoLordoMinPct != null && s.rendimentoLordoMaxPct != null
    && Number.isFinite(s.rendimentoLordoMinPct) && Number.isFinite(s.rendimentoLordoMaxPct)
    && s.rendimentoLordoMinPct > -100 && s.rendimentoLordoMinPct <= s.rendimentoLordoMaxPct;
  const m = e.mantenere, c = e.candidato;
  if (!valido(m) || !valido(c) || m.ticker.replaceAll("/", "").toUpperCase() === c.ticker.replaceAll("/", "").toUpperCase() || data(m.osservatoIl) !== data(c.osservatoIl) || data(m.orizzonteFine) !== data(c.orizzonteFine) || m.strategiaVersione !== c.strategiaVersione) return blocca("confronto", "Stime assenti, obsolete, future o non comparabili per orizzonte e versione.");
  const prova = e.prova;
  if (!prova.riferimento.trim() || prova.strategiaVersione !== c.strategiaVersione || !Number.isFinite(data(prova.disponibileIl)) || data(prova.disponibileIl) > data(c.osservatoIl) || !prova.confronto.completo || !prova.confronto.validato || !prova.confronto.rischioConfrontabile || !prova.confronto.miglioramento) return blocca("validazione", "Confronto netto fuori campione non verificato per questa versione.");
  // Even the lower candidate estimate must exceed the upper holding estimate after costs.
  const min = c.rendimentoLordoMinPct, max = m.rendimentoLordoMaxPct;
  if (min == null || max == null) return blocca("confronto", "Intervalli di rendimento mancanti.");
  const vantaggio = (min - e.costiRotazionePct) - (max - e.costiMantenimentoPct);
  if (!Number.isFinite(vantaggio) || vantaggio <= 0) return blocca("vantaggio", "Nessun vantaggio netto separabile dall'incertezza delle stime.");
  return { valutabile: true, da: m.ticker, verso: c.ticker, capitaleDaLiberareNetto: capitale, vantaggioPrudentePct: vantaggio, profittoUscitaStimato: profitto, attivazioneAutomatica: false };
}