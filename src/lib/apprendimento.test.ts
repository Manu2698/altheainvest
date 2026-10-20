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
  it("aumenta l'importo con più del 65% di vincite", () => {
    const l = calcolaLezioni([{ ticker: "A", pnlPct: 4 }, { ticker: "B", pnlPct: 3 }, { ticker: "C", pnlPct: 2 }]);
    const s = applicaLezioni({ azione: "compra", importo: 100, motivo: "m" }, "medio", "Z", undefined, l);
    expect(s.importo).toBeCloseTo(120);
  });
});
