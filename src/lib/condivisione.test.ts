import { describe, expect, it } from "vitest";
import { controllaFrequenza, datiVisibili, generaToken, hashToken, importo, normalizzaOpzioni, statoLink, tokenBenFormato } from "./condivisione";
import { abbinaOrdini, rendimentoNetto, risultatiChiusi } from "./conti";

const ORA = Date.parse("2026-10-22T12:00:00Z");

describe("link di condivisione", () => {
  it("genera token da 256 bit diversi e ben formati", () => {
    const a = generaToken();
    expect(tokenBenFormato(a)).toBe(true);
    expect(a).not.toBe(generaToken());
  });
  it("salva solo un'impronta diversa dal token", async () => {
    const t = generaToken();
    const h = await hashToken(t);
    expect(h).toHaveLength(64);
    expect(h).not.toContain(t);
  });
  it("rifiuta un link scaduto", () => {
    expect(statoLink({ scade_il: "2026-10-22T11:59:00Z", revocato_il: null }, ORA)).toBe("scaduto");
  });
  it("rifiuta un link revocato anche se non scaduto", () => {
    expect(statoLink({ scade_il: "2026-10-30T00:00:00Z", revocato_il: "2026-10-22T11:00:00Z" }, ORA)).toBe("revocato");
  });
  it("blocca oltre 60 aperture in 10 minuti", () => {
    expect(controllaFrequenza({ finestra_inizio: "2026-10-22T11:55:00Z", accessi_finestra: 60 }, ORA)).toBeNull();
    expect(controllaFrequenza({ finestra_inizio: "2026-10-22T11:40:00Z", accessi_finestra: 60 }, ORA)?.accessi_finestra).toBe(1);
  });
  it("per impostazione non condivide conti reali né importi", () => {
    const o = normalizzaOpzioni({});
    expect(o.reale).toBe(false);
    expect(importo(o, 1234)).toBeNull();
    expect(datiVisibili(o).no).toContain("Conti REALI");
  });
});

describe("attribuzione ordini ai conti", () => {
  const ia = [
    { id: "a", ticker: "BTC/USD", lato: "buy", created_at: "2026-10-01T10:00:00Z" },
    { id: "b", ticker: "AAPL", lato: "buy", created_at: "2026-09-01T10:00:00Z" },
  ];
  it("abbina solo ordini presenti nello storico del broker", () => {
    expect(abbinaOrdini(ia, [{ ticker: "BTCUSD", lato: "buy", creatoIl: "2026-10-01T10:01:00Z" }])).toEqual(["a"]);
  });
  it("lascia non determinato un ordine fuori tolleranza (vecchio conto chiuso)", () => {
    expect(abbinaOrdini(ia, [{ ticker: "AAPL", lato: "buy", creatoIl: "2026-09-01T11:00:00Z" }])).toEqual([]);
  });
  it("conta solo le vendite chiuse come vincite e perdite", () => {
    const r = risultatiChiusi(
      [
        { lato: "buy", importo: 100, pnl_pct: null, created_at: "2026-10-22T09:00:00Z" },
        { lato: "sell", importo: 100, pnl_pct: 10, created_at: "2026-10-22T10:00:00Z" },
        { lato: "sell", importo: 50, pnl_pct: -4, created_at: "2026-10-21T10:00:00Z" },
      ],
      7,
      ORA,
    );
    // 100 venduti a +10% → +9,09; 50 venduti a −4% → −2,08 (guadagno calcolato sul costo)
    expect([r.vincite, r.perdite, r.pnlRealizzato]).toEqual([1, 1, 7.01]);
  });
  it("esclude versamenti e prelievi dal rendimento", () => {
    expect(rendimentoNetto({ iniziale: 1000, attuale: 1600, versamenti: 500, prelievi: 0 })).toBeCloseTo(6.67);
    expect(rendimentoNetto({ iniziale: null, attuale: 1600, versamenti: 0, prelievi: 0 })).toBeNull();
  });
});
