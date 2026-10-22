import { describe, expect, it } from "vitest";
import { confrontaFattore, raggruppaEsiti, riepilogaEsiti, type EsitoValutabile, type OsservazioneFattori } from "./valutazione";
const e = (id: string, pnlLordo: number, costoAllocato: number | null = 1): EsitoValutabile => ({ id, conto: "paper-test", ticker: "TEST", strategia: "medio", ora: "2026-10-20T10:00:00Z", pnlLordo, costoAllocato, settore: null, mercato: null });
describe("valutazione verificabile", () => {
  it("calcola aspettativa e rapporti dopo costi una sola volta", () => {
    const r = riepilogaEsiti([e("1", 11), e("2", -4), e("3", 1)]);
    expect(r.operazioni).toBe(3); expect(r.percentualeVincite).toBeCloseTo(100/3);
    expect(r.guadagnoMedio).toBe(10); expect(r.perditaMedia).toBe(5);
    expect(r.rapporto).toBe(2); expect(r.profitFactor).toBe(2);
    expect(r.aspettativaNetta).toBeCloseTo(5/3); expect(r.pareggi).toBe(1);
  });
  it("fee non allocate non diventano zero o aspettativa netta", () => {
    const r = riepilogaEsiti([e("1", 11, null), e("2", -4)]);
    expect(r.aspettativaNetta).toBeNull(); expect(r.base).toBe("lordo"); expect(r.pnl).toBe(7);
  });
  it("nessuna perdita non genera profit factor infinito", () => { expect(riepilogaEsiti([e("1", 5)]).profitFactor).toBeNull(); });
  it("campione vuoto non diventa un profitto", () => { const r = riepilogaEsiti([]); expect(r.pnl).toBeNull(); expect(r.aspettativaNetta).toBeNull(); });
  it("deduplica ordini ma non ordini distinti o conti diversi", () => {
    expect(riepilogaEsiti([e("1", 2), e("1", 2), e("2", 2), { ...e("1", 2), conto: "altro" }]).operazioni).toBe(3);
  });
  it("esclude duplicati in conflitto anziché scegliere un P&L", () => { const r=riepilogaEsiti([e("1", 2),e("1", 3)]); expect(r.operazioni).toBe(0); expect(r.conflitti).toBe(1); });
  it("non inventa settore o condizioni di mercato", () => { expect(raggruppaEsiti([e("1", 2)], "settore")[0]?.nome).toBe("Non disponibile"); });
  const osservazioni = (): OsservazioneFattori[] => Array.from({length: 40}, (_,i) => ({ ...e(String(i), i%4 === 0 ? -1 : 5), ora: `2026-09-${String(1+Math.floor(i/2)).padStart(2,"0")}T11:00:00Z`, ingressoIl: `2026-09-${String(1+Math.floor(i/2)).padStart(2,"0")}T10:00:00Z`, osservatoIl: "2026-08-31T10:00:00Z", sma10: 11, sma20: 10, momentum5: 0.1, costoAllocato: 0.1 }));
  it("un fattore senza equity comparabile non è un miglioramento validato", () => { const r=confrontaFattore(osservazioni(), "trend"); expect(r.validato).toBe(true); expect(r.rischioConfrontabile).toBe(false); expect(r.miglioramento).toBe(false); expect(r.attivazioneAutomatica).toBe(false); });
  it("blocca dati conosciuti dopo l'ingresso (look-ahead)", () => { const rows= osservazioni(); rows[0] = {...rows[0] as OsservazioneFattori, osservatoIl: "2026-10-22T10:00:00Z"}; expect(confrontaFattore(rows,"momentum").completo).toBe(false); });
  it("non promuove pochi trade", () => { expect(confrontaFattore(osservazioni().slice(0,8),"trend").validato).toBe(false); });
  it("esiti di training ancora aperti nel holdout impediscono validazione", () => { const rows= osservazioni(); rows[0] = {...rows[0] as OsservazioneFattori, ora: "2026-10-20T10:00:00Z"}; expect(confrontaFattore(rows,"trend").validato).toBe(false); });
  it("non mescola conti e strategie negli esperimenti", () => { const rows= osservazioni(); rows.push({...rows[0] as OsservazioneFattori,conto:"altro"}); expect(confrontaFattore(rows,"trend").completo).toBe(false); });
  it("non scarta selettivamente costi mancanti per validare", () => { const rows= osservazioni(); rows.push({...rows[0] as OsservazioneFattori,id:"extra",costoAllocato:null}); expect(confrontaFattore(rows,"trend").validato).toBe(false); });
});