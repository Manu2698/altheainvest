import { validaBarre, type Barra } from './motore';
import type { StrumentoStorico } from './autonomo';

export type ClasseAutonoma = 'azione' | 'etf' | 'crypto' | 'us_equity_non_classificata';
export type AssetAutonomo = StrumentoStorico & { classe: ClasseAutonoma; exchange: string; stato: string; tradabile: boolean; aggiornatoIl: string; adjustment: 'split' | 'nessuno' | 'non_verificato' };
export type UniversoAutonomo = { strumenti: AssetAutonomo[]; avvisi: string[]; provider: string; aggiornatoIl: string; totaleAcquisito: number; classi: ClasseAutonoma[] };

/** Alpaca's us_equity includes ETFs: absence of authoritative subtype is NOT proof of stock classification. */
export function classificaAsset(r: Record<string, unknown>): ClasseAutonoma {
  if (r['class'] === 'crypto') return 'crypto';
  if (r['class'] !== 'us_equity') throw new Error('Classe Alpaca non supportata.');
  if (r['isEtf'] === true) return 'etf';
  if (r['isEtf'] === false) return 'azione';
  return 'us_equity_non_classificata';
}
export function normalizzaUniverso(righe: unknown, aggiornatoIl: string): UniversoAutonomo {
  if (!Array.isArray(righe)) throw new Error('Catalogo Alpaca non leggibile.');
  const m = new Map<string, AssetAutonomo>();
  for (const raw of righe) {
    if (!raw || typeof raw !== 'object') throw new Error('Riga catalogo non valida.');
    const r = raw as Record<string, unknown>;
    if (r['status'] !== 'active' || r['tradable'] !== true) continue;
    const ticker = String(r['symbol'] ?? ''), classe = classificaAsset(r);
    if (!/^[A-Z0-9./-]{1,15}$/.test(ticker)) throw new Error('Simbolo catalogo non supportato.');
    // Currency is provided by metadata; crypto quote is explicitly encoded in the pair.
    const quote = classe === 'crypto' ? ticker.split('/')[1] : undefined;
    const valuta = typeof r['currency'] === 'string' ? r['currency'] : quote && /^[A-Z]{3}$/.test(quote) ? quote : '';
    const s: AssetAutonomo = { ticker, classe, valuta, mercato: classe === 'crypto' ? 'crypto' : 'azioni', fonte: 'Alpaca catalogo attivo', exchange: String(r['exchange'] ?? ''), stato: 'active', tradabile: true, aggiornatoIl, adjustment: classe === 'crypto' ? 'nessuno' : 'split' };
    const old = m.get(ticker);
    if (old && JSON.stringify(old) !== JSON.stringify(s)) throw new Error(`Catalogo duplicato incoerente: ${ticker}.`);
    m.set(ticker, s);
  }
  const strumenti = [...m.values()].sort((a,b) => a.ticker.localeCompare(b.ticker));
  if (!strumenti.length) throw new Error('Catalogo Alpaca vuoto: nessun universo completo disponibile.');
  return { strumenti, totaleAcquisito: righe.length, aggiornatoIl, provider: 'Alpaca', classi: [...new Set(strumenti.map(s => s.classe))], avvisi: ['Catalogo corrente, non universo storico: delisting e survivorship bias non certificati.', 'Alpaca us_equity non distingue azioni ed ETF: senza metadato autorevole il sottotipo resta non classificato.', 'La valuta mancante resta sconosciuta; nessun USD assegnato per supposizione.'] };
}
export function blocchi<T>(v: T[], dimensione = 25): T[][] {
  if (!Number.isInteger(dimensione) || dimensione < 1 || dimensione > 100) throw new Error('Dimensione blocco non valida.');
  return Array.from({length: Math.ceil(v.length/dimensione)}, (_,i) => v.slice(i*dimensione,(i+1)*dimensione));
}
export function unisciBarre(v: Barra[]): Barra[] {
  const m = new Map<string,Barra>();
  for (const b of v) { const old=m.get(b.data); if(old && JSON.stringify(old)!==JSON.stringify(b)) throw new Error(`Barre duplicate incoerenti: ${b.data}.`); m.set(b.data,b); }
  return [...m.values()].sort((a,b)=>a.data.localeCompare(b.data));
}
export function verificaSerie(s: AssetAutonomo, barre: Barra[], dal: string, al: string) {
  validaBarre(barre);
  if (!/^[A-Z]{3}$/.test(s.valuta)) throw new Error('Valuta non verificata.');
  if (s.adjustment === 'non_verificato' || (s.mercato==='azioni' && s.adjustment!=='split')) throw new Error('Aggiustamento split non verificato.');
  if (s.mercato==='crypto' && !/^[A-Z0-9]+\/[A-Z]{3}$/.test(s.ticker)) throw new Error('Formato crypto non verificato.');
  const start=barre.findIndex(b=>b.data>=dal), fine=barre.filter(b=>b.data<=al).at(-1);
  if(start<20 || !fine || Date.parse(barre[start]?.data??'')-Date.parse(dal)>7*86400000 || Date.parse(al)-Date.parse(fine.data)>7*86400000) throw new Error('Copertura temporale insufficiente.');
  const nelPeriodo=barre.filter(b=>b.data>=dal && b.data<=al);
  if(nelPeriodo.some(b=>b.volume<=0)) throw new Error('Volume assente nel periodo.');
  if(s.mercato==='crypto' && (nelPeriodo[0]?.data!==dal || fine.data!==al)) throw new Error('Copertura crypto giornaliera incompleta.');
  for(let i=1;i<barre.length;i++){ const a=barre[i-1],b=barre[i]; if(a&&b && Date.parse(b.data)-Date.parse(a.data)>(s.mercato==='crypto'?1:7)*86400000) throw new Error('Lacuna nel calendario storico.'); }
}