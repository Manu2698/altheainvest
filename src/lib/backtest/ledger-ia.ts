/** Pure orchestration of the server-owned AI budget ledger (tables ia_backtest_*). No model or broker imports. */
export type Prenotazione =
  | { esito: 'riservata'; riservate?: number; max?: number }
  | { esito: 'esistente'; stato: string; risultato?: unknown; errore?: string | null }
  | { esito: 'bloccato'; stato?: string; motivo?: string | null }
  | { esito: 'budget'; riservate?: number; max?: number; motivo?: string };
export type StatoChiamata = 'completata' | 'fallita' | 'incerta';
export type StatoRun = 'bloccato' | 'negato' | 'chiuso' | null;
export type Ledger = {
  riserva: (chiave: string, tipo: 'screening' | 'comitato', n: number) => Promise<Prenotazione>;
  chiudi: (chiave: string, stato: StatoChiamata, effettive: number | null, risultato: unknown, errore: string | null, statoRun: StatoRun) => Promise<boolean>;
};
export type EsitoLedger<T> =
  | { stato: 'eseguita' | 'riutilizzata'; risultato: T; motivo: string }
  | { stato: 'negata'; motivo: string; terminale: boolean };

/** Canonical JSON (sorted keys) so the same inputs always produce the same idempotency key. */
export function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map(k => `${JSON.stringify(k)}:${canonico((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
export async function chiaveIdempotenza(tipo: string, input: unknown): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`althea-ia-backtest-v1|${tipo}|${canonico(input)}`));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
/** 402/403 are terminal denials (persisted as run 'negato'); every other failure is uncertain and never replayed. */
export function classificaErrore(e: unknown): { statoChiamata: StatoChiamata; statoRun: Exclude<StatoRun, null>; motivo: string } {
  const status = typeof e === 'object' && e && 'statusCode' in e ? Number((e as { statusCode?: unknown }).statusCode) : NaN;
  const msg = e instanceof Error ? e.message : String(e);
  if (status === 402 || /\b402\b|credit|crediti/i.test(msg)) return { statoChiamata: 'fallita', statoRun: 'negato', motivo: 'Crediti Lovable AI insufficienti: run IA sospeso, nessun reinvio. Serve una nuova azione esplicita dopo la ricarica.' };
  if (status === 403 || /\b403\b|denied|not_enabled|retention|non consentito/i.test(msg)) return { statoChiamata: 'fallita', statoRun: 'negato', motivo: 'Accesso al modello negato: run IA sospeso, nessun reinvio.' };
  if (status === 429 || /\b429\b/.test(msg)) return { statoChiamata: 'fallita', statoRun: 'bloccato', motivo: 'Limite di frequenza Lovable AI: run IA arrestato, nessun reinvio automatico.' };
  return { statoChiamata: 'incerta', statoRun: 'bloccato', motivo: `Esito IA incerto (${msg.slice(0, 160)}): run arrestato, richiesta mai reinviata.` };
}
/** Reserve before dispatch; any persistence doubt prevents dispatch; uncertain work is never re-sent. */
export async function eseguiConLedger<T>(ledger: Ledger, chiave: string, tipo: 'screening' | 'comitato', n: number, dispatch: () => Promise<{ risultato: T; effettive: number }>, valida: (r: unknown) => r is T): Promise<EsitoLedger<T>> {
  if (!/^[0-9a-f]{64}$/.test(chiave)) throw new Error('Chiave idempotenza non valida.');
  const p = await ledger.riserva(chiave, tipo, n);
  if (p.esito === 'esistente') {
    if (p.stato === 'completata' && valida(p.risultato)) return { stato: 'riutilizzata', risultato: p.risultato, motivo: 'Risultato già registrato dal server: nessuna nuova chiamata.' };
    return { stato: 'negata', terminale: true, motivo: `Richiesta identica già tentata (stato ${p.stato}): nessun reinvio.` };
  }
  if (p.esito === 'bloccato') return { stato: 'negata', terminale: true, motivo: `Run IA ${p.stato ?? 'bloccato'}: ${p.motivo ?? 'nessuna nuova chiamata'}.` };
  if (p.esito === 'budget') return { stato: 'negata', terminale: false, motivo: p.motivo === 'limite giornaliero' ? 'Limite giornaliero server IA backtest raggiunto.' : `Budget server esaurito (${p.riservate ?? '?'}/${p.max ?? '?'}).` };
  let out: { risultato: T; effettive: number };
  try {
    out = await dispatch();
    if (!valida(out.risultato) || !Number.isInteger(out.effettive) || out.effettive < 0 || out.effettive > n) throw new Error('Risposta IA incompleta o incoerente.');
  } catch (e) {
    const c = classificaErrore(e);
    await ledger.chiudi(chiave, c.statoChiamata, null, null, c.motivo, c.statoRun).catch(() => false);
    return { stato: 'negata', terminale: true, motivo: c.motivo };
  }
  const chiusa = await ledger.chiudi(chiave, 'completata', out.effettive, out.risultato, null, null).catch(() => false);
  if (!chiusa) return { stato: 'negata', terminale: true, motivo: 'Risultato ricevuto ma non registrato dal server: escluso, richiesta non reinviata.' };
  return { stato: 'eseguita', risultato: out.risultato, motivo: 'Chiamata registrata nel ledger server.' };
}
