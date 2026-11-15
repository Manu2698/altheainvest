import { analizzaStorico } from './comitato.server';
import { bilanciStorici, notizieStoriche } from './evidenze';
import { leggiFMP } from './prezzi-fmp.server';
import { credenzialiPaperAutonome } from './universo-alpaca.server';
import type { Evidenza } from './motore';

/** Point-in-time evidence for one candidate: FMP statements + Alpaca news with the user's PAPER keys only (no REAL, no env fallback). */
export async function evidenzeAutonome(userId: string, ticker: string, data: string) {
  const evidenze: Evidenza[] = [], avvisi: string[] = [];
  for (const tipo of ['income-statement', 'balance-sheet-statement', 'cash-flow-statement']) {
    try { const j = await leggiFMP(tipo, { symbol: ticker, period: 'quarter', limit: '400' }); if (!Array.isArray(j)) throw new Error('Bilanci non leggibili.'); evidenze.push(...bilanciStorici(j, ticker, data)); }
    catch (e) { avvisi.push(e instanceof Error ? e.message : 'Bilanci non disponibili.'); break; }
  }
  try {
    const cred = await credenzialiPaperAutonome(userId), cutoff = Date.parse(`${data}T00:00:00Z`);
    const url = new URL('https://data.alpaca.markets/v1beta1/news');
    for (const [k, v] of Object.entries({ symbols: ticker, start: new Date(cutoff - 7 * 86400000).toISOString(), end: new Date(cutoff).toISOString(), sort: 'desc', limit: '50' })) url.searchParams.set(k, v);
    const r = await fetch(url, { headers: cred.headers, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`Alpaca News HTTP ${r.status}: notizie point-in-time non disponibili.`);
    const j = await r.json() as { news?: Record<string, unknown>[]; next_page_token?: string | null };
    if (!Array.isArray(j.news)) throw new Error('Archivio notizie non leggibile.');
    if (j.next_page_token) throw new Error('Notizie oltre la prima pagina: campione troncato escluso.');
    evidenze.push(...notizieStoriche(j.news, ticker, data));
  } catch (e) { avvisi.push(e instanceof Error ? e.message : 'Notizie non disponibili.'); }
  const fond = evidenze.filter(e => e.tipo === 'fondamentali').length, news = evidenze.filter(e => e.tipo === 'news').length;
  const mancante = !fond || !news ? `Comitato non eseguibile: ${!fond ? 'bilanci pubblicati prima della data assenti' : ''}${!fond && !news ? '; ' : ''}${!news ? 'notizie dei 7 giorni precedenti assenti' : ''}.` : null;
  return { evidenze: evidenze.sort((a, b) => a.disponibileIl.localeCompare(b.disponibileIl)), avvisi, mancante };
}
export type EsitoComitatoAutonomo = { ticker: string; data: string; approvato: boolean; azione: 'BUY' | 'SELL' | 'HOLD'; motivo: string; chiamate: number; dettagli: string };
export async function comitatoAutonomo(ticker: string, strategia: string, data: string, chiusure: number[], evidenze: Evidenza[]): Promise<EsitoComitatoAutonomo> {
  const v = await analizzaStorico(ticker, strategia, { data, chiusure, importo: 5, motivo: 'Candidato dallo screening IA iniziale del backtest autonomo (quota 10% di 50 EUR).', posizione: null, conto: { capitale: 50, liquidita: 50, investito: 0, numeroPosizioni: 0, perditaOggi: 0, limitePerdita: null } }, evidenze);
  if (v.errore) throw Object.assign(new Error(v.motivo), { chiamate: v.chiamate });
  return { ticker, data, approvato: v.procedi && (v.azione ?? 'BUY') === 'BUY', azione: v.azione ?? 'HOLD', motivo: v.motivo, chiamate: v.chiamate ?? 0, dettagli: JSON.stringify(v.dettagli ?? null).slice(0, 20000) };
}
