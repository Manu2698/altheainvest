import type { Barra } from './motore';
import { validaBarre } from './motore';
import type { StrumentoStorico } from './autonomo';

/** Existing connection, market-data GET only. Never imports committee or execution. */
export async function leggiFMP(endpoint:string,parametri:Record<string,string>={}) : Promise<unknown> {
  const key=process.env['UDC_FINANCIAL_MODELING_PREP_API_KEY'],lov=process.env['LOVABLE_API_KEY'];
  if(!key||!lov)throw new Error('Financial Modeling Prep non collegato.');
  const url=new URL(`https://connector-gateway.lovable.dev/udc_financial_modeling_prep/stable/${endpoint}`);
  for(const [k,v]of Object.entries(parametri))url.searchParams.set(k,v);
  const r=await fetch(url,{headers:{Authorization:`Bearer ${lov}`,'X-Connection-Api-Key':key},signal:AbortSignal.timeout(endpoint==='stock-list'?60000:20000)});
  if(!r.ok)throw new Error(`Financial Modeling Prep: ${endpoint} HTTP ${r.status}.`);
  return r.json();
}
export function intervalliStorici(dal:string,al:string){
  const intervalli:{dal:string;al:string}[]=[];let inizio=dal;
  while(inizio<=al){const fine=new Date(Date.parse(inizio)+365*86400000).toISOString().slice(0,10);const end=fine<al?fine:al;intervalli.push({dal:inizio,al:end});inizio=new Date(Date.parse(end)+86400000).toISOString().slice(0,10);}
  return intervalli;
}
export function normalizzaPrezzi(j:unknown):Barra[]{
  if(!Array.isArray(j))throw new Error('Archivio prezzi non leggibile.');
  const m=new Map<string,Barra>();
  for(const x of j){if(!x||typeof x!=='object')throw new Error('Riga prezzi non valida.');const r=x as Record<string,unknown>;
    const b={data:String(r['date']??'').slice(0,10),apertura:Number(r['adjOpen']??r['open']),chiusura:Number(r['adjClose']??r['close']),volume:Number(r['volume'])};
    const old=m.get(b.data);if(old&&JSON.stringify(old)!==JSON.stringify(b))throw new Error(`Prezzi duplicati incoerenti il ${b.data}.`);m.set(b.data,b);
  }
  return [...m.values()].sort((a,b)=>a.data.localeCompare(b.data));
}
export async function catalogoFMP(){
  const strumenti:StrumentoStorico[]=[],avvisi:string[]=[];
  for(const [endpoint,mercato] of [['stock-list','azioni'],['cryptocurrency-list','crypto']] as const){
    try{const j=await leggiFMP(endpoint);if(!Array.isArray(j))throw new Error('Catalogo non leggibile.');
      for(const x of j){if(!x||typeof x!=='object')continue;const r=x as Record<string,unknown>,ticker=String(r['symbol']??'');if(!/^[A-Z0-9./-]{1,15}$/.test(ticker))continue;
        strumenti.push({ticker,mercato,valuta:typeof r['currency']==='string'?r['currency']:'',fonte:`FMP ${endpoint}`});}
      avvisi.push(`${endpoint}: ${j.length} righe ricevute; esaustività e universo storico non certificati.`);
    }catch(e){avvisi.push(e instanceof Error?e.message:'Catalogo non disponibile.');}
  }
  return {strumenti:[...new Map(strumenti.map(s=>[s.ticker,s])).values()],avvisi};
}
export async function prezziFMP(s:StrumentoStorico,dal:string,al:string){
  let valuta=s.valuta;
  if(!valuta&&s.mercato==='azioni'){const j=await leggiFMP('profile',{symbol:s.ticker});
    if(Array.isArray(j)){const row=j.find(x=>x?.symbol===s.ticker);if(row&&typeof row.currency==='string')valuta=row.currency;}}
  if(!valuta)throw new Error('Valuta dello strumento non verificata dal fornitore.');
  const inizio=new Date(Date.parse(dal)-180*86400000).toISOString().slice(0,10),righe:Barra[]=[];
  for(const i of intervalliStorici(inizio,al)){const j=await leggiFMP('historical-price-eod/full',{symbol:s.ticker,from:i.dal,to:i.al});const b=normalizzaPrezzi(j);if(b.length>=5000)throw new Error('Serie potenzialmente troncata.');righe.push(...b.filter(x=>x.data>=i.dal&&x.data<=i.al));}
  const barre=normalizzaPrezzi(righe.map(b=>({date:b.data,open:b.apertura,close:b.chiusura,volume:b.volume})));validaBarre(barre);
  return {barre,valuta,fonte:'FMP prezzi EOD split-adjusted (verificato su NVDA 10:1), dividendi esclusi'};
}
export async function cambiFMP(valuta:string,dal:string,al:string){
  // FMP EURUSD means USD per EUR; inversion gives EUR per USD.
  const righe:Barra[]=[];for(const i of intervalliStorici(new Date(Date.parse(dal)-180*86400000).toISOString().slice(0,10),al)){
    const b=normalizzaPrezzi(await leggiFMP('historical-price-eod/full',{symbol:`EUR${valuta}`,from:i.dal,to:i.al}));
    righe.push(...b.filter(x=>x.data>=i.dal&&x.data<=i.al).map(x=>({...x,apertura:1/x.apertura,chiusura:1/x.chiusura})));
  }
  validaBarre(righe);return righe;
}