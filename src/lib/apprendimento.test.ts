import { describe, expect, it } from "vitest";
import { applicaLezioni, calcolaLezioni } from "./apprendimento";

describe("apprendimento", () => {
  it("blocca acquisti su titoli con perdite ripetute", () => {
    const l = calcolaLezioni([{ ticker: "AAL", pnlPct: -5 }, { ticker: "AAL", pnlPct: -3 }, { ticker: "X", pnlPct: 2 }]);
    const s = applicaLezioni({ azione: "compra", importo: 100, motivo: "m" }, "medio", "AAL", undefined, l);
    expect(s.azione).toBe("attendi");
  });
  it("stringe lo stop sotto il 40% di vincite", () => {
    const l = calcolaLezioni([{ ticker: "A", pnlPct: -4 }, { ticker: "B", pnlPct: -4 }, { ticker: "C", pnlPct: 3 }]);
    expect(l.fattoreStop).toBe(0.7);
    const s = applicaLezioni({ azione: "attendi", importo: 0, motivo: "" }, "medio", "D", { valore: 50, pnlPct: -6 }, l);
    expect(s.azione).toBe("vendi");
  });
  it("non aumenta l'importo con poche vincite non validate fuori campione", () => {
    const l = calcolaLezioni([{ ticker: "A", pnlPct: 4 }, { ticker: "B", pnlPct: 3 }, { ticker: "C", pnlPct: 2 }]);
    const s = applicaLezioni({ azione: "compra", importo: 100, motivo: "m" }, "medio", "Z", undefined, l);
    expect(s.importo).toBe(100);
  });
  it("aumenta l'importo solo dopo validazione fuori campione", () => {
    const l = calcolaLezioni(Array.from({ length: 20 }, (_, i) => ({ ticker: `T${i}`, pnlPct: i % 4 === 0 ? -1 : 3 })));
    const s = applicaLezioni({ azione: "compra", importo: 100, motivo: "m" }, "medio", "Z", undefined, l);
    expect(s.importo).toBeCloseTo(120);
  });
});

describe("segnali appresi", () => {
  const es = (segnale: string, pnl: number[]) => pnl.map((p, i) => ({ ticker: `T${segnale}${i}`, pnlPct: p, segnale }));
  it("non potenzia un segnale con solo 3 esiti vincenti", () => {
    const l = calcolaLezioni([...es("trend sopra media 20g", [3, 4, 2]), ...es("acquisto sul ribasso", [-2, -3, -1])]);
    const s = applicaLezioni({ azione: "compra", importo: 100, motivo: "Trend positivo: prezzo sopra la media a 20 giorni." }, "medio", "NEW", undefined, l);
    expect(s.importo).toBe(100);
  });
  it("scarta gli acquisti con un segnale perdente", () => {
    const l = calcolaLezioni(es("acquisto sul ribasso", [-2, -3, -1]));
    const s = applicaLezioni({ azione: "compra", importo: 100, motivo: "Ribasso del -2.5% sotto la media 10g." }, "aggressivo", "NEW", undefined, l);
    expect(s.azione).toBe("attendi");
  });
});
