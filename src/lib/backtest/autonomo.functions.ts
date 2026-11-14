import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

export const getUniversoAutonomo=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async()=>{
  return (await import('./prezzi-fmp.server')).catalogoFMP();
});
const schema=z.object({ticker:z.string().regex(/^[A-Z0-9./-]{1,15}$/),valuta:z.string().regex(/^[A-Z]{3}$/).or(z.literal('')),mercato:z.enum(['azioni','crypto']),fonte:z.enum(['FMP','Alpaca']),dal:z.iso.date(),al:z.iso.date()}).refine(x=>x.dal<x.al&&x.al<=new Date().toISOString().slice(0,10)&&x.dal>='1970-01-01');
export const getPrezziAutonomi=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((i:z.infer<typeof schema>)=>schema.parse(i)).handler(async({data,context})=>{
  if(data.fonte==='Alpaca'){
    const r=await(await import('./historique.server')).caricaStorico(context.userId,data.ticker,data.dal,data.al);
    if(!data.valuta)throw new Error('Specificare la valuta verificata dei prezzi Alpaca.');
    return {...r,valuta:data.valuta};
  }
  return (await import('./prezzi-fmp.server')).prezziFMP({...data,fonte:'FMP'},data.dal,data.al);
 });
export const getCambiAutonomi=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator((i:{valuta:string;dal:string;al:string})=>z.object({valuta:z.string().regex(/^[A-Z]{3}$/),dal:z.iso.date(),al:z.iso.date()}).refine(x=>x.dal<x.al&&x.al<=new Date().toISOString().slice(0,10)).parse(i))
 .handler(async({data})=>(await import('./prezzi-fmp.server')).cambiFMP(data.valuta,data.dal,data.al));