import { analizzaStorico } from './comitato.server';
import { caricaEvidenzeAutonome } from './evidenze-autonome.server';
import type { AssetAutonomo } from './universo-autonomo';
import type { Evidenza } from './motore';

/** Class-aware acquisition; unsupported historical fund/crypto sources fail before AI reservation. */
export async function evidenzeAutonome(userId: string, ticker: string, data: string, classe: AssetAutonomo['classe']) {
  return caricaEvidenzeAutonome(userId, ticker, data, classe);
}
export type EsitoComitatoAutonomo = { ticker: string; data: string; approvato: boolean; azione: 'BUY' | 'SELL' | 'HOLD'; motivo: string; chiamate: number; dettagli: string };
export async function comitatoAutonomo(ticker: string, strategia: string, data: string, chiusure: number[], evidenze: Evidenza[]): Promise<EsitoComitatoAutonomo> {
  const v = await analizzaStorico(ticker, strategia, { data, chiusure, importo: 5, motivo: 'Candidato dallo screening IA iniziale del backtest autonomo (quota 10% di 50 EUR).', posizione: null, conto: { capitale: 50, liquidita: 50, investito: 0, numeroPosizioni: 0, perditaOggi: 0, limitePerdita: null } }, evidenze);
  if (v.errore) throw Object.assign(new Error(v.motivo), { chiamate: v.chiamate });
  return { ticker, data, approvato: v.procedi && (v.azione ?? 'BUY') === 'BUY', azione: v.azione ?? 'HOLD', motivo: v.motivo, chiamate: v.chiamate ?? 0, dettagli: JSON.stringify(v.dettagli ?? null).slice(0, 20000) };
}
