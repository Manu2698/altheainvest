import { normalizzaUniverso, unisciBarre, type AssetAutonomo } from './universo-autonomo';
import type { Barra } from './motore';

// No trading module imports: only authenticated credential SELECT, GET assets and market data.
export async function credenzialiPaperAutonome(userId: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.from('broker_credenziali').select('key_id,api_secret,ambiente').eq('user_id',userId).eq('ambiente','paper');
  if(error) throw new Error('Credenziali Alpaca non leggibili.');
  const row=data?.find(r=>r.ambiente==='paper');
  if(!row?.key_id || !row.api_secret) throw new Error('Catalogo non disponibile: credenziali Alpaca PAPER personali assenti. Nessun uso di credenziali REAL.');
  return {headers:{'APCA-API-KEY-ID':row.key_id,'APCA-API-SECRET-KEY':row.api_secret},base:'https://paper-api.alpaca.markets'};
}
export async function catalogoAlpacaAutonomo(userId:string) {
  const cred=await credenzialiPaperAutonome(userId),righe:unknown[]=[];
  for(const classe of ['us_equity','crypto']) {
    const r=await fetch(`${cred.base}/v2/assets?status=active&asset_class=${classe}`,{headers:cred.headers});
    if(!r.ok) throw new Error(`Catalogo Alpaca ${classe} HTTP ${r.status}: acquisizione incompleta, nessun fallback nascosto.`);
    const j:unknown=await r.json();if(!Array.isArray(j))throw new Error('Catalogo Alpaca non leggibile.');righe.push(...j);
  }
  return normalizzaUniverso(righe,new Date().toISOString());
}
export async function prezziAlpacaBlocco(userId:string, strumenti:AssetAutonomo[],dal:string,al:string) {
  if(!strumenti.length || strumenti.length>25 || new Set(strumenti.map(s=>s.ticker)).size!==strumenti.length)throw new Error('Blocco storico non valido.');
  const cred=await credenzialiPaperAutonome(userId),serie:Record<string,Barra[]>={},errori:Record<string,string>={};
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
      for(const s of subset){
        if(errori[s.ticker])continue;
        try {
          const rows=j.bars[s.ticker]??[];
          if(!Array.isArray(rows))throw new Error('Serie Alpaca non leggibile.');
          const barre=rows.map(b=>{
            if(typeof b.t!=='string'||!Number.isFinite(Date.parse(b.t))||!Number.isFinite(b.o)||b.o<=0||!Number.isFinite(b.c)||b.c<=0||!Number.isFinite(b.v)||b.v<0)throw new Error('Barra Alpaca con timestamp, prezzi o volume non validi.');
            return {data:new Date(b.t).toISOString().slice(0,10),apertura:b.o,chiusura:b.c,volume:b.v};
          });
          serie[s.ticker]=unisciBarre([...(serie[s.ticker]??[]),...barre]).filter(b=>b.data<=al);
        } catch(e) { delete serie[s.ticker];errori[s.ticker]=e instanceof Error?e.message:'Serie non valida.'; }
      }
      if(!j.next_page_token){completo=true;break;}
      if(tokens.has(j.next_page_token))throw new Error('Paginazione Alpaca ripetuta.');tokens.add(j.next_page_token);url.searchParams.set('page_token',j.next_page_token);
    }
    if(!completo)throw new Error('Paginazione Alpaca troncata: blocco non salvato.');
    for(const s of subset)if(!serie[s.ticker]?.length&&!errori[s.ticker])errori[s.ticker]='Serie storica assente presso Alpaca.';
  }
  return {serie,errori};
}
/** Non-sensitive diagnostic: never returns key material, only format checks and HTTP statuses of read-only GETs. */
export async function diagnosticaAlpacaPaper(userId:string){
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.from('broker_credenziali').select('key_id,api_secret,updated_at').eq('user_id',userId).eq('ambiente','paper').maybeSingle();
  if(error)return {presenti:false,conclusione:'Archivio credenziali non leggibile.',rimedio:'Riprova più tardi.',controlli:[] as {nome:string;ok:boolean;dettaglio:string}[]};
  if(!data?.key_id||!data.api_secret)return {presenti:false,conclusione:'Nessuna chiave Alpaca PAPER collegata a questo utente.',rimedio:'Dashboard → collegamento Alpaca Paper: incolla Key ID e Secret generati in Alpaca (sezione Paper Trading → API Keys).',controlli:[]};
  const k=data.key_id,sec=data.api_secret,h={'APCA-API-KEY-ID':k,'APCA-API-SECRET-KEY':sec,accept:'application/json'};
  const stato=async(url:string)=>{try{const r=await fetch(url,{headers:h,signal:AbortSignal.timeout(10000)});return r.status;}catch{return 0;}};
  const [conto,dati]=await Promise.all([stato('https://paper-api.alpaca.markets/v2/account'),stato('https://data.alpaca.markets/v2/stocks/bars?symbols=SPY&timeframe=1Day&limit=1&feed=iex')]);
  const controlli=[
    {nome:'Formato Key ID paper (prefisso PK)',ok:k.startsWith('PK'),dettaglio:k.startsWith('PK')?'Prefisso compatibile con chiavi Paper.':k.startsWith('AK')?'Prefisso da chiave LIVE: non valida per Paper.':'Prefisso non riconosciuto.'},
    {nome:'Lunghezze plausibili',ok:k.length>=20&&k.length<=32&&sec.length>=40&&sec.length<=48,dettaglio:`Key ID ${k.length} caratteri, secret ${sec.length} caratteri.`},
    {nome:'Spazi o a capo',ok:k===k.trim()&&sec===sec.trim(),dettaglio:k===k.trim()&&sec===sec.trim()?'Nessuno.':'Presenti: chiave incollata male.'},
    {nome:'Endpoint conto paper-api.alpaca.markets/v2/account',ok:conto===200,dettaglio:`HTTP ${conto||'irraggiungibile'}`},
    {nome:'Endpoint dati data.alpaca.markets (feed IEX)',ok:dati===200,dettaglio:`HTTP ${dati||'irraggiungibile'}`},
  ];
  const formatoOk=controlli.slice(0,3).every(c=>c.ok);
  const conclusione=conto===200&&dati===200?'Accesso Alpaca PAPER funzionante.':formatoOk&&(conto===401||conto===403)?`Alpaca rifiuta la coppia di chiavi PAPER (HTTP ${conto}) pur con formato, endpoint e header corretti: chiavi revocate o rigenerate su Alpaca (ad esempio dopo un reset del conto Paper) dopo il collegamento del ${String(data.updated_at).slice(0,10)}.`:formatoOk?'Errore del servizio Alpaca o di rete: nessun problema di formato rilevato.':'Chiavi salvate con formato non valido per Paper.';
  return {presenti:true,conclusione,rimedio:'Genera nuove chiavi in Alpaca → Paper Trading → API Keys, poi in Dashboard scollega e ricollega Alpaca Paper. Nessuna credenziale REAL viene usata.',controlli};
}
