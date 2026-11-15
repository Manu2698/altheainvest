import { validaBarre, type Barra } from './motore';
import { simulaPortafoglio, type ConfigPortafoglio } from './portafoglio';

export type StrumentoStorico = { ticker:string; valuta:string; mercato:'azioni'|'crypto'; fonte:string };
export type Copertura = { ticker:string; fonte:string; dal:string|null; al:string|null; barre:number; incluso:boolean; motivo:string };
export type DatiAutonomi = { strumenti:StrumentoStorico[]; serie:Record<string,Barra[]>; cambi:Record<string,Barra[]>; errori:Record<string,string>; avvisi:string[] };
export type ParametriAutonomi = Pick<ConfigPortafoglio,'dal'|'al'|'strategia'|'quotaPct'|'commissione'|'spreadBps'|'slippageBps'>;

/** EUR per unit of quote currency. Never carry/interpolate a missing FX observation. */
export function convertiEUR(barre:Barra[],valuta:string,cambi:Record<string,Barra[]>) {
  if(valuta==='EUR')return barre;
  const fx=cambi[valuta];if(!fx)throw new Error(`Cambi storici ${valuta}/EUR mancanti.`);
  const m=new Map(fx.map(b=>[b.data,b]));
  return barre.map(b=>{const f=m.get(b.data);if(!f||f.apertura<=0||f.chiusura<=0)throw new Error(`Cambio ${valuta}/EUR assente il ${b.data}.`);return {...b,apertura:b.apertura*f.apertura,chiusura:b.chiusura*f.chiusura};});
}
export function preparaAutonomo(p:ParametriAutonomi,d:DatiAutonomi){
  const serie:Record<string,Barra[]>={},copertura:Copertura[]=[];
  for(const s of d.strumenti){const raw=d.serie[s.ticker]??[];let motivo=d.errori[s.ticker]??'';
    try{if(motivo)throw new Error(motivo);validaBarre(raw);
      if(!s.valuta)throw new Error('Valuta non verificata.');
      const b=convertiEUR(raw,s.valuta,d.cambi);
      if(s.mercato==='crypto'){for(let i=1;i<b.length;i++){const prev=b[i-1],now=b[i];if(prev&&now&&Date.parse(now.data)-Date.parse(prev.data)!==86400000)throw new Error('Lacuna nel calendario crypto giornaliero.');}}
      simulaPortafoglio({...p,ticker:s.ticker,titoli:[s.ticker],capitale:50,liquiditaMinPct:0,maxChiamate:0,perditaGiornaliera:null,modalita:'regole'}, {[s.ticker]:b}, {}, p.dal);
      serie[s.ticker]=b;
    }catch(e){motivo=e instanceof Error?e.message:'Dati non utilizzabili.';}
    copertura.push({ticker:s.ticker,fonte:s.fonte,dal:raw[0]?.data??null,al:raw.at(-1)?.data??null,barre:raw.length,incluso:!motivo,motivo:motivo||'Prezzi e cambi disponibili; calendario storico di borsa non certificato.'});
  }
  return {serie,copertura};
}
export function simulaAutonomo(p:ParametriAutonomi,d:DatiAutonomi){
  const {serie,copertura}=preparaAutonomo(p,d),titoli=Object.keys(serie);
  if(!titoli.length)throw new Error('Nessuno strumento con prezzi e cambi utilizzabili. Consulta le esclusioni.');
  const config:ConfigPortafoglio={...p,ticker:titoli[0]??'',titoli,capitale:50,liquiditaMinPct:0,maxChiamate:0,perditaGiornaliera:null,modalita:'regole',giornaliero:true,accantonamentoMensile:25};
  const risultato=simulaPortafoglio(config,serie);
  const mesi=risultato.mesiCapitale.map(m=>({mese:m.mese,rendimentoPct:m.rendimentoPct,valore:m.capitaleInvestibile}));
  return {config,risultato,copertura,mesi,mesiPositiviPct:mesi.length?mesi.filter(x=>x.rendimentoPct>0).length/mesi.length*100:0,opportunita:risultato.decisioni.length,liquiditaFerma:50,avvisi:[...d.avvisi,'Costo Lovable Pro simulato 25 EUR/mese: a fine mese si accantonano fino a 25 EUR del solo profitto netto realizzato (vendite, costi inclusi) e solo da liquidità libera; l’eccedenza resta investita, le perdite riducono il capitale, i profitti non realizzati non si accantonano. Mesi estremi possono essere parziali. Il rendimento composto concatena i rendimenti mensili prima dell’accantonamento.','Rules-only: nessuna valutazione delle capacità IA. Universo del catalogo attuale: survivorship bias; delisting e universo point-in-time non certificati.','Classifica: uscite prima degli ingressi, rapporto prezzo/SMA20 decrescente, simbolo alfabetico per parità. Segnali esistenti applicati a prezzi convertiti in EUR, quindi includono il cambio.','Cambi open/close giornalieri: allineamento intraday fra mercati e prezzo FX eseguibile non certificati. Crypto senza cambio nel weekend escluse; nessun riempimento dei dati.','Calendari distinti dalle barre: crypto richiede giorni consecutivi; festività/lacune azionarie brevi non distinguibili senza calendario del mercato. Benchmark equiponderato sul solo sottoinsieme coperto, non sull’intero mercato.']};
}
export type EsitoAutonomo=ReturnType<typeof simulaAutonomo>;