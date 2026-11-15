import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

export const getUniversoAutonomo=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  return (await import('./universo-alpaca.server')).catalogoAlpacaAutonomo(context.userId);
});
const assetSchema=z.object({ticker:z.string().regex(/^[A-Z0-9./-]{1,15}$/),valuta:z.string(),mercato:z.enum(['azioni','crypto']),fonte:z.string(),classe:z.enum(['azione','etf','crypto','us_equity_non_classificata']),exchange:z.string(),stato:z.string(),tradabile:z.boolean(),aggiornatoIl:z.string(),adjustment:z.enum(['split','nessuno','non_verificato'])});
export const getBloccoAutonomo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((i:{strumenti:z.infer<typeof assetSchema>[];dal:string;al:string})=>z.object({strumenti:z.array(assetSchema).min(1).max(25),dal:z.iso.date(),al:z.iso.date()}).refine(x=>x.dal<x.al&&x.al<=new Date().toISOString().slice(0,10)&&x.dal>='1970-01-01').parse(i))
 .handler(async({data,context})=>(await import('./universo-alpaca.server')).prezziAlpacaBlocco(context.userId,data.strumenti,data.dal,data.al));
const schema=z.object({ticker:z.string().regex(/^[A-Z0-9./-]{1,15}$/),valuta:z.string().regex(/^[A-Z]{3}$/).or(z.literal('')),mercato:z.enum(['azioni','crypto']),fonte:z.enum(['FMP','Alpaca']),dal:z.iso.date(),al:z.iso.date()}).refine(x=>x.dal<x.al&&x.al<=new Date().toISOString().slice(0,10)&&x.dal>='1970-01-01');
export const getPrezziAutonomi=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((i:z.infer<typeof schema>)=>schema.parse(i)).handler(async({data,context})=>{
  if(data.fonte==='Alpaca'){
    if(!data.valuta)throw new Error('Specificare la valuta verificata dei prezzi Alpaca.');
    const crypto=data.mercato==='crypto';
    const r=await(await import('./universo-alpaca.server')).prezziAlpacaBlocco(context.userId,[{ticker:data.ticker,valuta:data.valuta,mercato:data.mercato,fonte:'Alpaca',classe:crypto?'crypto':'us_equity_non_classificata',exchange:'',stato:'active',tradabile:true,aggiornatoIl:'',adjustment:crypto?'nessuno':'split'}],data.dal,data.al);
    if(r.errori[data.ticker])throw new Error(r.errori[data.ticker]);
    return {barre:r.serie[data.ticker]??[],fonte:crypto?'Alpaca Crypto':'Alpaca IEX · split',valuta:data.valuta};
  }
  return (await import('./prezzi-fmp.server')).prezziFMP({...data,fonte:'FMP'},data.dal,data.al);
 });
export const getCambiAutonomi=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((i:{valuta:string;dal:string;al:string})=>z.object({valuta:z.string().regex(/^[A-Z]{3}$/),dal:z.iso.date(),al:z.iso.date()}).refine(x=>x.dal<x.al&&x.al<=new Date().toISOString().slice(0,10)).parse(i))
 .handler(async({data})=>(await import('./prezzi-fmp.server')).cambiFMP(data.valuta,data.dal,data.al));
export const getUniversoNasdaq=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async()=>(await import('./universo-nasdaq.server')).catalogoNasdaq());
export const getUniversoIbrido=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>(await import('./universo-ibrido.server')).catalogoIbrido(context.userId));
export const getDiagnosticaAlpaca=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>(await import('./universo-alpaca.server')).diagnosticaAlpacaPaper(context.userId));
const barraSchema=z.object({data:z.iso.date(),apertura:z.number().positive(),chiusura:z.number().positive(),volume:z.number().min(0)});
const evidenzaSchema=z.object({ticker:z.string(),tipo:z.enum(['fondamentali','news','etf','crypto']),fonte:z.string().max(200),disponibileIl:z.string(),efficaceIl:z.string(),contenuto:z.string().max(4000)});
const inputSchema=z.object({ticker:z.string().regex(/^[A-Z0-9./-]{1,15}$/),classe:z.enum(['azione','etf','crypto','us_equity_non_classificata']),data:z.iso.date(),barre:z.array(barraSchema).max(400),evidenze:z.array(evidenzaSchema).max(20)});
const strategiaSchema=z.enum(['conservativo','medio','aggressivo']);
export const apriRunIA=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((i:{max:number})=>z.object({max:z.number().int().min(1).max(200)}).parse(i))
 .handler(async({data,context})=>{const l=await import('./ledger-ia.server');const runId=await l.apriRunIA(context.userId,data.max);return {runId,stato:await l.statoRunIA(context.userId,runId)};});
export const getStatoRunIA=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((i:{runId:string})=>z.object({runId:z.uuid()}).parse(i))
 .handler(async({data,context})=>(await import('./ledger-ia.server')).statoRunIA(context.userId,data.runId));
export const eseguiScreeningIA=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((i:{runId:string;strategia:string;inputs:unknown[]})=>z.object({runId:z.uuid(),strategia:strategiaSchema,inputs:z.array(inputSchema).min(1).max(10)}).parse(i))
 .handler(async({data,context})=>{
  const {rifiltraInput,motivoNonValutabile}=await import('./screening-autonomo');
  const inputs=data.inputs.map(i=>rifiltraInput(i));
  if(new Set(inputs.map(i=>i.ticker)).size!==inputs.length)throw new Error('Simboli duplicati nel blocco.');
  const non=inputs.find(i=>motivoNonValutabile(i));if(non)throw new Error(`${non.ticker}: ${motivoNonValutabile(non)}`);
  const {chiaveIdempotenza,eseguiConLedger}=await import('./ledger-ia');const s=await import('./screening-ia.server');const l=await import('./ledger-ia.server');
  const chiave=await chiaveIdempotenza('screening',{strategia:data.strategia,inputs});
  const esito=await eseguiConLedger(await l.ledgerServer(context.userId,data.runId),chiave,'screening',1,async()=>({risultato:await s.chiamaScreening(inputs,data.strategia),effettive:1}),(r):r is Awaited<ReturnType<typeof s.chiamaScreening>>=>s.verdettiCoerenti(inputs,r));
  return {esito,run:await l.statoRunIA(context.userId,data.runId)};
 });
export const eseguiComitatoIA=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((i:{runId:string;strategia:string;input:unknown})=>z.object({runId:z.uuid(),strategia:strategiaSchema,input:inputSchema}).parse(i))
 .handler(async({data,context})=>{
  const {rifiltraInput}=await import('./screening-autonomo');const input=rifiltraInput(data.input);
  if(input.barre.length<20)throw new Error('Prezzi point-in-time insufficienti per il comitato.');
  const c=await import('./comitato-autonomo.server');const l=await import('./ledger-ia.server');
  const ev=await c.evidenzeAutonome(context.userId,input.ticker,input.data);
  if(ev.mancante)return {esito:{stato:'non_eseguibile' as const,motivo:ev.mancante,avvisi:ev.avvisi},run:await l.statoRunIA(context.userId,data.runId)};
  const {chiaveIdempotenza,eseguiConLedger}=await import('./ledger-ia');
  const chiusure=input.barre.map(b=>b.chiusura);
  const chiave=await chiaveIdempotenza('comitato',{strategia:data.strategia,ticker:input.ticker,data:input.data,chiusure,evidenze:ev.evidenze});
  const esito=await eseguiConLedger(await l.ledgerServer(context.userId,data.runId),chiave,'comitato',9,async()=>{const r=await c.comitatoAutonomo(input.ticker,data.strategia,input.data,chiusure,ev.evidenze);return {risultato:JSON.parse(JSON.stringify(r)) as typeof r,effettive:r.chiamate};},(r):r is Awaited<ReturnType<typeof c.comitatoAutonomo>>=>!!r&&typeof r==='object'&&'approvato' in r&&typeof (r as {approvato:unknown}).approvato==='boolean');
  return {esito,run:await l.statoRunIA(context.userId,data.runId)};
 });
