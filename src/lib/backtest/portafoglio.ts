import { decide } from '../decisione';
import { problemaAccumulo, problemaDati } from '../protezioni';
import { validaConfig, validaBarre, type Barra, type ConfigTest, type Candidato, type Verdetto, type OperazioneTest } from './motore';

export const VERSIONE_PORTAFOGLIO = 'portfolio-next-open-v2';
export type ConfigPortafoglio = ConfigTest & { titoli: string[]; liquiditaMinPct: number; maxChiamate: number; giornaliero?:boolean };
export type PosizioneVirtuale = { quantita: number; base: number; prezzo: number; data: string };
export type CandidatoPortafoglio = Candidato & { ticker: string; azione: 'BUY'|'SELL'; massimoAcquisto:number;massimoVendita:number;portafoglio: Record<string, PosizioneVirtuale>; alternative: { ticker:string; azione:string; chiusure:number[]; volume:number; motivo:string }[]; vincoli: {quotaPct:number;liquiditaMinPct:number} };
export type VerdettoPortafoglio = Verdetto & { azione?: 'BUY'|'SELL'|'HOLD'|undefined; chiamate?:number|undefined; errore?:boolean|undefined };
export type OrdineVirtuale = {ticker:string;lato:'BUY'|'SELL';budget:number;quantita:number;segnale:string;motivo:string};
export type RisultatoPortafoglio = ReturnType<typeof simulaPortafoglio>;
export function validaPortafoglio(c:ConfigPortafoglio) {
  validaConfig(c);
  if(!Array.isArray(c.titoli)||c.titoli.length<1||new Set(c.titoli).size!==c.titoli.length||c.titoli.some(t=>! /^[A-Z0-9./-]{1,15}$/.test(t)))throw new Error('Universo non valido: servono simboli unici.');
  if(!Number.isFinite(c.liquiditaMinPct)||c.liquiditaMinPct<0||c.liquiditaMinPct>100||!Number.isInteger(c.maxChiamate)||c.maxChiamate<0||c.maxChiamate>10000)throw new Error('Riserva o budget IA non valido.');
}
export function chiaveCandidato(c:ConfigPortafoglio, candidato:CandidatoPortafoglio) { return JSON.stringify({versione:VERSIONE_PORTAFOGLIO,config:{...c,maxChiamate:undefined},candidato}); }
const media=(v:number[])=>v.reduce((a,b)=>a+b,0)/Math.max(1,v.length);
/** Pure replay: a cached verdict replays the identical prefix, never submits or retries an order. */
export function simulaPortafoglio(c:ConfigPortafoglio, serie:Record<string,Barra[]>, verdetti:Record<string,VerdettoPortafoglio>={}, finoA?:string) {
  validaPortafoglio(c);
  const calendari:Record<string,Map<string,Barra>>={};
  for(const t of c.titoli){const b=serie[t];if(!b)throw new Error(`Storico mancante: ${t}. Nessun titolo escluso silenziosamente.`);validaBarre(b);const start=b.findIndex(x=>x.data>=c.dal);const fine=b.filter(x=>x.data<=c.al).at(-1);if(start<20||!fine||Date.parse(b[start]?.data??'')-Date.parse(c.dal)>7*86400000||Date.parse(c.al)-Date.parse(fine.data)>7*86400000)throw new Error(`Copertura insufficiente: ${t}.`);for(let i=start;i<b.length;i++){const x=b[i],p=b[i-1];if(x&&p&&x.data<=c.al&&Date.parse(x.data)-Date.parse(p.data)>7*86400000)throw new Error(`Intervallo storico mancante: ${t}.`);}calendari[t]=new Map(b.map(x=>[x.data,x]));}
  const date=c.giornaliero?Array.from({length:Math.floor((Date.parse(c.al)-Date.parse(c.dal))/86400000)+1},(_,i)=>new Date(Date.parse(c.dal)+i*86400000).toISOString().slice(0,10)):[...new Set(c.titoli.flatMap(t=>(serie[t]??[]).filter(b=>b.data>=c.dal&&b.data<=c.al).map(b=>b.data)))].sort();
  let cash=c.capitale, precedente=c.capitale, costi=0, commissioni=0, slippage=0, spread=0;
  const pos:Record<string,PosizioneVirtuale>={},pending:OrdineVirtuale[]=[],operazioni:(OperazioneTest&{ticker:string})[]=[],decisioni:{data:string;ticker:string;azione:string;motivo:string;dettagli:unknown}[]=[],curva:{data:string;equity:number;benchmark:number;liquidita:number;esposizione:number;composizione:Record<string,number>}[]=[];
  const ultimaAnalisi:Record<string,string>={},bench:Record<string,number>={},prezzi:Record<string,number>={};
  let candidato:CandidatoPortafoglio|null=null,chiave:string|null=null,stato:'completo'|'analisi_richiesta'|'budget_esaurito'|'interrotto'='completo';
  const attrito=(c.spreadBps/2+c.slippageBps)/10000;
  for(const data of date){
    // Pending cash remains in cash, but is reserved and cannot fund another intent.
    for(const o of pending.slice()){const b=calendari[o.ticker]?.get(data);if(!b||data<=o.segnale)continue;pending.splice(pending.indexOf(o),1);if(b.volume<=0){decisioni.push({data,ticker:o.ticker,azione:'HOLD',motivo:'Ordine annullato: volume assente.',dettagli:null});continue;}
      const prezzo=b.apertura*(o.lato==='BUY'?1+attrito:1-attrito),p=pos[o.ticker];
      let q=0,pnl:number|null=null;
      if(o.lato==='BUY'){const budget=Math.min(cash,o.budget);q=Math.max(0,(budget-c.commissione)/prezzo);if(q<=0)continue;cash-=budget;pos[o.ticker]={quantita:(p?.quantita??0)+q,base:(p?.base??0)+budget,prezzo:b.apertura,data};}
      else if(p){q=Math.min(p.quantita,o.quantita);const incasso=q*prezzo-c.commissione;if(q<=0||incasso<0)continue;const base=p.base*q/p.quantita;pnl=incasso-base;cash+=incasso;p.quantita-=q;p.base-=base;if(p.quantita<1e-10)delete pos[o.ticker];}else continue;
      const sp=q*b.apertura*c.spreadBps/20000,sl=q*b.apertura*c.slippageBps/10000,costo=c.commissione+sp+sl;commissioni+=c.commissione;spread+=sp;slippage+=sl;costi+=costo;operazioni.push({ticker:o.ticker,segnale:o.segnale,esecuzione:data,lato:o.lato,prezzo,quantita:q,costo,pnl,motivo:o.motivo});
    }
    for(const t of c.titoli){const b=calendari[t]?.get(data);if(b){prezzi[t]=b.chiusura;if(pos[t]){pos[t].prezzo=b.chiusura;pos[t].data=data;}if(bench[t]===undefined)bench[t]=Math.max(0,(c.capitale/c.titoli.length-c.commissione)/(b.apertura*(1+attrito)));}}
    const composizione=Object.fromEntries(Object.entries(pos).map(([t,p])=>[t,p.quantita*p.prezzo]));const investito=Object.values(composizione).reduce((a,b)=>a+b,0),equity=cash+investito,perditaOggi=precedente-equity;precedente=equity;
    const benchmark=c.titoli.reduce((a,t)=>a+(bench[t]===undefined?c.capitale/c.titoli.length:(bench[t]??0)*(prezzi[t]??0)),0);
    curva.push({data,equity,benchmark,liquidita:cash,esposizione:equity>0?investito/equity*100:0,composizione});
    if(finoA&&data>=finoA){stato='interrotto';break;}
    if(data===date.at(-1))continue;
    const alternative=c.titoli.flatMap(t=>{const b=calendari[t]?.get(data);if(!b)return [];const chiusure=(serie[t]??[]).filter(x=>x.data<=data).slice(-120).map(x=>x.chiusura);const p=pos[t],pv=p?{ticker:t,valore:p.quantita*p.prezzo,pnlPct:(p.quantita*p.prezzo/p.base-1)*100}:undefined;const scelta=decide(c.strategia,t,chiusure,pv,equity*c.quotaPct/100);return [{ticker:t,chiusure,volume:b.volume,azione:scelta.azione,motivo:scelta.motivo,importo:scelta.importo,pv}];});
    // Protective exits first, then deterministic trend ranking (not a return forecast).
    alternative.sort((a,b)=>Number(b.azione==='vendi')-Number(a.azione==='vendi')||((b.chiusure.at(-1)??0)/media(b.chiusure.slice(-20)))-((a.chiusure.at(-1)??0)/media(a.chiusure.slice(-20)))||a.ticker.localeCompare(b.ticker));
    for(const a of alternative){
      const t=a.ticker,p=pos[t];let azione:'BUY'|'SELL'|'HOLD'=a.azione==='compra'?'BUY':a.azione==='vendi'?'SELL':'HOLD',motivo=a.motivo;
      const hold=(msg:string)=>decisioni.push({data,ticker:t,azione:'HOLD',motivo:msg,dettagli:null});
      if(pending.some(o=>o.ticker===t)){hold('Ordine pendente: nessuna duplicazione.');continue;}
      if(c.perditaGiornaliera&&perditaOggi>=c.perditaGiornaliera){hold('Limite giornaliero simulato raggiunto.');continue;}
      // In committee mode open holdings are reviewed every seven calendar days, locally gated.
      const rivaluta=c.modalita==='comitato'&&p&&(!ultimaAnalisi[t]||Date.parse(data)-Date.parse(ultimaAnalisi[t])>=7*86400000);
      const prima=a.chiusure.at(-2)??0,ultimo=a.chiusure.at(-1)??0;
      const nuovoTrend=c.modalita==='comitato'&&!p&&prima<=media(a.chiusure.slice(-21,-1))&&ultimo>media(a.chiusure.slice(-20));
      if(azione==='HOLD'&&!rivaluta&&!nuovoTrend){hold(motivo);continue;}
      if(azione==='HOLD'&&nuovoTrend){azione='BUY';motivo='Nuovo attraversamento SMA20: opportunità sottoposta al comitato, non acquisto automatico.';}
      if(azione==='HOLD'&&rivaluta){azione='SELL';motivo='Rivalutazione periodica della posizione: vendita parziale/totale o HOLD.';}
      const riservato=pending.filter(o=>o.lato==='BUY').reduce((s,o)=>s+o.budget,0);
      const bloccoAcquisto=problemaDati(a.chiusure,data,Date.parse(data))??problemaAccumulo(c.strategia,a.pv,a.chiusure);
      const massimoAcquisto=bloccoAcquisto?0:Math.max(0,Math.floor(Math.min(cash-riservato-equity*c.liquiditaMinPct/100,Math.max(0,equity*c.quotaPct/100-(composizione[t]??0)))*100)/100);
      const massimoVendita=(p?.quantita??0)*(p?.prezzo??0);
      let importo=azione==='SELL'?Math.min(a.importo||massimoVendita,massimoVendita):Math.min(nuovoTrend?massimoAcquisto:a.importo,massimoAcquisto);
      if(azione==='BUY'){const blocco=problemaDati(a.chiusure,data,Date.parse(data))??problemaAccumulo(c.strategia,a.pv,a.chiusure);if(blocco){hold(blocco);continue;}}
      if(importo<1||importo<=c.commissione){hold('Liquidità, esposizione o importo insufficiente.');continue;}
      // Stops from decide bypass AI; discretionary SELL is subject to independent veto.
      if(c.modalita==='comitato'&&a.azione!=='vendi'){
        if(azione==='HOLD')continue;
        const ctx:CandidatoPortafoglio={ticker:t,azione,massimoAcquisto,massimoVendita,data,chiusure:a.chiusure,importo,motivo,posizione:a.pv??null,conto:{capitale:equity,liquidita:cash-riservato,investito,numeroPosizioni:Object.keys(pos).length,perditaOggi,limitePerdita:c.perditaGiornaliera},portafoglio:JSON.parse(JSON.stringify(pos)),alternative:alternative.map(x=>({ticker:x.ticker,azione:x.azione,chiusure:x.chiusure,volume:x.volume,motivo:x.motivo})),vincoli:{quotaPct:c.quotaPct,liquiditaMinPct:c.liquiditaMinPct}};
        const key=chiaveCandidato(c,ctx),v=verdetti[key];if(!v){candidato=ctx;chiave=key;stato=Object.values(verdetti).reduce((s,v)=>s+(v.chiamate??0),0)+9>c.maxChiamate?'budget_esaurito':'analisi_richiesta';break;}
        ultimaAnalisi[t]=data;decisioni.push({data,ticker:t,azione:v.procedi?(v.azione??azione):'HOLD',motivo:v.motivo,dettagli:v.dettagli});
        if(v.errore){candidato=ctx;chiave=key;stato='interrotto';break;}
        if(!v.procedi||v.azione==='HOLD'||!Number.isFinite(v.importo)||v.importo<=0)continue;
        if(v.azione==='BUY'||v.azione==='SELL')azione=v.azione;
        importo=Math.min(azione==='BUY'?massimoAcquisto:massimoVendita,v.importo);motivo=v.motivo;
        if(importo<1||importo<=c.commissione)continue;
      }else decisioni.push({data,ticker:t,azione,motivo,dettagli:null});
      pending.push({ticker:t,lato:azione==='BUY'?'BUY':'SELL',budget:azione==='BUY'?importo:0,quantita:azione==='SELL'?Math.min(p?.quantita??0,importo/(p?.prezzo??1)):0,segnale:data,motivo});
    }
    if(candidato)break;
  }
  const equity=curva.at(-1)?.equity??c.capitale,aperto=Object.values(pos).reduce((s,p)=>s+p.quantita*p.prezzo,0),pnlAperto=aperto-Object.values(pos).reduce((s,p)=>s+p.base,0),pnl=operazioni.filter(o=>o.pnl!==null).map(o=>o.pnl??0),wins=pnl.filter(x=>x>0),loss=pnl.filter(x=>x<0),sw=wins.reduce((a,b)=>a+b,0),sl=-loss.reduce((a,b)=>a+b,0);
  let picco=c.capitale,drawdownPct=0;for(const x of curva){picco=Math.max(picco,x.equity);drawdownPct=Math.max(drawdownPct,(picco-x.equity)/picco*100);}
  const rend=curva.map((x,i)=>x.equity/(curva[i-1]?.equity??c.capitale)-1),m=media(rend),sd=Math.sqrt(rend.reduce((s,x)=>s+(x-m)**2,0)/Math.max(1,rend.length-1));const giorni=curva.length>1?(Date.parse(curva.at(-1)?.data??'')-Date.parse(curva[0]?.data??''))/86400000:0;
  const limiteValidazione=date[Math.floor(date.length*.7)]??c.al,valid=curva.filter(x=>x.data>=limiteValidazione),base=curva.filter(x=>x.data<limiteValidazione).at(-1)?.equity??c.capitale;
  return {versione:VERSIONE_PORTAFOGLIO,stato,candidato,chiave,curva,operazioni,decisioni,posizioni:pos,pendenti:pending,equity,liquidita:cash,riservato:pending.reduce((s,o)=>s+o.budget,0),aperto,pnlAperto,costi,commissioni,slippage,spread,rendimentoPct:(equity/c.capitale-1)*100,drawdownPct,vincentiPct:pnl.length?wins.length/pnl.length*100:null,profitFactor:sl?sw/sl:null,senzaPerdite:sw>0&&!sl,vendite:pnl.length,vincenti:wins.length,perdenti:loss.length,acquisti:operazioni.filter(o=>o.lato==='BUY').length,holds:decisioni.filter(d=>d.azione==='HOLD').length,aspettativa:pnl.length?(sw-sl)/pnl.length:null,sharpe:rend.length>=30&&sd>0&&giorni>0?m/sd*Math.sqrt(rend.length*365.25/giorni):null,esposizioneMedia:media(curva.map(x=>x.esposizione)),chiamate:Object.values(verdetti).reduce((s,v)=>s+(v.chiamate??0),0),holdout:{dal:limiteValidazione,rendimentoPct:valid.length?(equity/base-1)*100:null},perTitolo:c.titoli.map(t=>({ticker:t,pnlRealizzato:operazioni.filter(o=>o.ticker===t).reduce((s,o)=>s+(o.pnl??0),0),valore:composizioneFinale(pos,t),operazioni:operazioni.filter(o=>o.ticker===t).length})),limiti:['SIMULAZIONE isolata, nessun ordine al broker. Nessun deposito/prelievo: rendimento semplice uguale a rendimento corretto per flussi.','Universo scelto oggi: survivorship bias, delisting e negoziabilità storica non ricostruiti.','Barre aggiustate per split; dividendi e tasse esclusi. Calendario dalle barre disponibili, assenze fino a 7 giorni non distinguibili da festività.','Quote frazionarie, nessuna leva. Spread/slippage costanti e commissioni ipotetiche; volume positivo non garantisce liquidità. Gap possono far superare la quota nominale: non è un limite garantito al prezzo futuro.','Benchmark equiponderato buy-and-hold sullo stesso universo, date e costi. Sharpe: tasso privo di rischio 0, frequenza osservata; non stimato con meno di 30 osservazioni.','Holdout cronologico fissato sul calendario completo; non certifica validazione indipendente.','IA storica: possibile conoscenza degli esiti e bilanci rettificati, nessuna certificazione point-in-time. Un backtest positivo non garantisce profitti futuri.']};
}
function composizioneFinale(p:Record<string,PosizioneVirtuale>,t:string){return (p[t]?.quantita??0)*(p[t]?.prezzo??0);}
