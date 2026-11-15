import { describe, expect, it, vi } from 'vitest';
import { caricaEvidenzeAutonome } from './evidenze-autonome.server';
import { conEvidenzeSufficienti, erroreFonte, requisitoClasse } from './evidenze-autonome';

// Offline fixtures exercise parsing and control flow; these are NOT evidence of provider availability.
const news = { id: 1, symbols: ['AAPL'], created_at: '2025-06-30T09:00:00Z', updated_at: '2025-06-30T10:00:00Z', headline: 'Fixture', url: 'https://example.org/offline' };
const bilancio = { symbol: 'AAPL', filingDate: '2025-06-29', revenue: 100 };
function deps(pages: unknown[] = [{ news: [news] }], statements: unknown = [bilancio]) {
  let i = 0;
  return { fmp: vi.fn(async () => statements), paper: vi.fn(async () => ({ headers: {} })), fetch: vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(pages[i++]), { status: 200 })) };
}
describe('requisiti evidenze del comitato autonomo (offline)', () => {
  it('azioni: richiede bilanci e news, non bastano le sole news', () => {
    expect(requisitoClasse('azione', 1, 1)).toBeNull();
    expect(requisitoClasse('azione', 0, 1)).toContain('bilanci societari');
    expect(requisitoClasse('azione', 1, 0)).toContain('news pertinenti');
  });
  it.each(['etf', 'crypto'] as const)('%s: non interroga bilanci e non usa profili correnti come dati storici', async classe => {
    const d = deps(); const r = await caricaEvidenzeAutonome('owner', 'AAPL', '2025-07-01', classe, d);
    expect(d.fmp).not.toHaveBeenCalled(); expect(r.mancante).toContain('bilanci societari non richiesti');
    expect(r.diagnostica[0]?.stato).toBe('non_disponibile');
  });
  it('la classe non verificata non può eseguire il comitato', () => expect(requisitoClasse('us_equity_non_classificata', 1, 1)).toContain('non verificata'));
  it('accetta pubblicazione/news prima del cutoff, non data fiscale', async () => {
    const r = await caricaEvidenzeAutonome('owner', 'AAPL', '2025-07-01', 'azione', deps());
    expect(r.mancante).toBeNull(); expect(r.evidenze).toHaveLength(2);
    expect(r.evidenze.every(e => Date.parse(e.disponibileIl) <= Date.parse('2025-07-01T00:00:00Z'))).toBe(true);
  });
  it('distingue bilancio futuro e pubblicazione assente', async () => {
    const future = await caricaEvidenzeAutonome('o', 'AAPL', '2025-07-01', 'azione', deps(undefined, [{ ...bilancio, filingDate: '2025-07-01' }]));
    expect(future.diagnostica[0]?.stato).toBe('fuori_finestra');
    const invalid = await caricaEvidenzeAutonome('o', 'AAPL', '2025-07-01', 'azione', deps(undefined, [{ symbol: 'AAPL', date: '2025-01-01', revenue: 100 }]));
    expect(invalid.diagnostica[0]?.stato).toBe('parsing_non_valido');
  });
  it('legge tutte le pagine e deduplica notizie identiche', async () => {
    const d = deps([{ news: [news], next_page_token: 'next' }, { news: [news, { ...news, id: 2, url: 'https://example.org/second' }] }]);
    const r = await caricaEvidenzeAutonome('o', 'AAPL', '2025-07-01', 'azione', d);
    expect(d.fetch).toHaveBeenCalledTimes(2);
    expect(String(d.fetch.mock.calls[1]?.[0])).toContain('page_token=next');
    expect(r.diagnostica.at(-1)).toMatchObject({ stato: 'valida', pagine: 2, ricevute: 3, valide: 2 });
  });
  it('token ripetuti: scarta anche le news valide già ricevute', async () => {
    const r = await caricaEvidenzeAutonome('o', 'AAPL', '2025-07-01', 'azione', deps([{ news: [news], next_page_token: 'x' }, { news: [], next_page_token: 'x' }]));
    expect(r.evidenze.filter(e => e.tipo === 'news')).toHaveLength(0); expect(r.diagnostica.at(-1)?.stato).toBe('troncata');
  });
  it('limite di pagine: nessuna evidenza da campione troncato', async () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({ news: [news], next_page_token: String(i) }));
    const d = deps(pages); const r = await caricaEvidenzeAutonome('o', 'AAPL', '2025-07-01', 'azione', d);
    expect(d.fetch).toHaveBeenCalledTimes(10); expect(r.diagnostica.at(-1)?.stato).toBe('troncata');
    expect(r.evidenze.some(e => e.tipo === 'news')).toBe(false);
  });
  it('un errore sulla seconda pagina invalida tutto, senza retry', async () => {
    const d = deps(); let n = 0;
    d.fetch = vi.fn(async () => ++n === 1 ? new Response(JSON.stringify({ news: [news], next_page_token: 'x' })) : new Response('', { status: 403 }));
    const r = await caricaEvidenzeAutonome('o', 'AAPL', '2025-07-01', 'azione', d);
    expect(d.fetch).toHaveBeenCalledTimes(2); expect(r.diagnostica.at(-1)).toMatchObject({ stato: 'http', http: 403, valide: 0 });
    expect(r.evidenze.some(e => e.tipo === 'news')).toBe(false);
  });
  it('news aggiornate al cutoff sono accettate, dopo cutoff/vecchie/timezone assente escluse', async () => {
    const d = deps([{ news: [{ ...news, updated_at: '2025-07-01T00:00:00Z' }, { ...news, id: 2, updated_at: '2025-07-01T00:00:01Z' }, { ...news, id: 3, created_at: '2025-06-01T10:00:00Z' }, { ...news, id: 4, created_at: '2025-06-30T09:00:00' }] }]);
    const r = await caricaEvidenzeAutonome('o', 'AAPL', '2025-07-01', 'azione', d);
    expect(r.evidenze.filter(e => e.tipo === 'news')).toHaveLength(1);
    expect(r.evidenze.find(e => e.tipo === 'news')?.disponibileIl).toBe('2025-07-01T00:00:00.000Z');
  });
  it.each([
    [{ news: [] }, 'vuota'],
    [{ news: [{ ...news, updated_at: '2025-07-02T00:00:00Z' }] }, 'fuori_finestra'],
    [{ news: [{ ...news, symbols: ['MSFT'] }] }, 'parsing_non_valido'],
    [{ wrong: [] }, 'parsing_non_valido'],
  ])('diagnostica vuoto/fuori finestra/formato senza messaggio generico', async (page, stato) => {
    const r = await caricaEvidenzeAutonome('o', 'AAPL', '2025-07-01', 'azione', deps([page]));
    expect(r.diagnostica.at(-1)?.stato).toBe(stato);
  });
  it.each([401, 402, 403, 429])('HTTP %s conserva status senza esporre corpo o segreti', status => {
    const r = erroreFonte('FMP', new Error(`HTTP ${status} https://bad?apikey=DO_NOT_EXPOSE`));
    expect(r.http).toBe(status); expect(JSON.stringify(r)).not.toContain('DO_NOT_EXPOSE');
  });
  it('distingue collegamento, rete e JSON invalido', () => {
    expect(erroreFonte('FMP', new Error('FMP non collegato')).stato).toBe('credenziali');
    expect(erroreFonte('FMP', new Error('timeout')).stato).toBe('rete');
    expect(erroreFonte('FMP', new SyntaxError('bad json')).stato).toBe('parsing_non_valido');
  });
  it.each(['azione', 'etf', 'crypto'] as const)('%s non eseguibile: zero prenotazioni ledger e zero chiamate modello', async classe => {
    const ev = await caricaEvidenzeAutonome('o', 'AAPL', '2025-07-01', classe, deps([{ news: [] }], []));
    const riserva = vi.fn(), modello = vi.fn();
    const r = await conEvidenzeSufficienti(ev, async () => { riserva(); modello(); return 'called'; });
    expect(r).toMatchObject({ stato: 'non_eseguibile' }); expect(riserva).not.toHaveBeenCalled(); expect(modello).not.toHaveBeenCalled();
  });
  it('evidenze sufficienti: passa al percorso esistente una sola volta', async () => {
    const ev = await caricaEvidenzeAutonome('o', 'AAPL', '2025-07-01', 'azione', deps());
    const dispatch = vi.fn(async () => 'offline'); expect(await conEvidenzeSufficienti(ev, dispatch)).toBe('offline'); expect(dispatch).toHaveBeenCalledTimes(1);
  });
});