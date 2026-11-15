import type { DiagnosticaEvidenza } from './evidenze-autonome';
import type { Barra } from './motore';
import type { AssetAutonomo } from './universo-autonomo';
import { inputScreening, motivoNonValutabile, type InputScreening } from './screening-autonomo';

export type VerdettoUI = { ticker: string; verdetto: 'BUY' | 'SELL' | 'HOLD' | 'NON_VALUTABILE'; priorita: number; motivazione: string };
export type EsitoComitatoUI = { diagnostica?: DiagnosticaEvidenza[]; avvisi?: string[] } & (
  | { stato: 'eseguito'; approvato: boolean; azione: 'BUY' | 'SELL' | 'HOLD'; motivo: string; chiamate: number }
  | { stato: 'non_eseguibile' | 'negata'; motivo: string });
export type StatoIA = { runId: string | null; screening: Record<string, VerdettoUI>; comitati: Record<string, EsitoComitatoUI>; messaggi: string[] };

/** Every verified-class instrument with >=20 bars strictly before the start date is screened; order is deterministic. */
export function eleggibiliScreening(assets: AssetAutonomo[], serie: Record<string, Barra[]>, data: string): InputScreening[] {
  return assets.map(s => inputScreening(s, serie[s.ticker] ?? [], data, [])).filter(i => !motivoNonValutabile(i)).sort((a, b) => a.ticker.localeCompare(b.ticker));
}
/** Best BUY candidates by AI priority (ties by ticker), at most k. */
export function candidatiComitato(screening: Record<string, VerdettoUI>, k: number): string[] {
  return Object.values(screening).filter(v => v.verdetto === 'BUY').sort((a, b) => b.priorita - a.priorita || a.ticker.localeCompare(b.ticker)).slice(0, k).map(v => v.ticker);
}
/** A candidate is (re)evaluated unless its committee already ran ('eseguito') or the run was denied ('negata'); 'non_eseguibile' is retried on every new AI run so fresh evidence can unblock it. */
export function comitatoDaRitentare(c: EsitoComitatoUI | undefined): boolean {
  return !c || c.stato === 'non_eseguibile';
}
/** COMPLETE only when every eligible was screened and every selected candidate got a real committee verdict. */
export function statoIA(eleggibili: string[], s: StatoIA, k: number) {
  const motivi: string[] = [];
  const mancanti = eleggibili.filter(t => !s.screening[t]);
  if (!eleggibili.length) motivi.push('Nessuno strumento eleggibile allo screening.');
  if (mancanti.length) motivi.push(`Screening mancante per ${mancanti.length} eleggibili.`);
  const cand = candidatiComitato(s.screening, k);
  const nonEseguiti = cand.filter(t => s.comitati[t]?.stato !== 'eseguito');
  for (const t of nonEseguiti) motivi.push(`${t}: comitato ${s.comitati[t] ? s.comitati[t]?.motivo : 'non ancora eseguito'}`);
  const approvati = cand.filter(t => { const c = s.comitati[t]; return c?.stato === 'eseguito' && c.approvato; });
  return { completo: eleggibili.length > 0 && !mancanti.length && !nonEseguiti.length, approvati, candidati: cand, motivi };
}
