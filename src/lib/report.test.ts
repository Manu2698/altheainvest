import { describe, expect, it } from "vitest";
import { calcolaStatistiche } from "./report.server";

describe("conteggi ordini", () => {
  it("non duplica lo stesso ID, ma mantiene acquisti ripetuti con ID distinti", () => {
    const a = { id: "1", strategia: "aggressivo", ticker: "CRWV", lato: "buy", importo: 4, pnl_pct: null, motivo: null, created_at: "2026-10-22T10:00:00Z" };
    const m = calcolaStatistiche([a, a, { ...a, id: "2" }]).riepilogo.find((r) => r.strategia === "aggressivo");
    expect(m?.ordini).toBe(2);
    expect(m?.acquisti).toBe(2);
    expect(m?.capitaleInvestito).toBe(8);
  });
});