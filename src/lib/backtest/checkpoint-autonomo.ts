import type { Barra } from './motore';

/**
 * Owner-scoped IndexedDB checkpoint. v2 stored everything (including all bars) in one record;
 * the metadata record now lists `tickerSerie` and bars live one row per ticker in `serie`,
 * written append-only in the same transaction as the metadata. Legacy records are read as-is
 * and migrated on their first save (all inline series written once).
 */
type ConSerie = { dati: { serie: Record<string, Barra[]> } };
export type MetaCheckpoint<T> = T & { serieSeparate?: boolean; tickerSerie?: string[] };

/** Pure: split a checkpoint into a light metadata record and the series not yet persisted. */
export function separaSerie<T extends ConSerie>(valore: T, persistite: ReadonlySet<string>) {
  const serie = valore.dati.serie;
  const nuove: Record<string, Barra[]> = {};
  for (const [t, b] of Object.entries(serie)) if (!persistite.has(t)) nuove[t] = b;
  const meta = { ...valore, dati: { ...valore.dati, serie: {} }, serieSeparate: true, tickerSerie: Object.keys(serie) } as MetaCheckpoint<T>;
  return { meta, nuove };
}
/** Pure: rebuild a checkpoint; legacy inline records pass through; stale rows not listed are ignored. */
export function ricomponiSerie<T extends ConSerie>(meta: MetaCheckpoint<T>, righe: Record<string, Barra[]>): { valore: T; persistite: Set<string> } {
  if (!meta.serieSeparate) return { valore: meta, persistite: new Set() };
  const serie: Record<string, Barra[]> = {};
  for (const t of meta.tickerSerie ?? []) { const b = righe[t]; if (b) serie[t] = b; }
  const { serieSeparate: _s, tickerSerie: _t, ...resto } = meta;
  return { valore: { ...(resto as unknown as T), dati: { ...meta.dati, serie } }, persistite: new Set(Object.keys(serie)) };
}

const apri = () => new Promise<IDBDatabase>((resolve, reject) => {
  const r = indexedDB.open('althea-autonomo-v2', 2);
  r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('checkpoint')) db.createObjectStore('checkpoint'); if (!db.objectStoreNames.contains('serie')) db.createObjectStore('serie'); };
  r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error('Archivio locale non disponibile.'));
});
const fine = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(new Error(`Salvataggio checkpoint fallito${tx.error?.name === 'QuotaExceededError' ? ' (spazio locale esaurito)' : ''}: scansione arrestata.`));
  tx.onabort = () => reject(new Error(`Salvataggio checkpoint annullato${tx.error?.name === 'QuotaExceededError' ? ' (spazio locale esaurito)' : ''}.`));
});

export async function caricaCheckpoint<T extends ConSerie>(owner: string, chiave: string): Promise<{ valore: T; persistite: Set<string> } | null> {
  const db = await apri();
  try {
    const tx = db.transaction(['checkpoint', 'serie'], 'readonly'), key = JSON.stringify([owner, chiave]);
    let meta: MetaCheckpoint<T> | undefined; const righe: Record<string, Barra[]> = {};
    const m = tx.objectStore('checkpoint').get(key);
    m.onsuccess = () => {
      meta = m.result as MetaCheckpoint<T> | undefined;
      if (!meta?.serieSeparate) return;
      const c = tx.objectStore('serie').openCursor(IDBKeyRange.bound([key, ''], [key, '\uffff']));
      c.onsuccess = () => { const cur = c.result; if (!cur) return; righe[(cur.key as string[])[1] ?? ''] = cur.value as Barra[]; cur.continue(); };
    };
    await fine(tx);
    return meta ? ricomponiSerie(meta, righe) : null;
  } finally { db.close(); }
}
/** One transaction: new series rows + metadata, so a crash never leaves metadata pointing at missing rows. */
export async function salvaCheckpoint<T extends ConSerie>(owner: string, chiave: string, valore: T, persistite: Set<string>): Promise<void> {
  const { meta, nuove } = separaSerie(valore, persistite);
  const db = await apri();
  try {
    const tx = db.transaction(['checkpoint', 'serie'], 'readwrite'), key = JSON.stringify([owner, chiave]), st = tx.objectStore('serie');
    for (const [t, b] of Object.entries(nuove)) st.put(b, [key, t]);
    tx.objectStore('checkpoint').put(meta, key);
    await fine(tx);
  } finally { db.close(); }
  for (const t of Object.keys(nuove)) persistite.add(t);
  for (const t of [...persistite]) if (!valore.dati.serie[t]) persistite.delete(t);
}
