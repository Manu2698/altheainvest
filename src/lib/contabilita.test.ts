import {it,expect} from "vitest";
import {venditeConfermate} from "./contabilita";
const fills=[{ordine:"test",ticker:"TEST",ora:"2026-10-22",costo:10,pnl:2},{ordine:"test",ticker:"TEST",ora:"2026-10-22",costo:20,pnl:-1}];
it("due fill della stessa vendita contano un solo esito reale",()=>expect(venditeConfermate(fills,[{broker_id:"test",stato:"filled",riconciliato_il:"2026-10-22",strategia:"medio"}])).toEqual([{ordine:"test",ticker:"TEST",ora:"2026-10-22",costo:30,pnl:1,strategia:"medio"}]));
it("un parziale ancora aperto non diventa una vincita chiusa",()=>expect(venditeConfermate(fills,[{broker_id:"test",stato:"partially_filled",riconciliato_il:"2026-10-22",strategia:"medio"}])).toEqual([]));
it("esclude vendite non riconciliate",()=>expect(venditeConfermate(fills,[{broker_id:"test",stato:"filled",riconciliato_il:null,strategia:"medio"}])).toEqual([]));