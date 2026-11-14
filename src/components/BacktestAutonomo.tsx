import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Download, Upload, Play, Pause } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { useSessione } from '@/hooks/useSessione';
import { STRATEGIE } from '@/lib/strategies';
import { getUniversoAutonomo, getPrezziAutonomi, getCambiAutonomi } from '@/lib/backtest/autonomo.functions';
import { simulaAutonomo, preparaAutonomo, type EsitoAutonomo, type DatiAutonomi, type ParametriAutonomi, type Copertura } from '@/lib/backtest/autonomo';
import { leggiCSV } from '@/lib/backtest/motore';

type Salvataggio={id:string;parametri:ParametriAutonomi;dati:DatiAutonomi;esito:EsitoAutonomo};
const vuoti=():DatiAutonomi=>({strumenti:[],serie:{},cambi:{},errori:{},avvisi:[]});
const n=(v:number)=>v.toFixed(2);
export function BacktestAutonomo(){
 const {utente,caricata,autenticato}=useSessione();
 const catalogo=useServerFn(getUniversoAutonomo),prezzi=useServerFn(getPrezziAutonomi),cambi=useServerFn(getCambiAutonomi);
 const [p,setP]=useState<ParametriAutonomi>({dal:'2025-10-01',al:'2025-12-31',strategia:'medio',quotaPct:10,commissione:0,spreadBps:10,slippageBps:5});
 const [d,setD]=useState<DatiAutonomi>(vuoti),[fonte,setFonte]=useState<'FMP'|'Alpaca'>('FMP'),[valuta,setValuta]=useState('EUR'),[mercato,setMercato]=useState<'azioni'|'crypto'>('azioni');
 const [busy,setBusy]=useState(false),[stato,setStato]=useState(''),[errore,setErrore]=useState(''),[copertura,setCopertura]=useState<Copertura[]>([]),[esito,setEsito]=useState<EsitoAutonomo|null>(null),[salvati,setSalvati]=useState<Salvataggio[]>([]);
 const stop=useRef(false),csv=useRef<HTMLInputElement>(null),fx=useRef<HTMLInputElement>(null);
 const storage=`althea-autonomo-v1-${utente?.id??'locale'}`;
 useEffect(()=>{if(!caricata)return;setEsito(null);setSalvati([]);try{const v=JSON.parse(localStorage.getItem(storage)??'[]');if(Array.isArray(v))setSalvati(v);}catch{setErrore('Salvataggi non leggibili.');}},[storage,caricata]);
 function salva(s:Salvataggio){setSalvati(old=>{const next=[s,...old].slice(0,3);try{localStorage.setItem(storage,JSON.stringify(next));}catch{setErrore('Spazio locale esaurito: esporta il risultato.');}return next;});}
 async function scopri(){setBusy(true);setErrore('');try{if(!autenticato)throw new Error('Accedi per leggere Financial Modeling Prep oppure importa CSV.');const r=await catalogo();setD(old=>({...old,strumenti:r.strumenti,avvisi:r.avvisi}));setStato(`${r.strumenti.length} strumenti nel catalogo ricevuto`);}catch(e){setErrore(e instanceof Error?e.message:'Catalogo non disponibile.');}finally{setBusy(false);}}
 async function avvia(){setBusy(true);setErrore('');setEsito(null);stop.current=false;let dati={...d,serie:{...d.serie},cambi:{...d.cambi},errori:{...d.errori},strumenti:d.strumenti.map(s=>({...s}))};
  try{
   if(!dati.strumenti.length){if(!autenticato)throw new Error('Accedi o importa un universo di prezzi CSV.');const r=await catalogo();dati={...dati,...r};}
   for(let i=0;i<dati.strumenti.length;i++){
    if(stop.current)break;const s=dati.strumenti[i];if(!s)continue;setStato(`Copertura ${i+1}/${dati.strumenti.length} · ${s.ticker}`);
    try{if(!dati.serie[s.ticker]){if(!autenticato)throw new Error('Prezzi CSV assenti.');const r=await prezzi({data:{...s,fonte,dal:p.dal,al:p.al}});dati.serie[s.ticker]=r.barre;s.valuta=r.valuta;s.fonte=r.fonte;}
      if(s.valuta&&s.valuta!=='EUR'&&!dati.cambi[s.valuta]){if(!autenticato)throw new Error(`Importa cambio ${s.valuta}/EUR.`);dati.cambi[s.valuta]=await cambi({data:{valuta:s.valuta,dal:p.dal,al:p.al}});}
      delete dati.errori[s.ticker];
    }catch(e){dati.errori[s.ticker]=e instanceof Error?e.message:'Fonte non disponibile.';
      // A denied plan/auth response affects the source, not just this symbol; stop wasting its quota.
      if(/HTTP (401|402|403|429)/.test(dati.errori[s.ticker]??'')){for(const rest of dati.strumenti.slice(i+1))if(!dati.serie[rest.ticker])dati.errori[rest.ticker]='Fonte bloccata: scansione interrotta dopo rifiuto del servizio.';stop.current=true;break;}}
    await new Promise(r=>setTimeout(r,0));
   }
   setD(dati);const prepared=preparaAutonomo(p,dati);setCopertura(prepared.copertura);
   if(stop.current){setStato('Scansione interrotta; copertura parziale, nessun risultato certificato.');return;}
   const r=simulaAutonomo(p,dati);setEsito(r);salva({id:crypto.randomUUID(),parametri:p,dati,esito:r});setStato('Simulazione rules-only completata');
  }catch(e){setErrore(e instanceof Error?e.message:'Simulazione interrotta.');}finally{setBusy(false);}
 }
 function esporta(){if(!esito)return;const url=URL.createObjectURL(new Blob([JSON.stringify({parametri:p,dati:d,esito},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='althea-rules-only-eur.json';a.click();URL.revokeObjectURL(url);}
 const modifica=(v:Partial<ParametriAutonomi>)=>setP(old=>({...old,...v}));
 return <section className="border-b border-border pb-8 mb-8 space-y-5 min-w-0">
 <header><h2 className="text-xl font-semibold">Prototipo autonomo · rules-only</h2><p className="text-xs text-warn mt-2">50 EUR · budget IA 0 · nessun ordine PAPER o REAL · non misura le capacità dell’IA</p></header>
 <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
 <label className="text-xs space-y-2">Strategia<Select value={p.strategia} onValueChange={v=>modifica({strategia:v as ParametriAutonomi['strategia']})}><SelectTrigger aria-label="Strategia autonoma"><SelectValue/></SelectTrigger><SelectContent>{STRATEGIE.map(s=><SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent></Select></label>
 {(['dal','al'] as const).map(k=><label key={k} className="text-xs space-y-2">{k==='dal'?'Dal':'Al'}<Input aria-label={`Autonomo ${k}`} type="date" value={p[k]} onChange={e=>modifica({[k]:e.target.value})}/></label>)}
 <label className="text-xs space-y-2">Fonte prezzi<Select value={fonte} onValueChange={v=>{setFonte(v as typeof fonte);setD(vuoti());}}><SelectTrigger aria-label="Fonte prezzi autonoma"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="FMP">Financial Modeling Prep</SelectItem><SelectItem value="Alpaca">Alpaca · universo FMP / CSV</SelectItem></SelectContent></Select></label>
 {([{k:'quotaPct',l:'Quota simulata per titolo (%)'},{k:'commissione',l:'Commissione simulata (EUR)'},{k:'spreadBps',l:'Spread simulato (bps)'},{k:'slippageBps',l:'Slippage simulato (bps)'}] as const).map(x=><label key={x.k} className="text-xs space-y-2">{x.l}<Input aria-label={x.l} type="number" min="0" value={p[x.k]} onChange={e=>modifica({[x.k]:Number(e.target.value)})}/></label>)}
 </fieldset>
 <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={scopri}>Scopri universo FMP</Button><Button disabled={busy} onClick={avvia}><Play className="size-4"/>Avvia prototipo autonomo</Button>{busy&&<Button variant="outline" onClick={()=>{stop.current=true;}}><Pause className="size-4"/>Interrompi scansione</Button>}</div>
 <details className="border-y border-border py-3"><summary className="text-sm font-semibold cursor-pointer">Universo CSV e cambi storici</summary><div className="mt-4 flex flex-wrap items-end gap-3">
 <label className="text-xs space-y-2">Valuta dei prezzi CSV<Select value={valuta} onValueChange={setValuta}><SelectTrigger aria-label="Valuta CSV autonomo"><SelectValue/></SelectTrigger><SelectContent>{['EUR','USD','GBP','CHF','JPY','CAD'].map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></label>
 <label className="text-xs space-y-2">Mercato CSV<Select value={mercato} onValueChange={v=>setMercato(v as typeof mercato)}><SelectTrigger aria-label="Mercato CSV autonomo"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="azioni">Azioni / ETF</SelectItem><SelectItem value="crypto">Crypto · calendario giornaliero</SelectItem></SelectContent></Select></label>
 <Button variant="outline" disabled={busy} onClick={()=>csv.current?.click()}><Upload className="size-4"/>Importa universo CSV</Button><Button variant="outline" disabled={busy} onClick={()=>fx.current?.click()}><Upload className="size-4"/>Importa cambio {valuta}/EUR</Button></div></details>
 <input ref={csv} type="file" multiple accept=".csv" className="hidden" aria-label="Universo CSV autonomo" onChange={async e=>{try{const next=vuoti();for(const file of Array.from(e.target.files??[])){if(file.size>5000000)throw new Error('CSV massimo 5 MB.');const ticker=file.name.replace(/\.csv$/i,'').toUpperCase();if(!/^[A-Z0-9./-]{1,15}$/.test(ticker))throw new Error('Nome CSV: simbolo dello strumento.');next.serie[ticker]=leggiCSV(await file.text());next.strumenti.push({ticker,valuta,mercato,fonte:`CSV ${file.name}`});}next.cambi=d.cambi;next.avvisi=['Universo fornito dai CSV: copertura limitata ai file importati, non all’intero mercato.'];setD(next);setErrore('');}catch(x){setErrore(x instanceof Error?x.message:'CSV non valido.');}e.target.value='';}}/>
 <input ref={fx} type="file" accept=".csv" className="hidden" aria-label="Cambio CSV autonomo" onChange={async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>5000000)throw new Error('CSV massimo 5 MB.');const b=leggiCSV(await file.text());setD(old=>({...old,cambi:{...old.cambi,[valuta]:b},avvisi:[...old.avvisi,`Cambio CSV dichiarato ${valuta}/EUR: EUR per unità di ${valuta}, open/close.`]}));setErrore('');}catch(x){setErrore(x instanceof Error?x.message:'Cambio non valido.');}e.target.value='';}}/>
 <p className="text-xs text-muted-foreground">Universo ricevuto: {d.strumenti.length} strumenti · serie caricate: {Object.keys(d.serie).length} · chiamate IA: 0</p>
 {stato&&<p role="status" className="text-xs">{stato}</p>}{errore&&<p role="alert" className="text-sm text-bear break-words">{errore}</p>}
 {salvati.length>0&&<div className="space-y-2"><h3 className="text-sm font-semibold">Prototipi salvati su questo dispositivo</h3><div className="flex flex-wrap gap-2">{salvati.map(s=><Button key={s.id} className="h-auto max-w-full whitespace-normal text-left" variant="outline" disabled={busy} onClick={()=>{setP(s.parametri);setD(s.dati);setEsito(s.esito);setCopertura(s.esito.copertura);}}>{s.parametri.strategia} · {s.parametri.dal} / {s.parametri.al} · {n(s.esito.risultato.equity)} EUR</Button>)}</div></div>}
 {esito&&<div className="space-y-4 border-t border-border pt-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Risultati rules-only · EUR</h3><Button variant="outline" onClick={esporta}><Download className="size-4"/>Esporta prototipo</Button></div>
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[{l:'Capitale iniziale',v:'50.00 EUR'},{l:'Valore finale',v:n(esito.risultato.equity)+' EUR'},{l:'Profitto / perdita netti',v:n(esito.risultato.equity-50)+' EUR'},{l:'Liquidità residua',v:n(esito.risultato.liquidita)+' EUR'},{l:'Acquisti / vendite',v:`${esito.risultato.acquisti} / ${esito.risultato.vendite}`},{l:'Costi di transazione',v:n(esito.risultato.costi)+' EUR'},{l:'Drawdown massimo',v:n(esito.risultato.drawdownPct)+'%'},{l:'Mesi positivi',v:n(esito.mesiPositiviPct)+'%'},{l:'Liquidità ferma',v:'50.00 EUR'},{l:'Benchmark equiponderato finale',v:n(esito.risultato.curva.at(-1)?.benchmark??50)+' EUR'},{l:'Opportunità / operazioni',v:`${esito.opportunita} / ${esito.risultato.operazioni.length}`},{l:'Posizioni aperte',v:String(Object.keys(esito.risultato.posizioni).length)}].map(x=><div key={x.l}><p className="text-xs text-muted-foreground">{x.l}</p><p className="font-semibold numeric break-words">{x.v}</p></div>)}</div>
 <details><summary className="font-semibold text-sm cursor-pointer">Rendimento mensile · mesi estremi eventualmente parziali</summary>{esito.mesi.map(m=><p key={m.mese} className="text-xs mt-2">{m.mese} · {n(m.rendimentoPct)}% · {n(m.valore)} EUR</p>)}</details>
 <details><summary className="font-semibold text-sm cursor-pointer">Posizioni aperte e operazioni</summary><div className="max-h-80 overflow-auto space-y-2 mt-3 text-xs">{Object.entries(esito.risultato.posizioni).map(([t,v])=><p key={t}>{t} · {v.quantita.toFixed(6)} · valore {n(v.quantita*v.prezzo)} EUR</p>)}{esito.risultato.operazioni.map((o,i)=><p key={i}>{o.ticker} · {o.lato} · segnale {o.segnale} → esecuzione {o.esecuzione} · {o.quantita.toFixed(6)} · {n(o.prezzo)} EUR · costo {n(o.costo)} EUR</p>)}</div></details>
 </div>}
 {copertura.length>0&&<details open><summary className="font-semibold text-sm cursor-pointer">Copertura effettiva: {copertura.filter(x=>x.incluso).length} inclusi / {copertura.filter(x=>!x.incluso).length} esclusi</summary><div className="max-h-80 overflow-auto mt-3 space-y-2 text-xs">{copertura.map(x=><p key={x.ticker} className="break-words">{x.ticker} · {x.incluso?'INCLUSO':'ESCLUSO'} · {x.barre} barre · {x.dal??'—'} / {x.al??'—'} · {x.fonte} · {x.motivo}</p>)}</div></details>}
 <div className="text-xs text-muted-foreground space-y-2">{(esito?.avvisi??d.avvisi).map((a,i)=><p key={i}>{a}</p>)}</div>
 </section>;
}