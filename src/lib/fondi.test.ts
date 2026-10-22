import { describe, expect, it } from "vitest";
import { fondiUtilizzabili, validaLimiteFondi } from "./fondi";
describe("fondi del conto collegato", () => {
  it("non crea liquidità né leva oltre cash e buying power", () => expect(fondiUtilizzabili(49.95, 99.90, 500, 500)).toBe(49.95));
  it("applica entrambi i limiti personali", () => expect(fondiUtilizzabili(100, 80, 30, 20)).toBe(20));
  it("zero disabilita gli acquisti", () => expect(fondiUtilizzabili(100, 100, 0, null)).toBe(0));
  it("riduce i fondi anche nei cicli successivi", () => { expect(fondiUtilizzabili(30,30,20,20)).toBe(20); expect(fondiUtilizzabili(5,5,20,20)).toBe(5); });
  it("non tratta valori mancanti come fondi disponibili", () => expect(fondiUtilizzabili(NaN,100,null,null)).toBe(0));
  it("rifiuta limiti negativi", () => expect(() => validaLimiteFondi(-1)).toThrow());
});