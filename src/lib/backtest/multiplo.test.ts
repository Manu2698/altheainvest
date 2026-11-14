import { describe,it,expect } from "vitest";
import { leggiTitoli,eseguiTitolo } from "./multiplo";
import type { ConfigTest,Barra } from "./motore";
const config:ConfigTest={ticker:"AAPL",dal:"2000-01-21",al:"2000-02-19",strategia:"medio",capitale:1000,quotaPct:10,commissione:1,spreadBps:10,slippageBps:5,perditaGiornaliera:null,modalita:"regole"};
const barre:Barra[]=Array.from({length:50},(_,i)=>({data:new Date(Date.UTC(2000,0,i+1)).toISOString().slice(0,10),apertura:100+i,chiusura:100+i,volume:1000}));
describe("test multipli indipendenti",()=>{
 it("accetta più titoli e deduplica senza alterare simboli crypto",()=>{expect(leggiTitoli("aapl, MSFT; AAPL BTC/USD")).toEqual(["AAPL","MSFT","BTC/USD"]);});
 it("rifiuta liste vuote e oltre 20 titoli",()=>{expect(()=>leggiTitoli("")).toThrow();expect(()=>leggiTitoli(Array.from({length:21},(_,i)=>`T${i}`).join(","))).toThrow();});
 it("non condivide capitale o errori fra titoli",()=>{const a=eseguiTitolo(config,barre,"test");const b=eseguiTitolo({...config,ticker:"MSFT"},barre,"test");expect(a.risultato?.equity).toBe(b.risultato?.equity);expect(a.config.capitale).toBe(1000);expect(eseguiTitolo({...config,ticker:"BAD"},[],"test").risultato).toBeNull();expect(a.risultato?.stato).toBe("completo");});
});
