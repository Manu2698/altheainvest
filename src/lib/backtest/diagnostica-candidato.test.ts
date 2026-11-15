import { describe, it, expect, vi } from 'vitest';
import { diagnosticaCandidato, richiestaDiagnosticaSchema } from './diagnostica-candidato';
import { sezioniDiagnostica, conDiagnosi, type StatoIA } from './ia-autonoma';
import { readFileSync } from 'node:fs';

const v = (ticker: string, verdetto: 'BUY' | 'HOLD', priorita: number) => ({ ticker, verdetto, priorita, motivazione: '' });
const base: StatoIA = { runId: null, screening: { AAPL: v('AAPL', 'BUY', 9), SPY: v('SPY', 'BUY', 8), 'BTC/USD': v('BTC/USD', 'BUY', 7), MSFT: v('MSFT', 'HOLD', 10), NVDA: v('NVDA', 'BUY', 1) }, comitati: {}, messaggi: [] };
const cand = [{ ticker: 'AAPL', classe: 'azione' as const }, { ticker: 'SPY', classe: 'etf' as const }];

describe('diagnostica candidati comitato', () => {
  it('mostra i 3 migliori BUY anche con comitati vuoti, senza inventare risultati', () => {
    const s = sezioniDiagnostica(base);
    expect(s.map(x => x.ticker)).toEqual(['AAPL', 'SPY', 'BTC/USD']);
    expect(s.every(x => x.origine === 'mancante' && !x.comitato && !x.diagnosi)).toBe(true);
  });
  it('conserva diagnostica e comitati esistenti', () => {
    const conCom: StatoIA = { ...base, comitati: { AAPL: { stato: 'eseguito', approvato: true, azione: 'BUY', motivo: 'ok', chiamate: 9, diagnostica: [{ fonte: 'FMP', stato: 'valida', http: 200, ricevute: 4, valide: 4, pagine: 1, motivo: '' }] } } };
    const s = conDiagnosi(conCom, { ticker: 'AAPL', classe: 'azione', data: '2025-07-01', diagnostica: [], avvisi: [], mancante: null, validi: 0, acquisitaIl: 'x' });
    expect(s.comitati['AAPL']).toBe(conCom.comitati['AAPL']);
    expect(sezioniDiagnostica(s)[0]?.origine).toBe('comitato');
  });
  it('la funzione diagnostica usa solo il caricatore di evidenze e riporta ETF senza fonti', async () => {
    const carica = vi.fn(async () => ({ evidenze: [], avvisi: ['Nessuna fonte ETF storica configurata'], diagnostica: [{ fonte: 'ETF', stato: 'non_disponibile' as const, http: null, ricevute: 0, valide: 0, pagine: 0, motivo: 'fonte ETF point-in-time non disponibile' }], mancante: 'dati fondo ETF point-in-time' }));
    const r = await diagnosticaCandidato('u', { ticker: 'SPY', classe: 'etf', data: '2025-07-01', candidati: cand }, carica, () => 't');
    expect(carica).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ ticker: 'SPY', mancante: 'dati fondo ETF point-in-time', validi: 0 });
  });
  it('propaga gli errori senza produrre diagnosi', async () => {
    await expect(diagnosticaCandidato('u', { ticker: 'AAPL', classe: 'azione', data: '2025-07-01', candidati: cand }, async () => { throw new Error('rete'); })).rejects.toThrow('rete');
  });
  it('rifiuta ticker/classe incoerenti, date future e campi arbitrari', () => {
    expect(() => richiestaDiagnosticaSchema.parse({ ticker: 'MSFT', classe: 'azione', data: '2025-07-01', candidati: cand })).toThrow();
    expect(() => richiestaDiagnosticaSchema.parse({ ticker: 'SPY', classe: 'azione', data: '2025-07-01', candidati: cand })).toThrow();
    expect(() => richiestaDiagnosticaSchema.parse({ ticker: 'AAPL', classe: 'azione', data: '2999-01-01', candidati: cand })).toThrow();
    expect(richiestaDiagnosticaSchema.parse({ ticker: 'AAPL', classe: 'azione', data: '2025-07-01', candidati: cand, endpoint: 'http://x' })).not.toHaveProperty('endpoint');
  });
  it('il modulo non importa ledger, screening, comitato o modelli', () => {
    const src = readFileSync('src/lib/backtest/diagnostica-candidato.ts', 'utf8').split('\n').filter(l => /import/.test(l)).join('\n');
    expect(src).not.toMatch(/ledger|screening|comitato|ai-gateway|ordini|broker/i);
  });
});
