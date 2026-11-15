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