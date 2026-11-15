import { describe, it, expect } from 'vitest';
import { normalizzaNasdaq } from './universo-autonomo';
const H = 'Nasdaq Traded|Symbol|Security Name|Listing Exchange|Market Category|ETF|Round Lot Size|Test Issue|Financial Status|CQS Symbol|NASDAQ Symbol|NextShares';
const riga = (s: string, nome: string, etf = 'N', extra: Partial<{ traded: string; test: string; stato: string }> = {}) => [extra.traded ?? 'Y', s, nome, 'Q', 'Q', etf, '100', extra.test ?? 'N', extra.stato ?? '', s, s, 'N'].join('|');
const azioni = Array.from({ length: 30 }, (_, i) => riga(`AZ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? 'Z' : ''}`, 'Società Common Stock'));
const testo = [H, ...azioni, riga('SPY', 'SPDR S&P 500 ETF Trust', 'Y'), riga('ABCDW', 'Abc Corp Warrants'), riga('ABCU', 'Abc Corp Units'), riga('X', 'United States Steel Corporation Common Stock'), riga('BRK.B', 'Berkshire Class B Common Stock'), riga('ZTEST', 'Test Common Stock', 'N', { test: 'Y' }), riga('DEF', 'Def Inc Common Stock', 'N', { stato: 'D' }), riga('ADR', 'Foo American Depositary Shares'), riga('ETFZ', 'Zeta Fund', 'Y'), 'File Creation Time: 1113202621:33|||||'].join('\n');

describe('universo Nasdaq Trader', () => {
  it('oltre 20 strumenti, ETF dal flag ufficiale, esclusioni motivate', () => {
    const { universo, esclusi } = normalizzaNasdaq(testo, '2026-11-15T00:00:00Z');
    expect(universo.strumenti.length).toBe(33);
    expect(universo.strumenti.find(s => s.ticker === 'SPY')?.classe).toBe('etf');
    expect(universo.strumenti.find(s => s.ticker === 'ETFZ')?.classe).toBe('etf');
    expect(universo.strumenti.find(s => s.ticker === 'X')?.classe).toBe('azione');
    for (const t of ['ABCDW', 'ABCU', 'BRK.B', 'ZTEST', 'DEF', 'ADR']) { expect(universo.strumenti.some(s => s.ticker === t)).toBe(false); expect(esclusi.find(e => e.ticker === t)?.motivo).toBeTruthy(); }
    expect(universo.strumenti.every(s => s.valuta === 'USD' && s.adjustment === 'split' && s.classe !== 'us_equity_non_classificata')).toBe(true);
    expect(universo.provider).toContain('2026-11-13');
  });
  it('file troncato o formato cambiato: nessun universo parziale', () => {
    expect(() => normalizzaNasdaq(testo.split('\n').slice(0, -1).join('\n'), 'x')).toThrow('troncato');
    expect(() => normalizzaNasdaq(testo.replace('NextShares', 'Altro'), 'x')).toThrow('Formato');
    expect(() => normalizzaNasdaq([H, riga('AAA', 'A Common Stock'), riga('AAA', 'A Common Stock'), 'File Creation Time: 1113202621:33|||||'].join('\n'), 'x')).toThrow('duplicato');
  });
});
