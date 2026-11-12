import { credenzialiUtente } from "../alpaca.server";
import { validaBarre, type Barra } from "./motore";

/** Lecture exclusivement des données de marché; aucun endpoint d’ordres. */
export async function caricaStorico(userId: string, ticker: string, dal: string, al: string): Promise<{ barre: Barra[]; fonte: string }> {
  const cred = await credenzialiUtente(userId, false) ?? await credenzialiUtente(userId, true);
  if (!cred) throw new Error("Collega Alpaca oppure importa un CSV storico.");
  const crypto = ticker.includes("/");
  const inizio = new Date(Date.parse(dal)-180*86400000).toISOString();
  const fine = new Date(Date.parse(al)+86400000).toISOString();
  const url = new URL(crypto ? "https://data.alpaca.markets/v1beta3/crypto/us/bars" : "https://data.alpaca.markets/v2/stocks/bars");
  url.searchParams.set("symbols",ticker); url.searchParams.set("start",inizio); url.searchParams.set("end",fine); url.searchParams.set("timeframe","1Day"); url.searchParams.set("sort","asc"); url.searchParams.set("limit","10000");
  if (!crypto) {url.searchParams.set("adjustment","split");url.searchParams.set("feed","iex");}
  const barre: Barra[]=[]; const tokens=new Set<string>();
  for (let n=0;n<10;n++) {
    const res=await fetch(url,{headers:cred.headers,signal:AbortSignal.timeout(20000)});
    if (!res.ok) throw new Error(`Storico Alpaca non disponibile (HTTP ${res.status}). Per periodi più antichi o non coperti importa un CSV.`);
    const j=await res.json() as {bars?:Record<string,{t:string;o:number;c:number;v:number}[]>;next_page_token?:string|null};
    const righe=j.bars?.[ticker]; if (!Array.isArray(righe)) throw new Error("Nessuna serie storica per questo simbolo e periodo. Prova un CSV con dati verificati.");
    for(const r of righe) barre.push({data:String(r.t).slice(0,10),apertura:Number(r.o),chiusura:Number(r.c),volume:Number(r.v)});
    if (!j.next_page_token) {validaBarre(barre);return {barre,fonte:crypto?"Alpaca Crypto · barre giornaliere":"Alpaca IEX · barre giornaliere aggiustate per split"};}
    if(tokens.has(j.next_page_token)) throw new Error("Paginazione storica incoerente: test non avviato.");
    tokens.add(j.next_page_token);url.searchParams.set("page_token",j.next_page_token);
  }
  throw new Error("Serie troncata: nessun risultato generato.");
}