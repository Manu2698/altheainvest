import { describe, expect, it } from "vitest";
import { controllaIstantanea } from "./riconciliazione";
import { calcolaMetriche } from "./metriche";
const input = () => ({ prima: { id: "conto-test", equity: 50, cash: 10 }, dopo: { id: "conto-test", equity: 50, cash: 10 }, posizioni: [{ ticker: "TEST", quantita: 2, valore: 40, costo: 42, pnl: -2 }], datiCompleti: true, ordiniStabili: true, ordiniPendenti: false });
describe("riconciliazione contabile", () => {
  it("verifica posizioni aperte in perdita senza sottrarre il P&L due volte", () => expect(controllaIstantanea(input()).stato).toBe("riconciliato"));
  it("non certifica una differenza di un centesimo", () => { const i = input(); i.dopo.equity = i.prima.equity = 50.01; expect(controllaIstantanea(i).scarto).toBe(0.01); expect(controllaIstantanea(i).stato).toBe("incompleto"); });
  it("rifiuta equity cambiata durante la lettura", () => { const i = input(); i.dopo.equity = 51; expect(controllaIstantanea(i).stato).toBe("incompleto"); });
  it("mantiene provvisori ordini parziali e in corso", () => expect(controllaIstantanea({ ...input(), ordiniPendenti: true }).stato).toBe("incompleto"));
  it("rifiuta esecuzioni non leggibili", () => expect(controllaIstantanea({ ...input(), datiCompleti: false }).stato).toBe("incompleto"));
  it("non mescola conti diversi", () => { const i = input(); i.dopo.id = "altro"; expect(controllaIstantanea(i).stato).toBe("incompleto"); });
  it("accetta un conto vuoto coerente senza inventare rendimenti", () => expect(controllaIstantanea({ ...input(), prima: { id:"test", equity:0,cash:0 }, dopo:{id:"test",equity:0,cash:0},posizioni:[] }).stato).toBe("riconciliato"));
  it("blocca rendimento da letture parziali anche con flussi disponibili", () => { const m = calcolaMetriche({ storico:[{giorno:"2026-10-20",valore:50},{giorno:"2026-10-21",valore:55}], flussi:[],chiuse:[],benchmark:[],flussiCompleti:true,riconciliazioneCompleta:false }); expect(m.rendimentoPct).toBeNull(); expect(m.pnlNetto).toBeNull(); expect(m.drawdownMassimoPct).toBeNull(); });
});