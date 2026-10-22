import { describe, expect, it } from "vitest";
import { calcolaMetriche, metricheOperazioni, validaFuoriCampione } from "./metriche";

const st = (vals: number[]) => vals.map((valore, i) => ({ giorno: `2026-01-${String(i + 1).padStart(2, "0")}`, valore }));
const base = { flussi: [], chiuse: [], benchmark: [] };

describe("metriche portafoglio", () => {
  it("un deposito non è guadagno", () => {
    const m = calcolaMetriche({ ...base, storico: st([1000, 1000, 1500]), flussi: [{ giorno: "2026-01-03", tipo: "deposito", importo: 500 }] });
    expect(m.pnlNetto).toBe(0);
    expect(m.rendimentoPct).toBe(0);
    expect(m.versamenti).toBe(500);
  });
  it("un prelievo non è perdita", () => {
    const m = calcolaMetriche({ ...base, storico: st([1000, 1100, 600]), flussi: [{ giorno: "2026-01-03", tipo: "prelievo", importo: 500 }] });
    expect(m.pnlNetto).toBe(100);
    expect(m.rendimentoPct).toBe(10);
  });
  it("le commissioni sono riportate ma non sottratte due volte", () => {
    const m = calcolaMetriche({ ...base, storico: st([1000, 995]), flussi: [{ giorno: "2026-01-02", tipo: "costo", importo: 5 }] });
    expect(m.costiRegistrati).toBe(5);
    expect(m.pnlNetto).toBe(-5);
    expect(m.rendimentoPct).toBe(-0.5);
  });
  it("le posizioni aperte contano tramite il valore del conto, non come operazioni chiuse", () => {
    const m = calcolaMetriche({ ...base, storico: st([1000, 1080]) });
    expect(m.pnlNetto).toBe(80);
    expect(m.operazioni.operazioni).toBe(0);
  });
  it("molte vincite piccole e una grande perdita: profit factor < 1", () => {
    const ops = [1, 1, 1, 1].map((p) => ({ giorno: "2026-01-02", importo: 100, pnlPct: p, strategia: "medio" }));
    const o = metricheOperazioni([...ops, { giorno: "2026-01-02", importo: 100, pnlPct: -20, strategia: "medio" }]);
    expect(o.percentualeVincite).toBe(80);
    expect(o.profitFactor).toBe(0.2);
    expect(o.pnlRealizzato).toBe(-16);
    expect(o.rapportoVinciPerdi).toBe(0.05);
  });
  it("drawdown massimo", () => {
    const m = calcolaMetriche({ ...base, storico: st([100, 120, 90, 110]) });
    expect(m.drawdownMassimoPct).toBe(-25);
  });
  it("periodo senza operazioni: nessuna statistica inventata", () => {
    const m = calcolaMetriche({ ...base, storico: st([1000, 1000]) });
    expect(m.operazioni.profitFactor).toBeNull();
    expect(m.operazioni.percentualeVincite).toBeNull();
    expect(m.avvisi.some((a) => a.includes("Nessuna operazione"))).toBe(true);
  });
  it("dati incompleti: niente rendimento, volatilità né benchmark", () => {
    const m = calcolaMetriche({ ...base, storico: st([1000]), flussiCompleti: false });
    expect(m.rendimentoPct).toBeNull();
    expect(m.pnlNetto).toBeNull();
    expect(m.volatilitaAnnuaPct).toBeNull();
    expect(m.benchmarkPct).toBeNull();
    const m2 = calcolaMetriche({ ...base, storico: st([1000, 1010, 1020]) });
    expect(m2.volatilitaAnnuaPct).toBeNull();
    expect(m2.benchmarkPct).toBeNull();
  });
  it("benchmark sullo stesso periodo", () => {
    const m = calcolaMetriche({ ...base, storico: st([1000, 1050]), benchmark: [{ giorno: "2026-01-01", prezzo: 100 }, { giorno: "2026-01-02", prezzo: 102 }] });
    expect(m.benchmarkPct).toBe(2);
    expect(m.differenzaBenchmarkPct).toBe(3);
  });
  it("sotto 30 operazioni il campione non è sufficiente", () => {
    expect(metricheOperazioni(Array(29).fill({ giorno: "x", importo: 1, pnlPct: 1, strategia: "m" })).qualita).toBe("limitata");
  });
});

describe("validazione fuori campione", () => {
  it("rifiuta campioni piccoli anche se tutti vincenti", () => {
    expect(validaFuoriCampione(Array(10).fill(3))).toBe(false);
  });
  it("rifiuta se il periodo fuori campione è in perdita", () => {
    expect(validaFuoriCampione([...Array(14).fill(3), ...Array(6).fill(-4)])).toBe(false);
  });
  it("accetta solo se entrambi i periodi reggono", () => {
    expect(validaFuoriCampione(Array(20).fill(0).map((_, i) => (i % 4 === 0 ? -1 : 2)))).toBe(true);
  });
});
