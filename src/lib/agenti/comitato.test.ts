import { describe, expect, it } from "vitest";
import { decisioneFinale, esitoDibattito, indicatoriTecnici, type Analisi, type Turno } from "./comitato";

const a = (voto: Analisi["voto"]): Analisi => ({ voto, fiducia: 0.7, sintesi: "", punti: [], datiMancanti: [] });
const t = (agente: "bull" | "bear", turno: number, conclusione: boolean, posizione: Turno["posizione"] = "BUY"): Turno =>
  ({ agente, turno, posizione, argomenti: [], risposteObiezioni: [], attendibilita: "", conclusione });
const debateOk = [t("bull", 1, true), t("bear", 1, false), t("bull", 2, true), t("bear", 2, false)];
const base = {
  proposta: "BUY" as const, importo: 10, analisti: [a("favorevole"), a("favorevole"), a("neutrale")],
  dibattito: "BUY" as const, rischio: { veto: false, livello: "basso" as const, motivi: [], fattoreMassimo: 1 },
  coordinatore: { decisione: "procedi" as const, fattore: 1, contraddizioni: [], motivazione: "ok" },
};

describe("comitato", () => {
  it("il veto del Risk Manager blocca anche con coordinatore favorevole", () => {
    expect(decisioneFinale({ ...base, rischio: { ...base.rischio, veto: true } }).procedi).toBe(false);
  });
  it("senza Risk Manager nessuna operazione", () => {
    expect(decisioneFinale({ ...base, rischio: null }).procedi).toBe(false);
  });
  it("dibattito non concluso: prevale HOLD", () => {
    expect(decisioneFinale({ ...base, dibattito: "HOLD" }).procedi).toBe(false);
  });
  it("dati insufficienti per due analisti: HOLD", () => {
    expect(decisioneFinale({ ...base, analisti: [a("dati_insufficienti"), a("dati_insufficienti"), a("favorevole")] }).procedi).toBe(false);
  });
  it("il comitato può solo ridurre l'importo, mai aumentarlo", () => {
    expect(decisioneFinale({ ...base, coordinatore: { ...base.coordinatore, fattore: 3 } }).importo).toBe(10);
    expect(decisioneFinale({ ...base, rischio: { ...base.rischio, fattoreMassimo: 0.5 } }).importo).toBe(5);
  });
  it("importo ridotto sotto 1 $: nessun ordine", () => {
    expect(decisioneFinale({ ...base, importo: 1.5, coordinatore: { ...base.coordinatore, fattore: 0.5 } }).procedi).toBe(false);
  });
  it("dibattito: obiezioni decisive del Bear portano a HOLD", () => {
    expect(esitoDibattito(debateOk, "BUY")).toBe("BUY");
    expect(esitoDibattito([...debateOk.slice(0, 3), t("bear", 2, true)], "BUY")).toBe("HOLD");
    expect(esitoDibattito(debateOk.slice(0, 2), "BUY")).toBe("HOLD");
  });
  it("indicatori nulli con storico corto", () => {
    const i = indicatoriTecnici([1, 2, 3]);
    expect(i.sma20).toBeNull();
    expect(i.rsi14).toBeNull();
  });
});
