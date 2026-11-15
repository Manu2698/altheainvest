import { normalizzaUniverso, unisciBarre, type AssetAutonomo } from './universo-autonomo';
import type { Barra } from './motore';

// No trading module imports: only authenticated credential SELECT, GET assets and market data.
async function credenziali(userId: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.from('broker_credenziali').select('key_id,api_secret,ambiente').eq('user_id',userId).eq('piattaforma','alpaca');
  if(error) throw new Error('Credenziali Alpaca non leggibili.');
  const row=data?.find(r=>r.ambiente==='paper')??data?.find(r=>r.ambiente==='reale');
  if(!row?.key_id || !row.api_secret) throw new Error('Catalogo non disponibile: credenziali Alpaca personali assenti.');
  return {headers:{'APCA-API-KEY-ID':row.key_id,'APCA-API-SECRET-KEY':row.api_secret},base:row.ambiente==='paper'?'https://paper-api.alpaca.markets':'https://api.alpaca.markets'};
}
export async function catalogoAlpacaAutonomo(userId:string) {
  const cred=await credenziali(userId),righe:unknown[]=[];
  for(const classe of ['us_equity','crypto']) {
    const r=await fetch(`${cred.base}/v2/assets?status=active&asset_class=${classe}`,{headers:cred.headers});
    if(!r.ok) throw new Error(`Catalogo Alpaca ${classe} HTTP ${r.status}: acquisizione incompleta, nessun fallback nascosto.`);
    const j:unknown=await r.json();if(!Array.isArray(j))throw new Error('Catalogo Alpaca non leggibile.');righe.push(...j);
  }
  return normalizzaUniverso(righe,new Date().toISOString());
}
export async function prezziAlpacaBlocco(userId:string, strumenti:AssetAutonomo[],dal:string,al:string) {
  if(!strumenti.length || strumenti.length>25 || new Set(strumenti.map(s=>s.ticker)).size!==strumenti.length)throw new Error('Blocco storico non valido.');
  const cred=await credenziali(userId),serie:Record<string,Barra[]>={},errori:Record<string,string>={};
  for(const mercato of ['azioni','crypto'] as const){
    const subset=strumenti.filter(s=>s.mercato===mercato);if(!subset.length)continue;
    if(subset.some(s=>mercato==='crypto'&&!/^[A-Z0-9]+\/[A-Z]{3}$/.test(s.ticker)))throw new Error('Formato crypto non supportato.');
    const url=new URL(mercato==='crypto'?'https://data.alpaca.markets/v1beta3/crypto/us/bars':'https://data.alpaca.markets/v2/stocks/bars');
    for(const [k,v]of Object.entries({symbols:subset.map(s=>s.ticker).join(','),start:new Date(Date.parse(dal)-180*86400000).toISOString(),end:new Date(Date.parse(al)+86400000).toISOString(),timeframe:'1Day',sort:'asc',limit:'10000'}))url.searchParams.set(k,v);
    if(mercato==='azioni'){url.searchParams.set('adjustment','split');url.searchParams.set('feed','iex');}
    const tokens=new Set<string>();let completo=false;
    for(let pagina=0;pagina<100;pagina++){
      const r=await fetch(url,{headers:cred.headers});if(!r.ok)throw new Error(`Storico Alpaca HTTP ${r.status}: blocco interrotto, nessun retry.`);
      const j=await r.json() as {bars?:Record<string,{t:string;o:number;c:number;v:number}[]>;next_page_token?:string|null};
      if(!j.bars || typeof j.bars!=='object')throw new Error('Risposta storica Alpaca non valida.');
      for(const s of subset){const rows=j.bars[s.ticker]??[];if(!Array.isArray(rows))throw new Error('Serie Alpaca non leggibile.');serie[s.ticker]=unisciBarre([...(serie[s.ticker]??[]),...rows.map(b=>({data:b.t.slice(0,10),apertura:b.o,chiusura:b.c,volume:b.v}))]);}
      if(!j.next_page_token){completo=true;break;}
      if(tokens.has(j.next_page_token))throw new Error('Paginazione Alpaca ripetuta.');tokens.add(j.next_page_token);url.searchParams.set('page_token',j.next_page_token);
    }
    if(!completo)throw new Error('Paginazione Alpaca troncata: blocco non salvato.');
    for(const s of subset)if(!serie[s.ticker]?.length)errori[s.ticker]='Serie storica assente presso Alpaca.';
  }
  return {serie,errori};
}