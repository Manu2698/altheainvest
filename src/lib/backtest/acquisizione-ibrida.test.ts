import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { acquisisciBlocchiAlpaca, universoIbrido, type StatoAcquisizione } from './acquisizione-ibrida';
import { normalizzaUniverso, type AssetAutonomo, type UniversoAutonomo } from './universo-autonomo';
const asset = (ticker: string, classe: 'azione' | 'etf' = 'azione'): AssetAutonomo => ({ ticker, classe, valuta: 'USD', mercato: 'azioni', fonte: 'Nasdaq', exchange: 'NASDAQ', stato: 'active', tradabile: true, aggiornatoIl: '2026-11-15', adjustment: 'split' });
const barre = Array.from({ length: 51 }, (_, i) => ({ data: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10), apertura: 100, chiusura: 100, volume: 1000 }));
const vuoto = (): StatoAcquisizione => ({ serie: {}, errori: {} });
const periodo = ['2025-01-21', '2025-02-20'] as const;
describe('acquisizione ibrida isolata', () => {
  it('conserva classi Nasdaq, aggiunge solo crypto verificate e non chiama FMP per simbolo', () => {
    const nasdaq: UniversoAutonomo = { strumenti: [asset('AAPL'), asset('SPY', 'etf')], provider: 'Nasdaq', classi: ['azione', 'etf'], avvisi: [], totaleAcquisito: 2, aggiornatoIl: '2026' };
    const crypto = normalizzaUniverso([{ symbol: 'BTC/USD', class: 'crypto', status: 'active', tradable: true }], '2026').strumenti;
    const r = universoIbrido(nasdaq, [...crypto, { ...asset('WRONG'), classe: 'crypto', mercato: 'crypto' }]);
    expect(r.strumenti.map(s => [s.ticker, s.classe])).toEqual([['AAPL', 'azione'], ['SPY', 'etf'], ['BTC/USD', 'crypto']]);
    expect(r.strumenti[1]?.fonte).toContain('Alpaca PAPER');
    const source = readFileSync(new URL('./acquisizione-ibrida.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from.*(?:fmp|ai|comitato|ledger|esecuzione|trading)/i);
    const server = readFileSync(new URL('./universo-ibrido.server.ts', import.meta.url), 'utf8');
    expect(server).not.toMatch(/prezziFMP|leggiFMP|\/orders|chiamaScreening/);
  });
  it('processa oltre 25 in blocchi e riprende il checkpoint senza duplicazioni', async () => {
    const assets = Array.from({ length: 61 }, (_, i) => asset(`T${i}`));
    const s = vuoto(), sizes: number[] = [], checkpoints: string[][] = [];
    const prezzi = vi.fn(async (b: AssetAutonomo[]) => { sizes.push(b.length); return { serie: Object.fromEntries(b.map(a => [a.ticker, barre])), errori: {} }; });
    const dep = { prezzi, checkpoint: async (v: StatoAcquisizione) => { checkpoints.push(Object.keys(v.serie)); }, stop: () => false, progresso: vi.fn() };
    await acquisisciBlocchiAlpaca(assets, s, ...periodo, 40, dep);
    await acquisisciBlocchiAlpaca(assets, s, ...periodo, 40, dep);
    expect(sizes).toEqual([25, 15, 21]);
    expect(Object.keys(s.serie)).toHaveLength(61);
    expect(checkpoints).toHaveLength(6);
    await acquisisciBlocchiAlpaca(assets, s, ...periodo, 40, dep);
    expect(prezzi).toHaveBeenCalledTimes(3);
  });
  it('errore per simbolo resta visibile, errore HTTP blocca senza escludere la coda', async () => {
    const s = vuoto(); let count = 0;
    const prezzi = vi.fn(async (b: AssetAutonomo[]) => { count++; if (count === 2) throw new Error('Storico Alpaca HTTP 403: blocco interrotto'); return { serie: Object.fromEntries(b.slice(1).map(a => [a.ticker, barre])), errori: { T0: 'Serie assente' } }; });
    await expect(acquisisciBlocchiAlpaca(Array.from({ length: 30 }, (_, i) => asset(`T${i}`)), s, ...periodo, 30, { prezzi, checkpoint: async () => {}, stop: () => false, progresso: vi.fn() })).rejects.toThrow('HTTP 403');
    expect(s.errori).toEqual({ T0: 'Serie assente' });
    expect(s.serie['T25']).toBeUndefined(); expect(s.inCorso).toBeUndefined(); expect(prezzi).toHaveBeenCalledTimes(2);
  });
  it('esito incerto persistito non viene reinviato dopo interruzione', async () => {
    const s = vuoto(), prezzi = vi.fn(async () => { throw new Error('network timeout'); });
    const dep = { prezzi, checkpoint: async () => {}, stop: () => false, progresso: vi.fn() };
    await expect(acquisisciBlocchiAlpaca([asset('AAPL')], s, ...periodo, 50, dep)).rejects.toThrow('timeout');
    expect(prezzi).toHaveBeenCalledTimes(1); expect(s.inCorso).toBeUndefined(); expect(s.errori['AAPL']).toBeUndefined();
  });
  it('rifiuta split non verificato, meno di 20 barre precedenti e crypto con lacune', async () => {
    const s = vuoto(), crypto = normalizzaUniverso([{ symbol: 'BTC/USD', class: 'crypto', status: 'active', tradable: true }], '2026').strumenti[0];
    if (!crypto) throw new Error('fixture assente');
    await acquisisciBlocchiAlpaca([{ ...asset('BAD'), adjustment: 'non_verificato' }, asset('SHORT'), crypto], s, ...periodo, 100, {
      prezzi: async () => ({ serie: { BAD: barre, SHORT: barre.slice(1), 'BTC/USD': barre.filter((_, i) => i !== 30) }, errori: {} }), checkpoint: async () => {}, stop: () => false, progresso: vi.fn(),
    });
    expect(s.errori['BAD']).toContain('split'); expect(s.errori['SHORT']).toContain('Copertura'); expect(s.errori['BTC/USD']).toContain('Lacuna'); expect(Object.keys(s.serie)).toHaveLength(0);
  });
});
describe('intero universo', () => {
  it('oltre 2000 simboli in blocchi da 25, stop tra blocchi e 429 lascia pendenti', async () => {
    const assets = Array.from({ length: 2101 }, (_, i) => asset(`U${i}`)); const s = vuoto(); let n = 0, ferma = false;
    const prezzi = vi.fn(async (b: AssetAutonomo[]) => { n++; if (n === 3) ferma = true; return { serie: Object.fromEntries(b.map(a => [a.ticker, barre])), errori: {} }; });
    expect(await acquisisciBlocchiAlpaca(assets, s, ...periodo, Infinity, { prezzi, checkpoint: async () => {}, stop: () => ferma, progresso: vi.fn() })).toBe('interrotto');
    expect(Object.keys(s.serie)).toHaveLength(75);
    const p2 = vi.fn(async () => { throw new Error('Storico Alpaca HTTP 429'); });
    await expect(acquisisciBlocchiAlpaca(assets, s, ...periodo, Infinity, { prezzi: p2, checkpoint: async () => {}, stop: () => false, progresso: vi.fn() })).rejects.toThrow('limite di richieste');
    expect(Object.keys(s.errori)).toHaveLength(0);
    expect(await acquisisciBlocchiAlpaca(assets, s, ...periodo, Infinity, { prezzi, checkpoint: async () => {}, stop: () => false, progresso: vi.fn() })).toBe('completo');
    expect(Object.keys(s.serie)).toHaveLength(2101);
  });
});
