import { describe, it, expect, vi } from 'vitest';
import { eseguiConLedger, chiaveIdempotenza, classificaErrore, canonico, type Ledger, type Prenotazione } from './ledger-ia';

/** In-memory replica of ia_backtest_riserva/chiudi semantics, serialized like the SQL advisory lock. */
function ledgerFinto(max: number) {
  const run = { riservate: 0, max, stato: 'attivo' as string, motivo: null as string | null };
  const chiamate = new Map<string, { stato: string; riservate: number; risultato: unknown }>();
  let coda = Promise.resolve();
  const lock = <T,>(f: () => T) => { const p = coda.then(f); coda = p.then(() => undefined, () => undefined); return p; };
  const l: Ledger = {
    riserva: (k, _t, n) => lock((): Prenotazione => {
      const c = chiamate.get(k); if (c) return { esito: 'esistente', stato: c.stato, risultato: c.risultato };
      if (run.stato !== 'attivo') return { esito: 'bloccato', stato: run.stato, motivo: run.motivo };
      if (run.riservate + n > run.max) return { esito: 'budget', riservate: run.riservate, max: run.max };
      chiamate.set(k, { stato: 'riservata', riservate: n, risultato: null }); run.riservate += n; return { esito: 'riservata' };
    }),
    chiudi: (k, stato, eff, ris, err, sr) => lock(() => {
      const c = chiamate.get(k); if (!c || c.stato !== 'riservata') return false;
      c.stato = stato; c.risultato = ris; if (stato === 'completata' && eff !== null && eff < c.riservate) run.riservate -= c.riservate - eff;
      if (sr && run.stato === 'attivo') { run.stato = sr; run.motivo = err; } return true;
    }),
  };
  return { l, run, chiamate };
}
const k = (i: number) => i.toString(16).padStart(64, '0');
const ok = (r: unknown): r is string => typeof r === 'string';

describe('ledger IA server', () => {
  it('prenotazioni concorrenti non superano il budget del run', async () => {
    const { l, run } = ledgerFinto(5); const dispatch = vi.fn(async () => ({ risultato: 'x', effettive: 1 }));
    const r = await Promise.all(Array.from({ length: 20 }, (_, i) => eseguiConLedger(l, k(i), 'screening', 1, dispatch, ok)));
    expect(dispatch).toHaveBeenCalledTimes(5); expect(r.filter(x => x.stato === 'eseguita')).toHaveLength(5); expect(run.riservate).toBe(5);
  });
  it('richiesta identica completata viene riutilizzata senza nuova chiamata, anche in concorrenza', async () => {
    const { l } = ledgerFinto(10); const dispatch = vi.fn(async () => ({ risultato: 'v', effettive: 1 }));
    const [a, b] = await Promise.all([eseguiConLedger(l, k(1), 'screening', 1, dispatch, ok), eseguiConLedger(l, k(1), 'screening', 1, dispatch, ok)]);
    expect(dispatch).toHaveBeenCalledTimes(1); expect([a.stato, b.stato].sort()).toEqual(['eseguita', 'negata']);
    const c = await eseguiConLedger(l, k(1), 'screening', 1, dispatch, ok); expect(c.stato).toBe('riutilizzata'); expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it('errore incerto blocca il run: nessun reinvio né nuove chiamate', async () => {
    const { l, run } = ledgerFinto(10); const fail = vi.fn(async () => { throw new Error('timeout rete'); });
    expect((await eseguiConLedger(l, k(1), 'screening', 1, fail, ok)).stato).toBe('negata'); expect(run.stato).toBe('bloccato');
    const dispatch = vi.fn(async () => ({ risultato: 'x', effettive: 1 }));
    expect((await eseguiConLedger(l, k(1), 'screening', 1, dispatch, ok)).stato).toBe('negata');
    expect((await eseguiConLedger(l, k(2), 'screening', 1, dispatch, ok)).stato).toBe('negata'); expect(dispatch).not.toHaveBeenCalled();
  });
  it('402/403 sono rifiuti terminali persistiti come negato', async () => {
    for (const e of [Object.assign(new Error('Payment required'), { statusCode: 402 }), new Error('HTTP 403 denied')]) {
      const { l, run } = ledgerFinto(10); await eseguiConLedger(l, k(1), 'screening', 1, async () => { throw e; }, ok); expect(run.stato).toBe('negato');
    }
    expect(classificaErrore(new Error('Test sospeso: crediti Lovable AI insufficienti')).statoRun).toBe('negato');
    expect(classificaErrore(new Error('boh')).statoChiamata).toBe('incerta');
  });
  it('risposta incoerente non viene accettata e non viene reinviata', async () => {
    const { l, run } = ledgerFinto(10); const bad = vi.fn(async () => ({ risultato: 42 as unknown as string, effettive: 1 }));
    expect((await eseguiConLedger(l, k(1), 'screening', 1, bad, ok)).stato).toBe('negata'); expect(run.stato).toBe('bloccato');
    await eseguiConLedger(l, k(1), 'screening', 1, bad, ok); expect(bad).toHaveBeenCalledTimes(1);
  });
  it('chiusura non confermata: risultato escluso e mai reinviato', async () => {
    const { l } = ledgerFinto(10); const rotto: Ledger = { ...l, chiudi: async () => { throw new Error('db giù'); } };
    const dispatch = vi.fn(async () => ({ risultato: 'x', effettive: 1 }));
    expect((await eseguiConLedger(rotto, k(1), 'screening', 1, dispatch, ok)).stato).toBe('negata');
    expect((await eseguiConLedger(l, k(1), 'screening', 1, dispatch, ok)).stato).toBe('negata'); expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it('prenotazione fallita impedisce l’invio', async () => {
    const { l } = ledgerFinto(10); const dispatch = vi.fn();
    await expect(eseguiConLedger({ ...l, riserva: async () => { throw new Error('rpc'); } }, k(1), 'comitato', 9, dispatch, ok)).rejects.toThrow('rpc'); expect(dispatch).not.toHaveBeenCalled();
  });
  it('comitato libera solo le chiamate non usate; budget zero/insufficiente nega', async () => {
    const { l, run } = ledgerFinto(9); await eseguiConLedger(l, k(1), 'comitato', 9, async () => ({ risultato: 'h', effettive: 3 }), ok); expect(run.riservate).toBe(3);
    const d = vi.fn(); expect((await eseguiConLedger(l, k(2), 'comitato', 9, d, ok)).stato).toBe('negata'); expect(d).not.toHaveBeenCalled();
  });
  it('chiave idempotente indipendente dall’ordine dei campi', async () => {
    expect(canonico({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonico({ a: [2, { c: 2, d: 1 }], b: 1 }));
    const a = await chiaveIdempotenza('screening', { x: 1, y: 2 }); expect(a).toMatch(/^[0-9a-f]{64}$/); expect(await chiaveIdempotenza('screening', { y: 2, x: 1 })).toBe(a); expect(await chiaveIdempotenza('comitato', { x: 1, y: 2 })).not.toBe(a);
  });
});
