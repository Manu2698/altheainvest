import { describe, expect, it } from "vitest";
import { snapshotAmmissibilePerLezioni, type EvidenzaSnapshot } from "./apprendimento-snapshot.proposta";

const adesso = Date.parse("2026-10-22T20:40:00Z");
const base: EvidenzaSnapshot = {
  snapshot: { stato: "riconciliato", osservatoAl: "2026-10-22T20:39:59Z" },
  erroreSnapshot: false, erroreOrdini: false, numeroOrdini: 46,
};

describe("fase 1: gate proposto offline, nessuna integrazione operativa", () => {
  it("non ammette istantanea fresca incompleta anche con ordini disponibili", () => {
    expect(snapshotAmmissibilePerLezioni({ ...base, snapshot: { stato: "incompleto", osservatoAl: "2026-10-22T20:39:59Z" } }, adesso)).toBe(false);
  });
  it("ammette la stessa evidenza se riconciliata e fresca", () => {
    expect(snapshotAmmissibilePerLezioni(base, adesso)).toBe(true);
  });
  it("non ammette snapshot assente", () => {
    expect(snapshotAmmissibilePerLezioni({ ...base, snapshot: null }, adesso)).toBe(false);
  });
  it("non ammette errore snapshot anche con dati residui", () => {
    expect(snapshotAmmissibilePerLezioni({ ...base, erroreSnapshot: true }, adesso)).toBe(false);
  });
  it("non ammette errore ordini", () => {
    expect(snapshotAmmissibilePerLezioni({ ...base, erroreOrdini: true }, adesso)).toBe(false);
  });
  it("non ammette data futura", () => {
    expect(snapshotAmmissibilePerLezioni({ ...base, snapshot: { stato: "riconciliato", osservatoAl: "2026-10-22T20:40:01Z" } }, adesso)).toBe(false);
  });
  it("non ammette data illeggibile", () => {
    expect(snapshotAmmissibilePerLezioni({ ...base, snapshot: { stato: "riconciliato", osservatoAl: "non-data" } }, adesso)).toBe(false);
  });
  it("non ammette orologio non valido", () => {
    expect(snapshotAmmissibilePerLezioni(base, NaN)).toBe(false);
  });
  it("conserva limite di freschezza: 119999ms sì, 120000ms no", () => {
    const e = { ...base, snapshot: { stato: "riconciliato", osservatoAl: "2026-10-22T20:38:00Z" } };
    expect(snapshotAmmissibilePerLezioni(e, adesso - 1)).toBe(true);
    expect(snapshotAmmissibilePerLezioni(e, adesso)).toBe(false);
  });
  it("rifiuta potenziale troncamento al cap di 5000, accetta 4999", () => {
    expect(snapshotAmmissibilePerLezioni({ ...base, numeroOrdini: 5000 }, adesso)).toBe(false);
    expect(snapshotAmmissibilePerLezioni({ ...base, numeroOrdini: 4999 }, adesso)).toBe(true);
  });
  it("rifiuta conteggi invalidi", () => {
    for (const numeroOrdini of [-1, 1.5, NaN]) expect(snapshotAmmissibilePerLezioni({ ...base, numeroOrdini }, adesso)).toBe(false);
  });
  it("conteggio zero ammissibile non inventa operazioni", () => {
    expect(snapshotAmmissibilePerLezioni({ ...base, numeroOrdini: 0 }, adesso)).toBe(true);
  });
});