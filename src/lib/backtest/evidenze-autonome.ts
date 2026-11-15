import type { Evidenza } from './motore';
import type { AssetAutonomo } from './universo-autonomo';

export type DiagnosticaEvidenza = {
  fonte: string;
  stato: 'valida' | 'vuota' | 'fuori_finestra' | 'parsing_non_valido' | 'http' | 'credenziali' | 'rete' | 'troncata' | 'non_disponibile';
  http: number | null;
  ricevute: number;
  valide: number;
  pagine: number;
  motivo: string;
};
export type EvidenzeAutonome = { evidenze: Evidenza[]; avvisi: string[]; diagnostica: DiagnosticaEvidenza[]; mancante: string | null };

/** Class-specific prerequisites. Current profiles/catalogs and price bars are not fund/on-chain evidence. */
export function requisitoClasse(classe: AssetAutonomo['classe'], fondamentali: number, news: number): string | null {
  if (classe === 'etf') return 'ETF: manca una fonte già integrata di profilo/struttura/holdings del fondo con data di pubblicazione ed efficacia verificabili entro il cutoff UTC. Il profilo FMP corrente non è storico; bilanci societari non richiesti.';
  if (classe === 'crypto') return 'Crypto: manca una fonte già integrata di metriche specifiche (supply/network/on-chain o equivalenti) con data di pubblicazione ed efficacia verificabili entro il cutoff UTC. Catalogo e barre prezzo non bastano; bilanci societari non richiesti.';
  if (classe !== 'azione') return 'Classe azione/ETF non verificata: requisiti del comitato non determinabili.';
  const mancanti = [!fondamentali && 'bilanci societari pubblicati entro il cutoff UTC', !news && 'news pertinenti nei 7 giorni precedenti con paginazione completa e timestamp verificabili'].filter(Boolean);
  return mancanti.length ? `Azioni: mancano ${mancanti.join('; ')}. Consultare la diagnostica delle fonti.` : null;
}

/** This gate precedes ALL budget reservation/model work; diagnostics remain available on both paths. */
export async function conEvidenzeSufficienti<T>(ev: EvidenzeAutonome, esegui: () => Promise<T>) {
  if (ev.mancante) return { stato: 'non_eseguibile' as const, motivo: ev.mancante, avvisi: ev.avvisi, diagnostica: ev.diagnostica };
  return esegui();
}

export function erroreFonte(fonte: string, e: unknown, pagine = 0): DiagnosticaEvidenza {
  // Never forward raw provider bodies, URLs or credential values to the browser.
  const msg = e instanceof Error ? e.message : '';
  const status = /(?:HTTP\s+|rifiuto\s+)(\d{3})/.exec(msg)?.[1];
  const http = status ? Number(status) : null;
  const stato = http ? 'http' : /credenzial|non collegato/i.test(msg) ? 'credenziali' : e instanceof SyntaxError ? 'parsing_non_valido' : 'rete';
  const motivo = http === 401 ? 'HTTP 401: credenziali non accettate dalla fonte.' : http === 403 ? 'HTTP 403: accesso/permesso negato dalla fonte.' : http === 402 ? 'HTTP 402: accesso negato dal piano della fonte; nessun retry.' : http ? `HTTP ${http}: richiesta rifiutata; nessun retry.` : stato === 'credenziali' ? 'Collegamento o credenziali PAPER non disponibili/leggibili.' : stato === 'parsing_non_valido' ? 'Risposta JSON non valida.' : 'Fonte non raggiungibile o richiesta interrotta; nessun retry.';
  return { fonte, stato, http, ricevute: 0, valide: 0, pagine, motivo };
}

/** Explicit timezone required for news; updated content is available only at its update time. */
export function newsVerificata(r: Record<string, unknown>, ticker: string): Evidenza | null {
  const timestamp = (v: unknown) => typeof v === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) ? Date.parse(v) : NaN;
  const created = timestamp(r['created_at']), updated = r['updated_at'] === undefined ? created : timestamp(r['updated_at']);
  if (!Array.isArray(r['symbols']) || !r['symbols'].includes(ticker) || !Number.isFinite(created) || !Number.isFinite(updated) || updated < created || typeof r['headline'] !== 'string' || !r['headline'].trim() || typeof r['url'] !== 'string' || !/^https:\/\//.test(r['url'])) return null;
  return { tipo: 'news', disponibileIl: new Date(updated).toISOString(), fonte: r['url'].slice(0, 200), contenuto: `${r['headline']}\n${typeof r['summary'] === 'string' ? r['summary'] : ''}`.slice(0, 4000) };
}