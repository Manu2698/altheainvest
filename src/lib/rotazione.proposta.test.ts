import { describe, expect, it } from "vitest";
import { valutaRotazioneOffline, type EvidenzaRotazione, type StimaRotazione } from "./rotazione.proposta";

// Synthetic evidence only: no measured trading performance is represented here.
const stima = (ticker: string, min: number, max: number): StimaRotazione => ({
  conto: "paper-test", ticker, valuta: "USD", strategiaVersione: "test-v1", fonte: "fixture-sintetica",
  osservatoIl: "2026-10-24T10:00:00Z", validoFino: "2026-10-24T10:05:00Z", orizzonteFine: "2026-11-24T10:00:00Z",
  rendimentoLordoMinPct: min, rendimentoLordoMaxPct: max,
});
const base = (): EvidenzaRotazione => ({
  adesso: "2026-10-24T10:00:01Z", conto: "paper-test", valuta: "USD", riconciliato: true,
  ordiniPendenti: false, uscitaPrioritaria: false, soloLiquiditaInsufficiente: true,
  controlliAcquistoSuperati: true, negoziabile: true, liquiditaDisponibile: 2, acquistoRichiesto: 12,
  posizione: { long: true, costoRiconciliato: true, valoreUscitaPrudente: 25, costoMedioTotale: 20 },
  mantenere: stima("OLD", 1, 3), candidato: stima("NEW", 6, 8),
  costiRotazionePct: 1, costiMantenimentoPct: 0.2, costiUscitaPosizione: 1, costiCompleti: true,
  prova: { riferimento: "holdout-sintetico", strategiaVersione: "test-v1", disponibileIl: "2026-10-23T10:00:00Z", confronto: { completo: true, validato: true, rischioConfrontabile: true, miglioramento: true } },
});
const blocco = (e: EvidenzaRotazione, codice: string) => expect(valutaRotazioneOffline(e)).toMatchObject({ valutabile: false, codice, attivazioneAutomatica: false });

describe("rotazione proposta offline, nessuna esecuzione", () => {
  it("confronta il netto e propone solo il capitale mancante, non la chiusura totale", () => {
    const r = valutaRotazioneOffline(base());
    expect(r).toMatchObject({ valutabile: true, capitaleDaLiberareNetto: 10, profittoUscitaStimato: 4, attivazioneAutomatica: false });
    if (r.valutabile) expect(r.vantaggioPrudentePct).toBeCloseTo(2.2);
  });
  it("non propone vendita con liquidità sufficiente", () => blocco({ ...base(), liquiditaDisponibile: 12 }, "fondi"));
  it("non aggira tetti o altre cause di blocco", () => blocco({ ...base(), soloLiquiditaInsufficiente: false }, "fondi"));
  it("non usa contabilità incompleta", () => blocco({ ...base(), riconciliato: false }, "dati"));
  it("non ruota con ordini pendenti", () => blocco({ ...base(), ordiniPendenti: true }, "pendenti"));
  it("lascia priorità alle uscite ordinarie", () => blocco({ ...base(), uscitaPrioritaria: true }, "uscita_prioritaria"));
  it("non aggira segnali o protezioni di accumulo", () => blocco({ ...base(), controlliAcquistoSuperati: false }, "acquisto"));
  it("non finanzia strumenti non negoziabili", () => blocco({ ...base(), negoziabile: false }, "acquisto"));
  it("non vende posizioni in perdita", () => { const e = base(); e.posizione.valoreUscitaPrudente = 19; blocco(e, "profitto"); });
  it("non confonde profitto lordo e netto di uscita", () => { const e = base(); e.posizione.valoreUscitaPrudente = 21; blocco(e, "profitto"); });
  it("rifiuta costo medio non riconciliato", () => { const e = base(); e.posizione.costoRiconciliato = false; blocco(e, "profitto"); });
  it("rifiuta una posizione insufficiente a finanziare l'acquisto", () => blocco({ ...base(), acquistoRichiesto: 30 }, "profitto"));
  it("non combina conti diversi", () => { const e = base(); e.candidato.conto = "altro"; blocco(e, "conto"); });
  it("non combina valute diverse", () => { const e = base(); e.candidato.valuta = "EUR"; blocco(e, "conto"); });
  it("costi mancanti non diventano zero", () => blocco({ ...base(), costiRotazionePct: null }, "costi"));
  it("spread e slippage possono annullare il vantaggio", () => blocco({ ...base(), costiRotazionePct: 4 }, "vantaggio"));
  it("non usa stime sovrapposte come vantaggio certo", () => { const e = base(); e.candidato.rendimentoLordoMinPct = 2; blocco(e, "vantaggio"); });
  it("rifiuta dati futuri, scaduti o senza fonte", () => {
    for (const patch of [{ osservatoIl: "2026-10-25T10:00:00Z" }, { validoFino: base().adesso }, { fonte: "" }, { rendimentoLordoMinPct: null }]) {
      const e = base(); Object.assign(e.candidato, patch); blocco(e, "confronto");
    }
  });
  it("richiede stesso orizzonte e timestamp delle stime", () => {
    for (const patch of [{ orizzonteFine: "2026-12-24T10:00:00Z" }, { osservatoIl: "2026-10-24T09:00:00Z" }, { strategiaVersione: "test-v2" }]) {
      const e = base(); Object.assign(e.candidato, patch); blocco(e, "confronto");
    }
  });
  it("nessuna proposta senza tutti i risultati della validazione esistente", () => {
    for (const campo of ["completo", "validato", "rischioConfrontabile", "miglioramento"] as const) {
      const e = base(); e.prova.confronto[campo] = false; blocco(e, "validazione");
    }
  });
  it("non usa prove future o relative a una versione diversa", () => {
    for (const patch of [{ disponibileIl: "2026-10-25T10:00:00Z" }, { strategiaVersione: "test-v0" }, { riferimento: "" }]) {
      const e = base(); Object.assign(e.prova, patch); blocco(e, "validazione");
    }
  });
  it("rifiuta numeri non finiti senza creare fondi", () => blocco({ ...base(), liquiditaDisponibile: NaN }, "fondi"));
  it("non ruota sullo stesso simbolo con formati diversi", () => { const e = base(); e.mantenere.ticker = "BTC/USD"; e.candidato.ticker = "BTCUSD"; blocco(e, "confronto"); });
  it("non muta l'evidenza né simula un'esecuzione", () => {
    const e = base(), prima = JSON.stringify(e);
    valutaRotazioneOffline(e); expect(JSON.stringify(e)).toBe(prima);
    expect(valutaRotazioneOffline(e).attivazioneAutomatica).toBe(false);
  });
});