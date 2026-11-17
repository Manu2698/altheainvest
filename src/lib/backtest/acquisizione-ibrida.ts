import { blocchi, verificaSerie, type AssetAutonomo, type UniversoAutonomo } from './universo-autonomo';
import type { Barra } from './motore';

/** Nasdaq owns equity subtypes; Alpaca crypto metadata never replaces equities. */
export function universoIbrido(nasdaq: UniversoAutonomo, crypto: AssetAutonomo[], avvisi: string[] = []): UniversoAutonomo {
  const azioni = nasdaq.strumenti.map(s => ({ ...s, fonte: 'Nasdaq Trader · Alpaca PAPER IEX · split', adjustment: 'split' as const }));
  const validi = crypto.filter(s => s.classe === 'crypto' && s.mercato === 'crypto' && s.stato === 'active' && s.tradabile && /^[A-Z0-9]+\/(USD|EUR)$/.test(s.ticker) && s.valuta === s.ticker.split('/')[1] && s.adjustment === 'nessuno');
  const strumenti = [...azioni, ...validi.filter(s => !azioni.some(a => a.ticker === s.ticker))];
  return { ...nasdaq, strumenti, provider: `${nasdaq.provider} + Alpaca PAPER/IEX`, totaleAcquisito: nasdaq.totaleAcquisito + crypto.length, classi: [...new Set(strumenti.map(s => s.classe))], avvisi: [
    ...nasdaq.avvisi.filter(a => !/FMP|Crypto escluse|catalogo Alpaca non accessibile/.test(a)),
    'Azioni/ETF: barre Alpaca IEX in USD, adjustment=split richiesto esplicitamente; dividendi non inclusi. IEX non rappresenta tutti gli scambi USA.',
    'Crypto: solo coppie attive USD/EUR verificate dal catalogo Alpaca; copertura storica e FX verificati separatamente, non garantiti dal catalogo.',
    ...avvisi,
  ] };
}
export type StatoAcquisizione = { serie: Record<string, Barra[]>; errori: Record<string, string>; inCorso?: string[] | undefined };
type Dipendenze = {
  prezzi: (s: AssetAutonomo[]) => Promise<{ serie: Record<string, Barra[]>; errori: Record<string, string> }>;
  /** `nuove` = series verified in the just-completed block, for append-only persistence. */
  checkpoint: (s: StatoAcquisizione, nuove?: Record<string, Barra[]>) => Promise<void>;
  stop: () => boolean;
  progresso: (i: number, totale: number, info?: { blocco: string[]; pendenti: number }) => void;
  /** Fixed pause between sequential blocks (rate courtesy); never used to retry. */
  pausa?: () => Promise<void>;
};
export type EsitoAcquisizione = 'completo' | 'interrotto';
/** Block-level failures are global (auth, rate limit, outage, network, timeout, storage): the run pauses, nothing pending is excluded. */
export function tipoErroreGlobale(msg: string): string {
  if (/HTTP (401|403)/.test(msg)) return 'accesso negato (credenziali/permessi)';
  if (/HTTP 429/.test(msg)) return 'limite di richieste raggiunto: attendi qualche minuto prima di riprendere';
  if (/HTTP 5\d\d/.test(msg)) return 'fonte temporaneamente non disponibile';
  if (/timeout|timed out|network|fetch|Failed to fetch|abort/i.test(msg)) return 'rete o timeout';
  if (/quota|checkpoint|IndexedDB|Archivio locale/i.test(msg)) return 'archivio locale (spazio o scrittura)';
  return 'errore di blocco';
}
export function codaPendente(assets: AssetAutonomo[], stato: StatoAcquisizione) {
  return assets.filter(s => !stato.serie[s.ticker] && !stato.errori[s.ticker]);
}
/**
 * Sequential 25-symbol blocks over the whole pending queue (limite=Infinity), no FMP/AI/orders.
 * Bars are read-only GETs merged only after a completed block, so a block interrupted by a closed tab
 * or a thrown error delivered nothing: its symbols simply stay pending and are requested again only
 * on the user's next explicit start (never retried automatically inside a run).
 */
export async function acquisisciBlocchiAlpaca(assets: AssetAutonomo[], stato: StatoAcquisizione, dal: string, al: string, limite: number, dep: Dipendenze): Promise<EsitoAcquisizione> {
  stato.inCorso = undefined;
  const pendenti = codaPendente(assets, stato);
  const max = Number.isFinite(limite) ? Math.max(1, Math.floor(limite)) : pendenti.length;
  const bs = blocchi(pendenti.slice(0, max), 25);
  for (let i = 0; i < bs.length; i++) {
    if (dep.stop()) return 'interrotto';
    if (i > 0 && dep.pausa) await dep.pausa();
    const b = bs[i] ?? [];
    stato.inCorso = b.map(s => s.ticker);
    await dep.checkpoint(stato);
    dep.progresso(i + 1, bs.length, { blocco: stato.inCorso, pendenti: codaPendente(assets, stato).length });
    let r: Awaited<ReturnType<Dipendenze['prezzi']>>;
    try { r = await dep.prezzi(b); }
    catch (e) {
      // Nothing from this block was merged: keep its symbols pending, not excluded.
      stato.inCorso = undefined;
      await dep.checkpoint(stato).catch(() => {});
      const msg = e instanceof Error ? e.message : 'Blocco non riuscito.';
      throw new Error(`Acquisizione in pausa (${tipoErroreGlobale(msg)}): ${msg} Gli strumenti non elaborati restano in coda.`);
    }
    const nuove: Record<string, Barra[]> = {};
    for (const s of b) {
      const errore = r.errori[s.ticker];
      if (errore) { stato.errori[s.ticker] = errore; continue; }
      const barre = r.serie[s.ticker] ?? [];
      try { verificaSerie(s, barre, dal, al); stato.serie[s.ticker] = barre; nuove[s.ticker] = barre; }
      catch (e) { stato.errori[s.ticker] = e instanceof Error ? e.message : 'Serie non verificata.'; }
    }
    stato.inCorso = undefined;
    await dep.checkpoint(stato, nuove);
  }
  return codaPendente(assets, stato).length ? 'interrotto' : 'completo';
}
