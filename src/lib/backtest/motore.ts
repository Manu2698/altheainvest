import { decide } from "../decisione";
import { problemaAccumulo, problemaDati } from "../protezioni";
import type { StrategyId } from "../strategies";

export type Barra = { data: string; apertura: number; chiusura: number; volume: number };
export type ConfigTest = { dal: string; al: string; strategia: StrategyId; ticker: string; capitale: number; quotaPct: number; commissione: number; spreadBps: number; slippageBps: number; perditaGiornaliera: number | null; modalita: "regole" | "comitato" };
export type Evidenza = { disponibileIl: string; fonte: string; contenuto: string; tipo: "fondamentali" | "news" };
export type Verdetto = { procedi: boolean; importo: number; motivo: string; dettagli: unknown };
export type Candidato = { data: string; chiusure: number[]; importo: number; motivo: string; posizione: { ticker: string; valore: number; pnlPct: number } | null; conto: { capitale: number; liquidita: number; investito: number; numeroPosizioni: number; perditaOggi: number; limitePerdita: number | null } };
export type OperazioneTest = { segnale: string; esecuzione: string; lato: "BUY" | "SELL"; prezzo: number; quantita: number; costo: number; pnl: number | null; motivo: string };
export type RisultatoTest = { stato: "completo" | "analisi_richiesta"; candidato: Candidato | null; curva: { data: string; equity: number; benchmark: number }[]; operazioni: OperazioneTest[]; decisioni: { data: string; motivo: string; dettagli: unknown }[]; equity: number; liquidita: number; aperto: number; pnlAperto: number; costi: number; vincentiPct: number | null; profitFactor: number | null; senzaPerdite: boolean; drawdownPct: number; rendimentoPct: number; vendite: number; mediaVincita: number | null; mediaPerdita: number | null; aspettativa: number | null; holdout: { dal: string; rendimentoPct: number; drawdownPct: number; vendite: number; vincentiPct: number | null; profitFactor: number | null }; limiti: string[] };

export const VERSIONE_TEST = "segnali-althea-v1-next-open-1";
const validaData = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
export function validaConfig(c: ConfigTest, oggi = new Date().toISOString().slice(0, 10)) {
  if (!validaData(c.dal) || !validaData(c.al) || c.dal >= c.al || c.al > oggi || c.dal < "1970-01-01") throw new Error("Periodo non valido: scegli date passate, dal 1970 in avanti.");
  if (!["conservativo", "medio", "aggressivo"].includes(c.strategia) || !["regole", "comitato"].includes(c.modalita)) throw new Error("Strategia o modalità non valida.");
  if (!/^[A-Z0-9./-]{1,15}$/.test(c.ticker)) throw new Error("Simbolo non valido.");
  if (![c.capitale, c.quotaPct, c.commissione, c.spreadBps, c.slippageBps].every(Number.isFinite) || c.capitale <= 0 || c.quotaPct <= 0 || c.quotaPct > 100 || c.commissione < 0 || c.spreadBps < 0 || c.slippageBps < 0 || c.spreadBps + c.slippageBps >= 10000 || (c.perditaGiornaliera !== null && (!Number.isFinite(c.perditaGiornaliera) || c.perditaGiornaliera < 0))) throw new Error("Capitale, quota o costi non validi.");
}
export function validaBarre(barre: Barra[]) {
  if (barre.length < 22 || barre.length > 25000) throw new Error("Sono richieste da 22 a 25.000 barre giornaliere, incluse almeno 20 prima dell’inizio.");
  for (const [i, b] of barre.entries()) {
    const prev = barre[i - 1];
    if (!validaData(b.data) || ![b.apertura, b.chiusura, b.volume].every(Number.isFinite) || b.apertura <= 0 || b.chiusura <= 0 || b.volume < 0 || (prev && prev.data >= b.data)) throw new Error("Barre non valide, duplicate o fuori ordine.");
  }
}
export function leggiCSV(testo: string): Barra[] {
  const righe = testo.trim().split(/\r?\n/);
  const intestazione = righe.shift()?.toLowerCase().trim();
  const sep = intestazione?.includes(";") ? ";" : ",";
  if (intestazione?.split(sep).join(",") !== "date,open,close,volume") throw new Error("Il CSV deve avere le colonne date,open,close,volume; prezzi aggiustati per split, non per dividendi.");
  const barre = righe.filter(r => r.trim()).map(r => { const [data, o, c, v] = r.split(sep).map(x => x.trim()); return { data: data ?? "", apertura: Number(o), chiusura: Number(c), volume: Number(v) }; });
  validaBarre(barre); return barre;
}
export function evidenzeAllaData(e: Evidenza[], data: string) {
  // Conservative cutoff: only documents already available at the start of the
  // simulated UTC day; avoids exchange DST/close-time look-ahead.
  const chiusura = Date.parse(`${data}T00:00:00Z`);
  return e.filter(x => Number.isFinite(Date.parse(x.disponibileIl)) && Date.parse(x.disponibileIl) <= chiusura && x.fonte.trim() && x.contenuto.trim());
}
export function periodoPrecedente(al: string, quantita: number, unita: "settimane" | "mesi" | "anni") {
  const d = new Date(`${al}T00:00:00Z`);
  if (unita === "settimane") d.setUTCDate(d.getUTCDate() - quantita * 7);
  else { const giorno = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - quantita * (unita === "anni" ? 12 : 1)); const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(giorno, ultimo)); }
  return d.toISOString().slice(0, 10);
}
function metricheTrade(pnl: number[]) { const v = pnl.filter(x => x > 0), p = pnl.filter(x => x < 0); const sv = v.reduce((a,b)=>a+b,0), sp = -p.reduce((a,b)=>a+b,0); return { vincentiPct: pnl.length ? v.length / pnl.length * 100 : null, profitFactor: sp ? sv / sp : null, senzaPerdite: sv > 0 && !sp, mediaVincita: v.length ? sv/v.length : null, mediaPerdita: p.length ? sp/p.length : null, aspettativa: pnl.length ? (sv-sp)/pnl.length : null }; }
function drawdown(curva: { equity: number }[], iniziale: number) { let picco = iniziale, max = 0; for (const p of curva) { picco = Math.max(picco,p.equity); max = Math.max(max,(picco-p.equity)/picco*100); } return max; }

/** Replay deterministico; segnali a chiusura, esecuzione soltanto alla successiva apertura. */
export function simula(c: ConfigTest, barre: Barra[], verdetti: Record<string, Verdetto> = {}): RisultatoTest {
  validaConfig(c); validaBarre(barre);
  const start = barre.findIndex(b => b.data >= c.dal);
  let end = -1;
  for (let i = barre.length - 1; i >= 0; i--) { const b = barre[i]; if (b && b.data <= c.al) { end = i; break; } }
  const primoPeriodo = barre[start], ultimoPeriodo = barre[end];
  if (start < 20 || end <= start || !primoPeriodo || !ultimoPeriodo || Date.parse(primoPeriodo.data) - Date.parse(c.dal) > 7*86400000 || Date.parse(c.al)-Date.parse(ultimoPeriodo.data)>7*86400000) throw new Error("Copertura insufficiente: servono almeno 20 barre prima dell’inizio e prezzi fino alla fine del periodo.");
  for (let i = start; i <= end; i++) { const attuale=barre[i], precedente=barre[i-1]; if(attuale&&precedente&&Date.parse(attuale.data)-Date.parse(precedente.data)>7*86400000) throw new Error("Storico con intervalli mancanti superiori a 7 giorni: risultati non calcolabili."); }
  let cash = c.capitale, qty = 0, costoBase = 0, costi = 0, candidato: Candidato | null = null;
  const operazioni: OperazioneTest[] = [], decisioni: RisultatoTest["decisioni"] = [], curva: RisultatoTest["curva"] = [];
  let pending: { lato: "BUY" | "SELL"; importo: number; segnale: string; motivo: string } | null = null;
  const attrito = (c.spreadBps / 2 + c.slippageBps) / 10000;
  const prima = barre[start]; if (!prima) throw new Error("Periodo vuoto.");
  const benchmarkQty = Math.max(0,(c.capitale-c.commissione)/(prima.apertura*(1+attrito)));
  let equityPrecedente = c.capitale;
  for (let i = start; i <= end; i++) {
    const b = barre[i]; if (!b) continue;
    if (pending) {
      const prezzo = b.apertura * (pending.lato === "BUY" ? 1+attrito : 1-attrito);
      if (pending.lato === "BUY" && b.volume > 0) {
        const budget = Math.min(cash,pending.importo), n = Math.max(0,(budget-c.commissione)/prezzo);
        if (n > 0 && budget >= 1) { const costo = c.commissione+n*b.apertura*attrito; qty += n; costoBase += budget; cash -= budget; costi += costo; operazioni.push({ segnale: pending.segnale, esecuzione: b.data, lato:"BUY",prezzo,quantita:n,costo,pnl:null,motivo:pending.motivo }); }
      } else if (pending.lato === "SELL" && qty > 0 && b.volume > 0) {
        const incasso = qty*prezzo-c.commissione, costo = c.commissione+qty*b.apertura*attrito;
        operazioni.push({ segnale:pending.segnale,esecuzione:b.data,lato:"SELL",prezzo,quantita:qty,costo,pnl:incasso-costoBase,motivo:pending.motivo }); cash += incasso; costi += costo; qty=0; costoBase=0;
      } else decisioni.push({data:b.data,motivo:"Esecuzione non simulabile: volume assente.",dettagli:null});
      pending = null;
    }
    const equity = cash+qty*b.chiusura;
    curva.push({data:b.data,equity,benchmark:benchmarkQty*b.chiusura});
    const chiusure = barre.slice(Math.max(0,i-119),i+1).map(x=>x.chiusura);
    const posizione = qty>0 ? {ticker:c.ticker,valore:qty*b.chiusura,pnlPct:(qty*b.chiusura/costoBase-1)*100} : undefined;
    const scelta = decide(c.strategia,c.ticker,chiusure,posizione,equity*c.quotaPct/100);
    const perditaOggi = equityPrecedente-equity; equityPrecedente=equity;
    if (i === end) continue;
    // Come nel motore corrente il limite giornaliero arresta il ciclo, senza inventare uscite.
    if (c.perditaGiornaliera && perditaOggi>=c.perditaGiornaliera) {decisioni.push({data:b.data,motivo:"Limite di perdita giornaliera simulato raggiunto: ciclo saltato.",dettagli:null}); continue;}
    if (scelta.azione === "vendi") pending={lato:"SELL",importo:0,segnale:b.data,motivo:scelta.motivo};
    if (scelta.azione !== "compra") continue;
    const blocco = problemaDati(chiusure,b.data,Date.parse(b.data)) ?? problemaAccumulo(c.strategia,posizione,chiusure);
    if (blocco) {decisioni.push({data:b.data,motivo:blocco,dettagli:null});continue;}
    let importo = Math.floor(Math.min(cash,scelta.importo)*100)/100;
    if (importo<1 || importo<=c.commissione) continue;
    if (c.modalita === "comitato") {
      const verdetto=verdetti[b.data];
      if (!verdetto) { candidato={data:b.data,chiusure,importo,motivo:scelta.motivo,posizione:posizione??null,conto:{capitale:equity,liquidita:cash,investito:qty*b.chiusura,numeroPosizioni:qty>0?1:0,perditaOggi,limitePerdita:c.perditaGiornaliera}}; break; }
      decisioni.push({data:b.data,motivo:verdetto.motivo,dettagli:verdetto.dettagli});
      if (!verdetto.procedi) continue;
      if (!Number.isFinite(verdetto.importo) || verdetto.importo<=0) continue;
      importo=Math.min(importo,verdetto.importo);
    }
    pending={lato:"BUY",importo,segnale:b.data,motivo:scelta.motivo};
  }
  const ultimo=curva.at(-1), ultimoPrezzo=barre.find(b=>b.data===ultimo?.data)?.chiusura??0;
  const chiuse=operazioni.filter(o=>o.pnl!==null), pnl=chiuse.map(o=>o.pnl??0);
  const split=Math.floor(curva.length*.7), validazione=curva.slice(split), baseValid=curva[split-1]?.equity??c.capitale;
  const hv=chiuse.filter(o=>o.esecuzione>=(validazione[0]?.data??c.al));
  return {stato:candidato?"analisi_richiesta":"completo",candidato,curva,operazioni,decisioni,equity:ultimo?.equity??c.capitale,liquidita:cash,aperto:qty*ultimoPrezzo,pnlAperto:qty*ultimoPrezzo-costoBase,costi,...metricheTrade(pnl),drawdownPct:drawdown(curva,c.capitale),rendimentoPct:((ultimo?.equity??c.capitale)/c.capitale-1)*100,vendite:pnl.length,holdout:{dal:validazione[0]?.data??c.al,rendimentoPct:((ultimo?.equity??baseValid)/baseValid-1)*100,drawdownPct:drawdown(validazione,baseValid),vendite:hv.length,vincentiPct:metricheTrade(hv.map(o=>o.pnl??0)).vincentiPct,profitFactor:metricheTrade(hv.map(o=>o.pnl??0)).profitFactor},limiti:["SIMULAZIONE, non risultato del conto. Nessun ordine inviato.","Un solo strumento scelto oggi: selezione storica dell’universo e survivorship bias non ricostruiti.","Segnali correnti e protezioni dati/accumulo; apprendimento, rotazione, negoziabilità storica e portafoglio multi-titolo non riprodotti.","Prezzi aggiustati per split richiesti. Dividendi, tasse, delisting, impatto di mercato ed esecuzioni parziali esclusi; spread/slippage/commissioni sono ipotesi.","Benchmark: acquisto e mantenimento dello stesso strumento, stesse date e costi iniziali; posizione non liquidata alla fine.","70% iniziale / 30% finale cronologico, senza ottimizzazione: non prova indipendente se i parametri sono stati scelti guardando questo periodo.",...(c.modalita==="comitato"?["Comitato sperimentale: documenti forniti dall’utente, provenienza non certificata; i modelli possono conoscere già gli esiti storici. Vendite di protezione fuori dal comitato, come nel motore attuale."]:[]),"Pochi trade e backtest positivi non dimostrano efficacia futura né autorizzano trading reale."]};
}