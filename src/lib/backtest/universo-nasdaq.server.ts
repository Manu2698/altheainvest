import { normalizzaNasdaq } from './universo-autonomo';
/** Public Nasdaq Trader symbol directory (no key, GET only). Current listing, not a historical universe. */
export async function catalogoNasdaq() {
  const r = await fetch('https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt', { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Nasdaq Trader HTTP ${r.status}: universo non acquisito, nessun fallback.`);
  const testo = await r.text();
  if (testo.length > 8_000_000) throw new Error('Elenco Nasdaq Trader inatteso (troppo grande).');
  const { universo, esclusi } = normalizzaNasdaq(testo, new Date().toISOString());
  const motivi: Record<string, number> = {};
  for (const e of esclusi) motivi[e.motivo] = (motivi[e.motivo] ?? 0) + 1;
  return { ...universo, esclusiPerMotivo: motivi };
}
