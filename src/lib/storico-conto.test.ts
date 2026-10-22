import { describe, expect, it } from "vitest";
import { ordiniContoAttuale } from "./storico-conto";

const corrente = { id: "attuale", piattaforma: "alpaca", ambiente: "paper", conto_id: "alpaca:attuale", conto_attribuzione: "motore" };
describe("storico del conto attualmente collegato", () => {
  it("esclude gli ordini dei conti precedenti e non attribuiti dalle statistiche", () => {
    expect(ordiniContoAttuale([corrente, { ...corrente, id: "vecchio", conto_id: "alpaca:vecchio" }, { ...corrente, id: "incerto", conto_attribuzione: null }, { ...corrente, id: "senza", conto_id: null }], "alpaca", "paper", "alpaca:attuale").map(r => r.id)).toEqual(["attuale"]);
  });
  it("mantiene separati paper, reale e broker", () => {
    expect(ordiniContoAttuale([corrente, { ...corrente, ambiente: "reale" }, { ...corrente, piattaforma: "kraken" }], "alpaca", "paper", "alpaca:attuale")).toEqual([corrente]);
  });
  it("non mostra storico se l'identità corrente è sconosciuta", () => {
    expect(ordiniContoAttuale([corrente], "alpaca", "paper", null)).toEqual([]);
  });
  it("include gli ordini attribuiti tramite verifica broker senza cancellare gli altri", () => {
    const righe = [{ ...corrente, conto_attribuzione: "verificato_broker" }, { ...corrente, conto_id: "vecchio" }];
    expect(ordiniContoAttuale(righe, "alpaca", "paper", "alpaca:attuale")).toHaveLength(1);
    expect(righe).toHaveLength(2);
  });
});