import { describe, it, expect } from 'vitest';
import { simulaPortafoglio } from './portafoglio';
import type { Barra } from './motore';
const barre=(f:(i:number)=>number):Barra[]=>Array.from({length:150},(_,i)=>{const d=new Date(Date.UTC(2025,0,1)+i*86400000).toISOString().slice(0,10),p=f(i);return {data:d,apertura:p,chiusura:p,massimo:p,minimo:p,volume:1000};});
const cfg={ticker:'X',titoli:['X'],dal:'2025-02-01',al:'2025-05-30',strategia:'aggressivo',capitale:50,quotaPct:100,commissione:0,spreadBps:0,slippageBps:0,liquiditaMinPct:0,maxChiamate:0,perditaGiornaliera:null,modalita:'regole',giornaliero:true,accantonamentoMensile:25} as never;
describe('accantonamento Lovable',()=>{
 it('accantona al massimo 25 e solo da profitto realizzato, mai oltre',()=>{
  const r=simulaPortafoglio(cfg,{X:barre(i=>100+Math.sin(i/5)*30)});
  for(const m of r.mesiCapitale){expect(m.accantonato).toBeLessThanOrEqual(25+1e-9);expect(m.accantonato).toBeLessThanOrEqual(Math.max(0,m.realizzato)+1e-9);expect(m.accantonato+m.scoperto).toBeCloseTo(25);}
  expect(r.accantonato).toBeCloseTo(r.mesiCapitale.reduce((s,m)=>s+m.accantonato,0));
 });
 it('senza vendite in profitto nessun prelievo: mese non coperto',()=>{
  const r=simulaPortafoglio(cfg,{X:barre(()=>100)});
  for(const m of r.mesiCapitale){expect(m.accantonato).toBe(0);expect(m.scoperto).toBe(25);}
  expect(r.equity).toBeCloseTo(50);
 });
});
