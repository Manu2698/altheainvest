import { bilanciStorici } from './evidenze';
import { erroreFonte, newsVerificata, requisitoClasse, type DiagnosticaEvidenza, type EvidenzeAutonome } from './evidenze-autonome';
import type { AssetAutonomo } from './universo-autonomo';
import type { Evidenza } from './motore';

type Dipendenze = {
  fmp: (endpoint: string, parametri: Record<string, string>) => Promise<unknown>;
  paper: (userId: string) => Promise<{ headers: Record<string, string> }>;
  fetch: typeof fetch;
};
const defaults: Dipendenze = {
  fmp: async (endpoint, p) => (await import('./prezzi-fmp.server')).leggiFMP(endpoint, p),
  paper: async userId => (await import('./universo-alpaca.server')).credenzialiPaperAutonome(userId),
  fetch: (...args) => fetch(...args),
};
const riga = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const diagnostica = (fonte: string, stato: DiagnosticaEvidenza['stato'], ricevute: number, valide: number, pagine: number, motivo: string): DiagnosticaEvidenza => ({ fonte, stato, http: 200, ricevute, valide, pagine, motivo });

/** Only already-integrated endpoints: FMP quarterly statements and Alpaca historical news. No model/budget work. */
export async function caricaEvidenzeAutonome(userId: string, ticker: string, data: string, classe: AssetAutonomo['classe'], deps: Dipendenze = defaults): Promise<EvidenzeAutonome> {
  const cutoff = Date.parse(`${data}T00:00:00Z`), inizio = cutoff - 7 * 86400000;
  if (!Number.isFinite(cutoff) || new Date(cutoff).toISOString().slice(0, 10) !== data) throw new Error('Data evidenze non valida.');
  const evidenze: Evidenza[] = [], controlli: DiagnosticaEvidenza[] = [];
  if (classe === 'azione') {
    for (const endpoint of ['income-statement', 'balance-sheet-statement', 'cash-flow-statement']) {
      const fonte = `Financial Modeling Prep · ${endpoint}`;
      try {
        const j = await deps.fmp(endpoint, { symbol: ticker, period: 'quarter', limit: '400' });
        if (!Array.isArray(j) || j.some(x => !riga(x))) { controlli.push(diagnostica(fonte, 'parsing_non_valido', 0, 0, 1, 'Atteso array di bilanci; formato non valido.')); continue; }
        if (!j.length) { controlli.push(diagnostica(fonte, 'vuota', 0, 0, 1, 'Risposta vuota: nessun bilancio restituito.')); continue; }
        // A full limit may omit older filings: do not accept a potentially truncated source.
        if (j.length >= 400) { controlli.push(diagnostica(fonte, 'troncata', j.length, 0, 1, 'Limite di 400 bilanci raggiunto: copertura non dimostrata, fonte esclusa.')); continue; }
        const validi = bilanciStorici(j, ticker, data);
        const strutturati = j.flatMap(x => bilanciStorici([x], ticker, '9999-12-30'));
        const stato = validi.length ? 'valida' : strutturati.length ? 'fuori_finestra' : 'parsing_non_valido';
        controlli.push(diagnostica(fonte, stato, j.length, validi.length, 1, validi.length ? 'Bilanci con pubblicazione verificabile entro il cutoff; possibili rettifiche successive non certificabili.' : strutturati.length ? 'Bilanci pubblicati dopo il cutoff UTC.' : 'Nessun bilancio pertinente con pubblicazione e metriche numeriche valide.'));
        evidenze.push(...validi);
      } catch (e) { controlli.push(erroreFonte(fonte, e, 1)); }
    }
  } else {
    controlli.push({ fonte: classe === 'etf' ? 'Fonti ETF già integrate' : classe === 'crypto' ? 'Fonti crypto già integrate' : 'Classe asset', stato: 'non_disponibile', http: null, ricevute: 0, valide: 0, pagine: 0, motivo: requisitoClasse(classe, 0, 0) ?? '' });
  }

  const fonte = 'Alpaca · /v1beta1/news';
  let pagine = 0, ricevute = 0;
  try {
    const cred = await deps.paper(userId);
    const url = new URL('https://data.alpaca.markets/v1beta1/news');
    for (const [k, v] of Object.entries({ symbols: ticker, start: new Date(inizio).toISOString(), end: new Date(cutoff).toISOString(), sort: 'desc', limit: '50' })) url.searchParams.set(k, v);
    const righe = new Map<string, Record<string, unknown>>(), tokens = new Set<string>();
    let completo = false, problema: string | null = null;
    for (; pagine < 10;) {
      pagine++;
      const r = await deps.fetch(url, { headers: cred.headers, signal: AbortSignal.timeout(10000) });
      if (!r.ok) { controlli.push({ ...erroreFonte(fonte, new Error(`HTTP ${r.status}`), pagine), ricevute }); problema = 'http'; break; }
      const j: unknown = await r.json();
      if (!riga(j) || !Array.isArray(j['news']) || j['news'].some(x => !riga(x)) || (j['next_page_token'] != null && typeof j['next_page_token'] !== 'string')) {
        controlli.push(diagnostica(fonte, 'parsing_non_valido', ricevute, 0, pagine, 'Formato pagina news/token non valido: nessun campione utilizzato.')); problema = 'parsing'; break;
      }
      for (const x of j['news'] as Record<string, unknown>[]) {
        ricevute++;
        const id = String(x['id'] ?? x['url'] ?? JSON.stringify(x)), old = righe.get(id);
        if (old && JSON.stringify(old) !== JSON.stringify(x)) { problema = 'Notizie duplicate incoerenti: campione escluso.'; break; }
        righe.set(id, x);
      }
      if (problema) break;
      const token = j['next_page_token'];
      if (!token) { completo = true; break; }
      if (tokens.has(String(token))) { problema = 'Token di paginazione ripetuto: campione incompleto escluso.'; break; }
      tokens.add(String(token)); url.searchParams.set('page_token', String(token));
    }
    if (!completo && problema !== 'http' && problema !== 'parsing') controlli.push(diagnostica(fonte, 'troncata', ricevute, 0, pagine, problema ?? 'Limite di 10 pagine raggiunto: nessuna news usata, paginazione incompleta.'));
    if (completo) {
      const strutturate = [...righe.values()].map(x => ({ e: newsVerificata(x, ticker), created: Date.parse(String(x['created_at'])) }));
      const valide = strutturate.filter(x => x.e && x.created >= inizio && x.created <= cutoff && Date.parse(x.e.disponibileIl) <= cutoff).flatMap(x => x.e ? [x.e] : []);
      const stato = valide.length ? 'valida' : !ricevute ? 'vuota' : strutturate.some(x => x.e) ? 'fuori_finestra' : 'parsing_non_valido';
      controlli.push(diagnostica(fonte, stato, ricevute, valide.length, pagine, valide.length ? 'Tutte le pagine acquisite; news pertinenti, pubblicazione/aggiornamento entro cutoff.' : !ricevute ? 'Risposta vuota: nessuna news restituita.' : stato === 'fuori_finestra' ? 'News fuori dai 7 giorni o aggiornate dopo cutoff.' : 'News senza timestamp con timezone, URL HTTPS o simbolo pertinente: parsing non valido.'));
      evidenze.push(...valide.sort((a, b) => a.disponibileIl.localeCompare(b.disponibileIl)).slice(-8));
    }
  } catch (e) { controlli.push({ ...erroreFonte(fonte, e, pagine), ricevute }); }
  const uniche = [...new Map(evidenze.map(e => [JSON.stringify(e), e])).values()].sort((a, b) => a.disponibileIl.localeCompare(b.disponibileIl));
  return { evidenze: uniche, diagnostica: controlli, avvisi: controlli.map(d => `${d.fonte}: ${d.motivo}`), mancante: requisitoClasse(classe, uniche.filter(e => e.tipo === 'fondamentali').length, uniche.filter(e => e.tipo === 'news').length) };
}