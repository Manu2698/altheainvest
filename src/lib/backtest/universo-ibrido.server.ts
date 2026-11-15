import { catalogoNasdaq } from './universo-nasdaq.server';
import { credenzialiPaperAutonome } from './universo-alpaca.server';
import { normalizzaUniverso, type AssetAutonomo } from './universo-autonomo';
import { universoIbrido } from './acquisizione-ibrida';

export async function catalogoIbrido(userId: string) {
  const nasdaq = await catalogoNasdaq();
  const cred = await credenzialiPaperAutonome(userId);
  const crypto: AssetAutonomo[] = [], avvisi: string[] = [];
  try {
    const r = await fetch(`${cred.base}/v2/assets?status=active&asset_class=crypto`, { headers: cred.headers, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Catalogo crypto Alpaca HTTP ${r.status}`);
    const raw: unknown = await r.json();
    if (!Array.isArray(raw)) throw new Error('Catalogo crypto Alpaca non leggibile');
    for (const row of raw) {
      if (row?.status !== 'active' || row?.tradable !== true) continue;
      try {
        const s = normalizzaUniverso([row], new Date().toISOString()).strumenti[0];
        if (!s || s.classe !== 'crypto' || !/^[A-Z0-9]+\/(USD|EUR)$/.test(s.ticker) || s.valuta !== s.ticker.split('/')[1]) throw new Error('classe, coppia o valuta non supportata');
        if (!crypto.some(c => c.ticker === s.ticker)) crypto.push(s);
      } catch (e) { avvisi.push(`Crypto ${String(row?.symbol ?? 'sconosciuta')} esclusa: ${e instanceof Error ? e.message : 'metadati non validi'}.`); }
    }
  } catch (e) { avvisi.push(`Crypto non acquisite: ${e instanceof Error ? e.message : 'catalogo non disponibile'}. Nessuna copertura crypto dichiarata.`); }
  return { ...universoIbrido(nasdaq, crypto, avvisi), esclusiPerMotivo: nasdaq.esclusiPerMotivo };
}