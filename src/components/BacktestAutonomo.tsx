import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Download, Upload, Play, Pause } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { useSessione } from '@/hooks/useSessione';
import { STRATEGIE } from '@/lib/strategies';
import { getUniversoAutonomo, getBloccoAutonomo, getPrezziAutonomi, getCambiAutonomi } from '@/lib/backtest/autonomo.functions';
import { preparaAutonomo, type EsitoAutonomo, type DatiAutonomi, type ParametriAutonomi, type Copertura } from '@/lib/backtest/autonomo';
import { leggiCSV } from '@/lib/backtest/motore';
import { blocchi, verificaSerie, type AssetAutonomo, type UniversoAutonomo } from '@/lib/backtest/universo-autonomo';
import { checkpointAutonomo } from '@/lib/backtest/checkpoint-autonomo';

type Salvataggio={id:string;parametri:ParametriAutonomi;dati:DatiAutonomi;esito:EsitoAutonomo};
const vuoti=():DatiAutonomi=>({strumenti:[],serie:{},cambi:{},errori:{},avvisi:[]});
const n=(v:number)=>v.toFixed(2);
export function BacktestAutonomo(){
 const {utente,caricata,autenticato}=useSessione();
 const catalogo=useServerFn(getUniversoAutonomo),blocco=useServerFn(getBloccoAutonomo),prezzi=useServerFn(getPrezziAutonomi),cambi=useServerFn(getCambiAutonomi);
 const [p,setP]=useState<ParametriAutonomi>({dal:'2025-10-01',al:'2025-12-31',strategia:'medio',quotaPct:10,commissione:0,spreadBps:10,slippageBps:5});
 const [d,setD]=useState<DatiAutonomi>(vuoti),[fonte,setFonte]=useState<'FMP'|'Alpaca'>('Alpaca'),[valuta,setValuta]=useState('EUR'),[mercato,setMercato]=useState<'azioni'|'crypto'>('azioni');
 const [universo,setUniverso]=useState<UniversoAutonomo|null>(null),[budget,setBudget]=useState(0),[blocchiFiniti,setBlocchiFiniti]=useState(0);
 const [busy,setBusy]=useState(false),[stato,setStato]=useState(''),[errore,setErrore]=useState(''),[copertura,setCopertura]=useState<Copertura[]>([]),[esito,setEsito]=useState<EsitoAutonomo|null>(null),[salvati,setSalvati]=useState<Salvataggio[]>([]);
 const stop=useRef(false),csv=useRef<HTMLInputElement>(null),fx=useRef<HTMLInputElement>(null);
 const storage=`althea-autonomo-v1-${utente?.id??'locale'}`;
 useEffect(()=>{if(!caricata)return;setEsito(null);setSalvati([]);try{const v=JSON.parse(localStorage.getItem(storage)??'[]');if(Array.isArray(v))setSalvati(v);}catch{setErrore('Salvataggi non leggibili.');}},[storage,caricata]);
 async function scopri(){if(busy)return;setBusy(true);setErrore('');setEsito(null);setCopertura([]);setBlocchiFiniti(0);try{if(!autenticato)throw new Error('Accedi per acquisire il catalogo Alpaca.');const r=await catalogo();setUniverso(r);setD({...vuoti(),strumenti:r.strumenti,avvisi:r.avvisi});setStato(`${r.strumenti.length} strumenti attivi e tradabili nel catalogo ricevuto`);}catch(e){setUniverso(null);setD(vuoti());setStato('INCOMPLETE');setErrore(e instanceof Error?e.message:'Catalogo non disponibile.');}finally{setBusy(false);}}
 async function avvia(){if(busy)return;setBusy(true);setErrore('');setEsito(null);stop.current=false;let dati={...d,serie:{...d.serie},cambi:{...d.cambi},errori:{...d.errori},strumenti:d.strumenti.map(s=>({...s}))};
   let chiaveDati='',finiti=0;
  try{
   if(!dati.strumenti.length){if(!autenticato)throw new Error('Accedi per acquisire automaticamente il catalogo Alpaca.');const r=await catalogo();setUniverso(r);dati={...dati,...r};}
   chiaveDati=JSON.stringify({dal:p.dal,al:p.al,fonte,strumenti:dati.strumenti});
   if(fonte==='Alpaca' && dati.strumenti.some(s=>'classe' in s)){
    if(!utente)throw new Error('Accedi per salvare i checkpoint.');
    const key=chiaveDati;
    const cached=await checkpointAutonomo<{dati:DatiAutonomi;finiti:number;incerto:boolean;errore:string}>(utente.id,key);
    if(cached){dati=cached.dati;finiti=cached.finiti;setBlocchiFiniti(finiti);if(cached.incerto||cached.errore){setD(dati);throw new Error(cached.errore||'Blocco incerto: nessun reinvio automatico.');}}
    const assets=dati.strumenti.filter((s):s is AssetAutonomo=>'classe' in s),batches=blocchi(assets,25);
    for(let i=0;i<batches.length;i++){
     if(stop.current)break;const batch=batches[i]?.filter(s=>!dati.serie[s.ticker]&&!dati.errori[s.ticker]);if(!batch?.length)continue;
     setStato(`Acquisizione blocco ${i+1}/${batches.length} · ${batch.length} strumenti`);
     await checkpointAutonomo(utente.id,key,{dati,finiti:i,incerto:true,errore:''});
     try{const r=await blocco({data:{strumenti:batch,dal:p.dal,al:p.al}});Object.assign(dati.serie,r.serie);Object.assign(dati.errori,r.errori);
      for(const s of batch){try{verificaSerie(s,dati.serie[s.ticker]??[],p.dal,p.al);}catch(e){dati.errori[s.ticker]=e instanceof Error?e.message:'Serie non verificata.';}}
      finiti=i+1;await checkpointAutonomo(utente.id,key,{dati,finiti,incerto:false,errore:''});setBlocchiFiniti(finiti);
     }catch(e){const msg=e instanceof Error?e.message:'Provider non disponibile.';await checkpointAutonomo(utente.id,key,{dati,finiti:i,incerto:true,errore:msg});throw new Error(msg);}
     await new Promise(r=>setTimeout(r,0));
    }
   }
   for(let i=0;i<dati.strumenti.length;i++){
    if(stop.current)break;const s=dati.strumenti[i];if(!s)continue;setStato(`Copertura ${i+1}/${dati.strumenti.length} · ${s.ticker}`);
    if(dati.errori[s.ticker])continue;
    try{if(!dati.serie[s.ticker]){if('classe' in s&&fonte==='Alpaca')continue;if(!autenticato)throw new Error('Prezzi CSV assenti.');const r=await prezzi({data:{...s,fonte,dal:p.dal,al:p.al}});dati.serie[s.ticker]=r.barre;s.valuta=r.valuta;s.fonte=r.fonte;}
      if(s.valuta&&s.valuta!=='EUR'&&!dati.cambi[s.valuta]){if(!autenticato)throw new Error(`Importa cambio ${s.valuta}/EUR.`);dati.cambi[s.valuta]=await cambi({data:{valuta:s.valuta,dal:p.dal,al:p.al}});}
      if(!('classe' in s))delete dati.errori[s.ticker];
    }catch(e){dati.errori[s.ticker]=e instanceof Error?e.message:'Fonte non disponibile.';
      // A denied plan/auth response affects the source, not just this symbol; stop wasting its quota.
      if(/HTTP (401|402|403|429)/.test(dati.errori[s.ticker]??'')){for(const rest of dati.strumenti.slice(i+1))if(!dati.serie[rest.ticker])dati.errori[rest.ticker]='Fonte bloccata: scansione interrotta dopo rifiuto del servizio.';stop.current=true;break;}}
    await new Promise(r=>setTimeout(r,0));
   }
   setD(dati);const prepared=preparaAutonomo(p,dati);setCopertura(prepared.copertura);
   if(utente)await checkpointAutonomo(utente.id,chiaveDati,{dati,finiti,incerto:false,errore:stop.current&&Object.values(dati.errori).some(e=>/HTTP (401|402|403|429)/.test(e))?'Fonte bloccata: nessun reinvio automatico.':''});
   if(stop.current){setStato('INCOMPLETE · scansione interrotta; copertura parziale.');return;}
   setStato('INCOMPLETE · screening IA 0 · comitato 0');
   throw new Error('Screening IA non attivato: mancano registro server persistente del budget/anti-duplicazione e blocco dei rifiuti del modello; evidenze storiche ETF/crypto e classificazione azione/ETF non disponibili. Nessuna simulazione IA completa dichiarata.');
  }catch(e){setD(dati);setStato('INCOMPLETE');setErrore(e instanceof Error?e.message:'Simulazione interrotta.');}finally{setBusy(false);}
 }
 function esporta(){if(!esito)return;const url=URL.createObjectURL(new Blob([JSON.stringify({parametri:p,dati:d,esito},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='althea-rules-only-eur.json';a.click();URL.revokeObjectURL(url);}
 const modifica=(v:Partial<ParametriAutonomi>)=>{setP(old=>({...old,...v}));setEsito(null);setCopertura([]);if(v.dal!==undefined||v.al!==undefined){setD(old=>({...old,serie:{},cambi:{},errori:{}}));setBlocchiFiniti(0);}};
 return <section className="border-b border-border pb-8 mb-8 space-y-5 min-w-0">
 <header><h2 className="text-xl font-semibold">Backtest autonomo · universo Alpaca</h2><p className="text-xs text-warn mt-2">50 EUR · accantonamento 25 EUR/mese da profitto realizzato · solo simulazione · INCOMPLETE</p></header>
 <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
 <label className="text-xs space-y-2">Strategia<Select value={p.strategia} onValueChange={v=>modifica({strategia:v as ParametriAutonomi['strategia']})}><SelectTrigger aria-label="Strategia autonoma"><SelectValue/></SelectTrigger><SelectContent>{STRATEGIE.map(s=><SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent></Select></label>
 {(['dal','al'] as const).map(k=><label key={k} className="text-xs space-y-2">{k==='dal'?'Dal':'Al'}<Input aria-label={`Autonomo ${k}`} type="date" value={p[k]} onChange={e=>modifica({[k]:e.target.value})}/></label>)}
 <label className="text-xs space-y-2">Fonte prezzi<Select value={fonte} onValueChange={v=>{setFonte(v as typeof fonte);setD(vuoti());setUniverso(null);}}><SelectTrigger aria-label="Fonte prezzi autonoma"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="FMP">FMP · secondaria, adjustment da verificare</SelectItem><SelectItem value="Alpaca">Alpaca · catalogo automatico</SelectItem></SelectContent></Select></label>
 <label className="text-xs space-y-2">Budget massimo chiamate IA<Input aria-label="Budget IA autonomo" type="number" min="0" max="10000" step="1" value={budget} onChange={e=>setBudget(Math.max(0,Math.min(10000,Math.floor(Number(e.target.value)||0))))}/></label>
 {([{k:'quotaPct',l:'Quota simulata per titolo (%)'},{k:'commissione',l:'Commissione simulata (EUR)'},{k:'spreadBps',l:'Spread simulato (bps)'},{k:'slippageBps',l:'Slippage simulato (bps)'}] as const).map(x=><label key={x.k} className="text-xs space-y-2">{x.l}<Input aria-label={x.l} type="number" min="0" value={p[x.k]} onChange={e=>modifica({[x.k]:Number(e.target.value)})}/></label>)}
 </fieldset>
 <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={scopri}>Acquisisci universo Alpaca</Button><Button disabled={busy} onClick={avvia}><Play className="size-4"/>Acquisisci storico / riprendi</Button>{busy&&<Button variant="outline" onClick={()=>{stop.current=true;}}><Pause className="size-4"/>Interrompi scansione</Button>}</div>
 <details className="border-y border-border py-3"><summary className="text-sm font-semibold cursor-pointer">Universo CSV e cambi storici</summary><div className="mt-4 flex flex-wrap items-end gap-3">
 <label className="text-xs space-y-2">Valuta dei prezzi CSV<Select value={valuta} onValueChange={setValuta}><SelectTrigger aria-label="Valuta CSV autonomo"><SelectValue/></SelectTrigger><SelectContent>{['EUR','USD','GBP','CHF','JPY','CAD'].map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></label>
 <label className="text-xs space-y-2">Mercato CSV<Select value={mercato} onValueChange={v=>setMercato(v as typeof mercato)}><SelectTrigger aria-label="Mercato CSV autonomo"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="azioni">Azioni / ETF</SelectItem><SelectItem value="crypto">Crypto · calendario giornaliero</SelectItem></SelectContent></Select></label>
 <Button variant="outline" disabled={busy} onClick={()=>csv.current?.click()}><Upload className="size-4"/>Importa universo CSV</Button><Button variant="outline" disabled={busy} onClick={()=>fx.current?.click()}><Upload className="size-4"/>Importa cambio {valuta}/EUR</Button></div></details>
 <input ref={csv} type="file" multiple accept=".csv" className="hidden" aria-label="Universo CSV autonomo" onChange={async e=>{try{const next=vuoti();for(const file of Array.from(e.target.files??[])){if(file.size>5000000)throw new Error('CSV massimo 5 MB.');const ticker=file.name.replace(/\.csv$/i,'').toUpperCase();if(!/^[A-Z0-9./-]{1,15}$/.test(ticker))throw new Error('Nome CSV: simbolo dello strumento.');next.serie[ticker]=leggiCSV(await file.text());next.strumenti.push({ticker,valuta,mercato,fonte:`CSV ${file.name}`});}next.cambi=d.cambi;next.avvisi=['Universo fornito dai CSV: copertura limitata ai file importati, non all’intero mercato.'];setD(next);setErrore('');}catch(x){setErrore(x instanceof Error?x.message:'CSV non valido.');}e.target.value='';}}/>
 <input ref={fx} type="file" accept=".csv" className="hidden" aria-label="Cambio CSV autonomo" onChange={async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>5000000)throw new Error('CSV massimo 5 MB.');const b=leggiCSV(await file.text());setD(old=>({...old,cambi:{...old.cambi,[valuta]:b},avvisi:[...old.avvisi,`Cambio CSV dichiarato ${valuta}/EUR: EUR per unità di ${valuta}, open/close.`]}));setErrore('');}catch(x){setErrore(x instanceof Error?x.message:'Cambio non valido.');}e.target.value='';}}/>
 <p className="text-xs text-muted-foreground">Totale scoperto: {d.strumenti.length} · storico caricato: {Object.keys(d.serie).length} · storico utilizzabile: {copertura.filter(x=>x.incluso).length} · eleggibili IA verificati: 0 · screening IA: 0 · comitati completati: 0 · esclusi: {copertura.filter(x=>!x.incluso).length} · blocchi completati: {blocchiFiniti} · budget consumato/rimanente: 0/{budget}</p>
 <p className="text-xs text-muted-foreground">Checkpoint solo su questo dispositivo e browser, non un registro server né una protezione tra dispositivi. Dividendi, universo storico e conoscenza futura del modello non certificati.</p>
 <p className="text-xs text-warn">Screening IA BLOCCATO: budget server persistente e metadati/evidenze storiche per classe non disponibili. Nessuna chiamata IA abilitata.</p>
 {universo&&<p className="text-xs text-muted-foreground">Provider: {universo.provider} · aggiornamento: {universo.aggiornatoIl} · righe acquisite: {universo.totaleAcquisito} · classi: {universo.classi.join(', ')} · stima minima teorica screening: {Math.ceil(d.strumenti.length/10)} chiamate batch, più fino a 9 per candidato al comitato; eleggibilità da verificare.</p>}
 {stato&&<p role="status" className="text-xs">{stato}</p>}{errore&&<p role="alert" className="text-sm text-bear break-words">{errore}</p>}
 {salvati.length>0&&<div className="space-y-2"><h3 className="text-sm font-semibold">Prototipi salvati su questo dispositivo</h3><div className="flex flex-wrap gap-2">{salvati.map(s=><Button key={s.id} className="h-auto max-w-full whitespace-normal text-left" variant="outline" disabled={busy} onClick={()=>{setP(s.parametri);setD(s.dati);setEsito(s.esito);setCopertura(s.esito.copertura);}}>{s.parametri.strategia} · {s.parametri.dal} / {s.parametri.al} · {n(s.esito.risultato.equity)} EUR</Button>)}</div></div>}
 {esito&&<div className="space-y-4 border-t border-border pt-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Risultati rules-only · EUR</h3><Button variant="outline" onClick={esporta}><Download className="size-4"/>Esporta prototipo</Button></div>
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[{l:'Capitale iniziale',v:'50.00 EUR'},{l:'Valore finale',v:n(esito.risultato.equity)+' EUR'},{l:'Profitto / perdita netti (con accantonato)',v:n(esito.risultato.equity+esito.risultato.accantonato-50)+' EUR'},{l:'Accantonato per Lovable',v:n(esito.risultato.accantonato)+' EUR'},{l:'Mesi coperti / non coperti',v:`${esito.risultato.mesiCapitale.filter(m=>m.scoperto<0.005).length} / ${esito.risultato.mesiCapitale.filter(m=>m.scoperto>=0.005).length}`},{l:'Rendimento composto',v:n(esito.risultato.rendimentoCompostoPct)+'%'},{l:'P/L non realizzato',v:n(esito.risultato.pnlAperto)+' EUR'},{l:'Liquidità residua',v:n(esito.risultato.liquidita)+' EUR'},{l:'Acquisti / vendite',v:`${esito.risultato.acquisti} / ${esito.risultato.vendite}`},{l:'Costi di transazione',v:n(esito.risultato.costi)+' EUR'},{l:'Drawdown massimo',v:n(esito.risultato.drawdownPct)+'%'},{l:'Mesi positivi',v:n(esito.mesiPositiviPct)+'%'},{l:'Benchmark equiponderato finale',v:n(esito.risultato.curva.at(-1)?.benchmark??50)+' EUR'},{l:'Opportunità / operazioni',v:`${esito.opportunita} / ${esito.risultato.operazioni.length}`},{l:'Posizioni aperte',v:String(Object.keys(esito.risultato.posizioni).length)}].map(x=><div key={x.l}><p className="text-xs text-muted-foreground">{x.l}</p><p className="font-semibold numeric break-words">{x.v}</p></div>)}</div>
 <details open><summary className="font-semibold text-sm cursor-pointer">Capitale mese per mese · costo Lovable 25 EUR</summary><div className="overflow-auto mt-3"><table className="w-full text-xs numeric"><thead><tr className="text-left text-muted-foreground">{['Mese','Capitale inizio','Realizzato netto','Costi transazione','Non realizzato','Accantonato','Non coperto','Reinvestito','Capitale investibile','Rendimento'].map(h=><th key={h} className="pr-3 pb-2 font-normal">{h}</th>)}</tr></thead><tbody>{esito.risultato.mesiCapitale.map(m=><tr key={m.mese} className="border-t border-border"><td className="pr-3 py-1">{m.mese}</td><td className="pr-3">{n(m.capitaleInizio)}</td><td className="pr-3">{n(m.realizzato)}</td><td className="pr-3">{n(m.costiTransazione)}</td><td className="pr-3">{n(m.nonRealizzato)}</td><td className="pr-3">{n(m.accantonato)}</td><td className={m.scoperto>=0.005?'pr-3 text-bear':'pr-3'}>{n(m.scoperto)}</td><td className="pr-3">{n(m.reinvestito)}</td><td className="pr-3">{n(m.capitaleInvestibile)}</td><td>{n(m.rendimentoPct)}%</td></tr>)}</tbody></table></div></details>
 <details><summary className="font-semibold text-sm cursor-pointer">Posizioni aperte e operazioni</summary><div className="max-h-80 overflow-auto space-y-2 mt-3 text-xs">{Object.entries(esito.risultato.posizioni).map(([t,v])=><p key={t}>{t} · {v.quantita.toFixed(6)} · valore {n(v.quantita*v.prezzo)} EUR</p>)}{esito.risultato.operazioni.map((o,i)=><p key={i}>{o.ticker} · {o.lato} · segnale {o.segnale} → esecuzione {o.esecuzione} · {o.quantita.toFixed(6)} · {n(o.prezzo)} EUR · costo {n(o.costo)} EUR</p>)}</div></details>
 </div>}
 {copertura.length>0&&<details open><summary className="font-semibold text-sm cursor-pointer">Copertura effettiva: {copertura.filter(x=>x.incluso).length} inclusi / {copertura.filter(x=>!x.incluso).length} esclusi</summary><div className="max-h-80 overflow-auto mt-3 space-y-2 text-xs">{copertura.map(x=><p key={x.ticker} className="break-words">{x.ticker} · {x.incluso?'INCLUSO':'ESCLUSO'} · {x.barre} barre · {x.dal??'—'} / {x.al??'—'} · {x.fonte} · {x.motivo}</p>)}</div></details>}
 <div className="text-xs text-muted-foreground space-y-2">{(esito?.avvisi??d.avvisi).map((a,i)=><p key={i}>{a}</p>)}</div>
 </section>;
}