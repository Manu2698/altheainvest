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
 it('perdite e profitti aperti non finanziano il costo mensile, contabilità resta riconciliata',()=>{
  const r=simulaPortafoglio(cfg,{X:barre(i=>100+Math.sin(i/5)*30)});
  expect(r.equity+r.accantonato-50).toBeCloseTo(r.operazioni.reduce((s,o)=>s+(o.pnl??0),0)+r.pnlAperto,8);
  expect(r.mesiCapitale.every(m=>m.reinvestito===Math.max(0,m.realizzato-m.accantonato))).toBe(true);
  for(const m of r.mesiCapitale.filter(m=>m.realizzato<=0))expect(m.accantonato).toBe(0);
  expect(r.mesiCapitale.some(m=>m.realizzato<0)).toBe(true);
 });
 it('valuta posizioni aperte senza accantonare guadagni non realizzati',()=>{
  const r=simulaPortafoglio({...cfg as object,strategia:'medio'} as never,{X:barre(i=>100+i*.1)});
  expect(r.acquisti).toBeGreaterThan(0);expect(r.vendite).toBe(0);expect(r.pnlAperto).toBeGreaterThan(0);expect(r.accantonato).toBe(0);expect(r.mesiCapitale.every(m=>m.scoperto===25)).toBe(true);
 });
});
