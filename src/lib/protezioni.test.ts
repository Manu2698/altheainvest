import { describe, expect, it } from "vitest";
import { motivoBloccoAcquisti, problemaDati, problemaAccumulo, simboliAperti } from "./protezioni";

const ok = { contoOk: true, posizioniOk: true, ordiniApertiOk: true, limitePerdita: 50, perditaOggi: 0 };
const ORA = Date.parse("2026-10-22T14:00:00Z");

describe("protezioni del motore", () => {
  it("consente il primo acquisto senza posizione", () => {
    expect(problemaAccumulo("aggressivo", undefined, [10, 9])).toBeNull();
  });
  it("blocca acquisti ripetuti senza il segnale di trend previsto", () => {
    for (const strategia of ["aggressivo", "conservativo"]) expect(problemaAccumulo(strategia, { valore: 10, pnlPct: 2 }, [...Array(19).fill(10), 11])).not.toBeNull();
  });
  it("non accumula su una posizione in perdita anche con trend positivo", () => {
    expect(problemaAccumulo("medio", { valore: 10, pnlPct: -1 }, [...Array(19).fill(10), 11])).not.toBeNull();
  });
  it("consente accumulo medio sopra SMA20 su posizione non in perdita", () => {
    expect(problemaAccumulo("medio", { valore: 10, pnlPct: 2 }, [...Array(19).fill(10), 11])).toBeNull();
  });
  it("blocca accumulo con serie insufficiente, invalida o senza rialzo", () => {
    for (const serie of [[10, 11], [...Array(19).fill(10), NaN], Array(20).fill(10)]) expect(problemaAccumulo("medio", { valore: 10, pnlPct: 2 }, serie)).not.toBeNull();
  });
  it("blocca accumulo quando il risultato della posizione non è verificabile", () => {
    expect(problemaAccumulo("medio", { valore: 10, pnlPct: NaN }, [...Array(19).fill(10), 11])).not.toBeNull();
  });
  it("consente acquisti quando tutto è leggibile", () => {
    expect(motivoBloccoAcquisti(ok)).toBeNull();
  });
  it("blocca gli acquisti se il conto non risponde", () => {
    expect(motivoBloccoAcquisti({ ...ok, contoOk: false })).not.toBeNull();
  });
  it("blocca gli acquisti se le posizioni non sono leggibili", () => {
    expect(motivoBloccoAcquisti({ ...ok, posizioniOk: false })).not.toBeNull();
  });
  it("blocca gli acquisti se gli ordini aperti non sono leggibili", () => {
    expect(motivoBloccoAcquisti({ ...ok, ordiniApertiOk: false })).not.toBeNull();
  });
  it("blocca gli acquisti se c'è un limite di perdita ma la perdita non è verificabile", () => {
    expect(motivoBloccoAcquisti({ ...ok, perditaOggi: null })).not.toBeNull();
    expect(motivoBloccoAcquisti({ ...ok, limitePerdita: null, perditaOggi: null })).toBeNull();
  });
  it("salta prezzi più vecchi di 4 giorni", () => {
    expect(problemaDati([10, 11], "2026-10-17T04:00:00Z", ORA)).toMatch(/vecchi/);
    expect(problemaDati([10, 11], "2026-10-21T04:00:00Z", ORA)).toBeNull();
  });
  it("salta prezzi incoerenti o senza data", () => {
    expect(problemaDati([10, 0], "2026-10-21T04:00:00Z", ORA)).toMatch(/incoerenti/);
    expect(problemaDati([10, Number.NaN], "2026-10-21T04:00:00Z", ORA)).toMatch(/incoerenti/);
    expect(problemaDati([10, 11], undefined, ORA)).toMatch(/mancante/);
  });
  it("riconosce i titoli con ordini già aperti, anche cripto", () => {
    const s = simboliAperti([{ symbol: "AAPL" }, { symbol: "BTC/USD" }, {}]);
    expect(s.has("AAPL")).toBe(true);
    expect(s.has("BTCUSD")).toBe(true);
    expect(s.size).toBe(2);
  });
  it("non tratta un ribasso estremo come occasione (EYPT −82% dalla media 10g)", () => {
    const serie = [...Array(9).fill(2.4), 0.43];
    expect(problemaDati(serie, "2026-10-21T04:00:00Z", ORA)).toMatch(/salto|anomalo/);
  });
  it("blocca serie con salto giornaliero da split non corretto", () => {
    expect(problemaDati([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 40, 40], "2026-10-21T04:00:00Z", ORA)).toMatch(/salto/);
  });
  it("consente un ribasso normale (−5%)", () => {
    expect(problemaDati([...Array(9).fill(10), 9.5], "2026-10-21T04:00:00Z", ORA)).toBeNull();
  });
  it("blocca prezzi con data futura",()=>expect(problemaDati([10,11],"2026-10-23T04:00:00Z",ORA)).toMatch(/futura/));
});
