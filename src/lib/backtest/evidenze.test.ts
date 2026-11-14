import {describe,it,expect} from "vitest";
import {bilanciStorici,notizieStoriche} from "./evidenze";
describe("fonti storiche senza JSON",()=>{
 it("usa pubblicazione e non data fiscale, esclude bilanci futuri o senza pubblicazione",()=>{const rows=[{symbol:"AAPL",date:"1999-12-31",filingDate:"2000-02-01",revenue:100},{symbol:"AAPL",date:"1999-12-31",revenue:100}];expect(bilanciStorici(rows,"AAPL","2000-01-21")).toHaveLength(0);expect(bilanciStorici(rows,"AAPL","2000-02-01")).toHaveLength(0);expect(bilanciStorici(rows,"AAPL","2000-02-02")[0]?.disponibileIl).toBe("2000-02-02T00:00:00.000Z");});
 it("non mescola bilanci di altri titoli",()=>{expect(bilanciStorici([{symbol:"MSFT",filingDate:"2000-01-01",revenue:100}],"AAPL","2000-01-21")).toHaveLength(0);});
 it("scarta notizie future, vecchie, aggiornate dopo cutoff e di altri simboli",()=>{const base={symbols:["AAPL"],created_at:"2000-01-20T10:00:00Z",updated_at:"2000-01-20T11:00:00Z",headline:"notizia",url:"https://example.org/news"};const rows=[base,{...base,created_at:"2000-01-22T00:00:00Z"},{...base,created_at:"2000-01-01T00:00:00Z"},{...base,updated_at:"2000-01-22T00:00:00Z"},{...base,symbols:["MSFT"]}];expect(notizieStoriche(rows,"AAPL","2000-01-21")).toHaveLength(1);});
});
