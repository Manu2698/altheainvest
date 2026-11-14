import { credenzialiUtente } from "../alpaca.server";
import { bilanciStorici, notizieStoriche } from "./evidenze";
import type { Evidenza } from "./motore";
/** Bounded read-only retrieval for one explicit candidate, never live news or TTM. */
export async function caricaEvidenzeStoriche(userId: string, ticker: string, data: string): Promise<{evidenze:Evidenza[];avvisi:string[]}> {
  const avvisi:string[]=[], evidenze:Evidenza[]=[];
  const key=process.env["UDC_FINANCIAL_MODELING_PREP_API_KEY"], lov=process.env["LOVABLE_API_KEY"];
  if (!ticker.includes("/") && key && lov) {
    for (const tipo of ["income-statement","balance-sheet-statement","cash-flow-statement"]) {
      try {
        const url=new URL(`https://connector-gateway.lovable.dev/udc_financial_modeling_prep/stable/${tipo}`);
        url.searchParams.set("symbol",ticker);url.searchParams.set("period","quarter");url.searchParams.set("limit","400");
        const r=await fetch(url,{headers:{Authorization:`Bearer ${lov}`,"X-Connection-Api-Key":key},signal:AbortSignal.timeout(10000)});
        if(!r.ok){avvisi.push(`Financial Modeling Prep: ${tipo} non disponibile (HTTP ${r.status}).`);break;}
        const j:unknown=await r.json();
        if(!Array.isArray(j)){avvisi.push("Archivio bilanci non leggibile.");break;}
        evidenze.push(...bilanciStorici(j,ticker,data));
      }catch{avvisi.push("Archivio bilanci non raggiungibile.");break;}
    }
    avvisi.push("Bilanci storici del fornitore: possibili rettifiche successive; archivio immutabile point-in-time non certificato. Valutazione e indici TTM attuali esclusi.");
  }else avvisi.push("Bilanci aziendali storici non disponibili per questo strumento o servizio non collegato.");
  try {
    const cred=await credenzialiUtente(userId,false) ?? await credenzialiUtente(userId,true);
    if(!cred) avvisi.push("Notizie storiche: collega Alpaca per il recupero automatico.");
    else {
      const cutoff=Date.parse(`${data}T00:00:00Z`), url=new URL("https://data.alpaca.markets/v1beta1/news");
      url.searchParams.set("symbols",ticker);url.searchParams.set("start",new Date(cutoff-7*86400000).toISOString());url.searchParams.set("end",new Date(cutoff).toISOString());url.searchParams.set("sort","desc");url.searchParams.set("limit","50");
      const r=await fetch(url,{headers:cred.headers,signal:AbortSignal.timeout(10000)});
      if(!r.ok) avvisi.push(`Alpaca News: archivio non disponibile (HTTP ${r.status}).`);
      else {
        const j=await r.json() as {news?:Record<string,unknown>[];next_page_token?:string|null};
        if(!Array.isArray(j.news)) avvisi.push("Archivio notizie non leggibile.");
        else if(j.next_page_token) avvisi.push("Copertura notizie troncata: nessuna notizia usata per evitare un campione incompleto.");
        else evidenze.push(...notizieStoriche(j.news,ticker,data));
      }
    }
  }catch{avvisi.push("Archivio notizie non raggiungibile.");}
  if(!evidenze.some(e=>e.tipo==="fondamentali")) avvisi.push("Nessun bilancio pubblicato prima del candidato: HOLD.");
  if(!evidenze.some(e=>e.tipo==="news")) avvisi.push("Nessuna notizia verificabile nei 7 giorni precedenti: HOLD.");
  return {evidenze:evidenze.sort((a,b)=>a.disponibileIl.localeCompare(b.disponibileIl)),avvisi};
}
