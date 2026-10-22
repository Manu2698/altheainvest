import { describe,it,expect } from "vitest";
import { contabilizzaEsecuzioni, verificaEseguito, capitalePendenti, type Fill } from "./esecuzioni";
const f=(id:string,lato:string,quantita:number,prezzo:number):Fill=>({id,ordine:id,ticker:"TEST",lato,quantita,prezzo,ora:`2026-10-22T10:00:0${id}Z`});
describe("contabilità delle esecuzioni",()=>{
  it("acquisti ripetuti e vendite parziali usano costo medio effettivo",()=>{
    const r=contabilizzaEsecuzioni([f("1","buy",2,10),f("2","buy",2,20),f("3","sell",1,12)],true);
    expect(r.saldi[0]).toMatchObject({quantita:3,costo:45,prezzoMedio:15,realizzato:-3,coerente:true});
  });
  it("non rielabora esecuzioni duplicate dopo riavvio",()=>expect(contabilizzaEsecuzioni([f("1","buy",2,10),f("1","buy",2,10)],true).saldi[0]?.quantita).toBe(2));
  it("non inventa costo iniziale senza storico completo",()=>expect(contabilizzaEsecuzioni([f("1","sell",1,20)],false).vendite).toEqual([]));
  it("blocca vendite superiori alla posizione ricostruita",()=>expect(contabilizzaEsecuzioni([f("1","buy",1,10),f("2","sell",2,20)],true).saldi[0]?.coerente).toBe(false));
  it("blocca un duplicato con prezzo diverso",()=>expect(contabilizzaEsecuzioni([f("1","buy",1,10),f("1","buy",1,20)],true).saldi[0]?.coerente).toBe(false));
  it("verifica quantità e prezzo medio ponderato di un parziale",()=>{expect(verificaEseguito(3,15,[f("1","buy",1,5),f("2","buy",2,20)])).toBe(true);expect(verificaEseguito(3,16,[f("1","buy",1,5),f("2","buy",2,20)])).toBe(false);});
  it("rifiutato senza esecuzioni non crea P&L",()=>expect(verificaEseguito(0,null,[])).toBe(true));
  it("riserva solo controvalore ancora pendente di un parziale",()=>expect(capitalePendenti([{side:"buy",notional:50,filled_qty:2,filled_avg_price:10}])).toBe(30));
  it("non azzera impegno di ordine market in quantità ignoto",()=>expect(capitalePendenti([{side:"buy",qty:10,type:"market"}])).toBeNull());
});