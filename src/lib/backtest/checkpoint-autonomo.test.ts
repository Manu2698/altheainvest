import { describe, it, expect } from 'vitest';
import { separaSerie, ricomponiSerie } from './checkpoint-autonomo';
const b = [{ data: '2025-01-01', apertura: 1, chiusura: 1, volume: 1 }];
describe('checkpoint incrementale', () => {
  it('scrive solo serie nuove e legge i checkpoint legacy', () => {
    const v = { dati: { serie: { A: b, B: b } } };
    const { meta, nuove } = separaSerie(v, new Set(['A']));
    expect(Object.keys(nuove)).toEqual(['B']); expect(meta.dati.serie).toEqual({});
    expect(ricomponiSerie(meta, { A: b, B: b, STALE: b }).valore.dati.serie).toEqual({ A: b, B: b });
    expect(ricomponiSerie(v, {}).valore).toBe(v);
  });
});
