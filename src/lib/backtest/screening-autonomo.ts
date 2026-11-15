import type { Barra } from './motore';
import type { AssetAutonomo } from './universo-autonomo';
import { blocchi } from './universo-autonomo';

export type EvidenzaAsset={ticker:string;tipo:'fondamentali'|'news'|'etf'|'crypto';fonte:string;disponibileIl:string;efficaceIl:string;contenuto:string};
export type InputScreening={ticker:string;classe:AssetAutonomo['classe'];data:string;barre:Barra[];evidenze:EvidenzaAsset[]};
export type EsitoScreening={ticker:string;data:string;verdetto:'BUY'|'SELL'|'HOLD'|'NON_VALUTABILE';motivazione:string;priorita:number;input:InputScreening};
export type CheckpointScreening={contesto:string;chiamate:number;risultati:Record<string,EsitoScreening>;incerto:boolean;errore:string};
export function inputScreening(s:AssetAutonomo,serie:Barra[],data:string,evidenze:EvidenzaAsset[]):InputScreening {
  const cutoff=Date.parse(`${data}T00:00:00Z`);
  return {ticker:s.ticker,classe:s.classe,data,barre:serie.filter(b=>Date.parse(`${b.data}T00:00:00Z`)<cutoff).slice(-120),evidenze:evidenze.filter(e=>e.ticker===s.ticker && e.fonte.trim() && e.contenuto.trim() && Number.isFinite(Date.parse(e.disponibileIl)) && Date.parse(e.disponibileIl)<=cutoff && Number.isFinite(Date.parse(e.efficaceIl)) && Date.parse(e.efficaceIl)<=cutoff)};
}
export function motivoNonValutabile(i:InputScreening) {
  if(i.barre.length<20)return 'Prezzi point-in-time insufficienti.';
  if(i.classe==='us_equity_non_classificata')return 'Sottotipo azione/ETF non verificato.';
  const tipo=i.classe==='azione'?'fondamentali':i.classe;
  if(!i.evidenze.some(e=>e.tipo===tipo))return `Evidenze storiche ${tipo} con date verificabili assenti.`;
  if(!i.evidenze.some(e=>e.tipo==='news'))return 'News point-in-time assenti.';
  return null;
}
/** Dependency-injected protocol. Production model dispatch stays disabled until a server-owned ledger exists. */
export async function screeningPerBlocchi(inputs:InputScreening[],maxChiamate:number,checkpoint:CheckpointScreening,chiama:(b:InputScreening[])=>Promise<EsitoScreening[]>,persisti:(c:CheckpointScreening)=>Promise<void>,dimensione=10) {
  if(!Number.isInteger(maxChiamate)||maxChiamate<0)throw new Error('Budget non valido.');
  const contesto=JSON.stringify(inputs);if(checkpoint.contesto!==contesto)throw new Error('Checkpoint di un contesto differente.');
  if(new Set(inputs.map(i=>i.ticker)).size!==inputs.length)throw new Error('Simboli screening duplicati.');
  const c=structuredClone(checkpoint);
  const eleggibili=inputs.filter(i=>!motivoNonValutabile(i));
  const pendenti=eleggibili.filter(i=>!c.risultati[i.ticker]);
  const stima=blocchi(pendenti,dimensione).length;
  if(c.incerto||c.errore)return {checkpoint:c,stato:'INCOMPLETO' as const,stima,nonValutati:pendenti.map(i=>i.ticker)};
  // Reserve BEFORE dispatch; persistence failure prevents dispatch, uncertain work is never replayed.
  for(const batch of blocchi(pendenti,dimensione)){
    if(c.chiamate>=maxChiamate)break;
    c.chiamate++;c.incerto=true;await persisti(c);
    try{const r=await chiama(batch);if(r.length!==batch.length || new Set(r.map(x=>x.ticker)).size!==batch.length || r.some(x=>!batch.some(i=>i.ticker===x.ticker && i.data===x.data)||!Number.isFinite(x.priorita)||!x.motivazione.trim()))throw new Error('Risposta batch incompleta o incoerente.');
      for(const i of batch){const v=r.find(x=>x.ticker===i.ticker);if(v)c.risultati[i.ticker]={...v,input:i};}c.incerto=false;await persisti(c);
    }catch(e){c.errore=e instanceof Error?e.message:'Screening interrotto.';await persisti(c);break;}
  }
  const nonValutati=eleggibili.filter(i=>!c.risultati[i.ticker]).map(i=>i.ticker);
  return {checkpoint:c,stato:!nonValutati.length&&!c.incerto&&!c.errore&&eleggibili.length>0?'COMPLETO' as const:'INCOMPLETO' as const,stima,nonValutati};
}