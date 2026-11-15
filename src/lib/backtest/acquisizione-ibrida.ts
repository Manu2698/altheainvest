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
  checkpoint: (s: StatoAcquisizione) => Promise<void>;
  stop: () => boolean;
  progresso: (i: number, totale: number) => void;
};
/** Sequential blocks, no FMP/AI/orders. Persist intent before dispatch and completed blocks before continuing. */
export async function acquisisciBlocchiAlpaca(assets: AssetAutonomo[], stato: StatoAcquisizione, dal: string, al: string, limite: number, dep: Dipendenze) {
  if (stato.inCorso?.length) throw new Error(`Blocco con esito incerto: ${stato.inCorso.join(', ')}. Nessun reinvio automatico; verificare prima di una nuova acquisizione.`);
  const coda = assets.filter(s => !stato.serie[s.ticker] && !stato.errori[s.ticker]).slice(0, Math.max(1, Math.floor(limite)));
  const bs = blocchi(coda, 25);
  for (let i = 0; i < bs.length && !dep.stop(); i++) {
    const b = bs[i] ?? [];
    stato.inCorso = b.map(s => s.ticker);
    await dep.checkpoint(stato);
    dep.progresso(i + 1, bs.length);
    let r: Awaited<ReturnType<Dipendenze['prezzi']>>;
    try { r = await dep.prezzi(b); }
    catch (e) {
      // A definite HTTP refusal did not deliver data: keep symbols pending, not excluded.
      if (/HTTP \d{3}/.test(e instanceof Error ? e.message : '')) stato.inCorso = undefined;
      await dep.checkpoint(stato);
      throw e;
    }
    for (const s of b) {
      const errore = r.errori[s.ticker];
      if (errore) { stato.errori[s.ticker] = errore; continue; }
      const barre = r.serie[s.ticker] ?? [];
      try { verificaSerie(s, barre, dal, al); stato.serie[s.ticker] = barre; }
      catch (e) { stato.errori[s.ticker] = e instanceof Error ? e.message : 'Serie non verificata.'; }
    }
    stato.inCorso = undefined;
    await dep.checkpoint(stato);
  }
  return stato;
}