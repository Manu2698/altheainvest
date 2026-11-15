import { describe, it, expect } from 'vitest';
import { eleggibiliScreening, candidatiComitato, statoIA, type StatoIA } from './ia-autonoma';
import { rifiltraInput } from './screening-autonomo';
import { blocchi, type AssetAutonomo } from './universo-autonomo';
const barre = Array.from({ length: 60 }, (_, i) => ({ data: new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10), apertura: 10 + i, chiusura: 10 + i, volume: 100 }));
const asset = (t: string, classe: AssetAutonomo['classe'] = 'azione'): AssetAutonomo => ({ ticker: t, classe, valuta: 'USD', mercato: 'azioni', fonte: 'f', exchange: 'Q', stato: 'active', tradabile: true, aggiornatoIl: '', adjustment: 'split' });
const assets = [...Array.from({ length: 35 }, (_, i) => asset(`T${String(i).padStart(2, '0')}`, i % 2 ? 'etf' : 'azione')), asset('NC', 'us_equity_non_classificata'), asset('CORTO')];
const serie = Object.fromEntries(assets.map(a => [a.ticker, a.ticker === 'CORTO' ? barre.slice(0, 10) : barre]));

describe('screening IA autonomo', () => {
  it('ogni eleggibile (oltre 20) è incluso, esclusi non classificati e serie corte; blocchi da 10', () => {
    const e = eleggibiliScreening(assets, serie, '2025-02-15');
    expect(e).toHaveLength(35); expect(e.some(i => i.ticker === 'NC' || i.ticker === 'CORTO')).toBe(false);
    expect(blocchi(e, 10).map(b => b.length)).toEqual([10, 10, 10, 5]);
  });
  it('point-in-time: nessuna barra del giorno simulato o successiva, anche se il client la invia', () => {
    const [i] = eleggibiliScreening(assets.slice(0, 1), serie, '2025-02-15');
    expect(i?.barre.at(-1)?.data).toBe('2025-02-14');
    const manomesso = rifiltraInput({ ...i!, barre: barre, evidenze: [{ ticker: 'T00', tipo: 'news', fonte: 'f', disponibileIl: '2025-03-01T00:00:00Z', efficaceIl: '2025-03-01T00:00:00Z', contenuto: 'futuro' }] });
    expect(manomesso.barre.every(b => b.data < '2025-02-15')).toBe(true); expect(manomesso.evidenze).toHaveLength(0);
  });
  it('COMPLETE solo con screening di tutti gli eleggibili e comitato reale sui migliori 3', () => {
    const tick = eleggibiliScreening(assets, serie, '2025-02-15').map(i => i.ticker);
    const s: StatoIA = { runId: 'r', screening: {}, comitati: {}, messaggi: [] };
    for (const t of tick.slice(0, 34)) s.screening[t] = { ticker: t, verdetto: t < 'T05' ? 'BUY' : 'HOLD', priorita: Number(t.slice(1)), motivazione: 'm' };
    expect(statoIA(tick, s, 3).completo).toBe(false);
    s.screening['T34'] = { ticker: 'T34', verdetto: 'HOLD', priorita: 0, motivazione: 'm' };
    expect(candidatiComitato(s.screening, 3)).toEqual(['T04', 'T03', 'T02']);
    s.comitati['T04'] = { stato: 'eseguito', approvato: true, azione: 'BUY', motivo: 'ok', chiamate: 9 };
    s.comitati['T03'] = { stato: 'eseguito', approvato: false, azione: 'HOLD', motivo: 'veto', chiamate: 8 };
    s.comitati['T02'] = { stato: 'non_eseguibile', motivo: 'notizie assenti' };
    expect(statoIA(tick, s, 3).completo).toBe(false);
    s.comitati['T02'] = { stato: 'eseguito', approvato: false, azione: 'HOLD', motivo: 'attendi', chiamate: 9 };
    const st = statoIA(tick, s, 3); expect(st.completo).toBe(true); expect(st.approvati).toEqual(['T04']);
  });
});
