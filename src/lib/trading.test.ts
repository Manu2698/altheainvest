import { describe, expect, it, vi, afterEach } from "vitest";
import { decide, decisioneDrawdownMensile } from "./trading.logic";
import { serieStorica } from "./market-data";
import { problemaAccumulo, valutaDrawdownMensile } from "./protezioni";

afterEach(() => vi.unstubAllGlobals());
describe("accumulo aggressivo su nuovo trigger tecnico", () => {
  it("consente un nuovo accumulo quando il trigger aggressivo è completo", () => {
    const posizione = { ticker: "TEST", valore: 1, pnlPct: -2 };
    const serie = [...Array(19).fill(10), 9];
    expect(decide("aggressivo", "TEST", serie, posizione, 10).azione).toBe("compra");
    expect(problemaAccumulo("aggressivo", posizione, serie)).toBeNull();
  });
  it("mantiene la vendita di protezione invariata", () => {
    const scelta = decide("aggressivo", "TEST", Array(20).fill(10), { ticker: "TEST", valore: 10, pnlPct: -8 }, 20);
    expect(scelta.azione).toBe("vendi");
    expect(scelta.importo).toBe(10);
  });
});
describe("uscite della strategia aggressiva", () => {
  it("non vende automaticamente al raggiungimento del +15%", () => {
    const scelta = decide("aggressivo", "TEST", Array(20).fill(10), { ticker: "TEST", valore: 10, pnlPct: 16, piccoPnlPct: 16 }, 10);
    expect(scelta.azione).toBe("attendi");
  });
  it("attiva il trailing dopo +5% e protegge 5 punti dal massimo", () => {
    const scelta = decide("aggressivo", "TEST", Array(20).fill(10), { ticker: "TEST", valore: 10, pnlPct: 17, piccoPnlPct: 22 }, 10);
    expect(scelta.azione).toBe("vendi");
    expect(scelta.motivo).toContain("massimo profitto +22.0%");
  });
  it("protegge almeno +2% quando il trailing si è attivato a +5%", () => {
    const scelta = decide("aggressivo", "TEST", Array(20).fill(10), { ticker: "TEST", valore: 10, pnlPct: 1, piccoPnlPct: 5 }, 10);
    expect(scelta.azione).toBe("vendi");
    expect(scelta.motivo).toContain("protezione attivata a +2.0%");
  });
  it("mantiene lo stop iniziale fisso a -7%", () => {
    const scelta = decide("aggressivo", "TEST", Array(20).fill(10), { ticker: "TEST", valore: 10, pnlPct: -7.1 }, 10);
    expect(scelta.azione).toBe("vendi");
  });
});
describe("liquidazione al drawdown mensile", () => {
  it("chiude l'intera posizione quando il mese è bloccato", () => {
    expect(decisioneDrawdownMensile(true, { valore: 125 })).toMatchObject({ azione: "vendi", importo: 125 });
  });
  it("non compra e resta in pausa quando non ci sono posizioni", () => {
    expect(decisioneDrawdownMensile(true, undefined)).toMatchObject({ azione: "attendi", importo: 0 });
  });
  it("non modifica le decisioni quando il limite non è raggiunto", () => {
    expect(decisioneDrawdownMensile(false, { valore: 125 })).toBeNull();
  });
});
describe("drawdown mensile aggressivo", () => {
  it("usa il primo equity del mese come riferimento e aggiorna il massimo", () => {
    expect(valutaDrawdownMensile(1050, null, false)).toEqual({ piccoEquity: 1050, drawdownPercentuale: 0, bloccato: false });
    expect(valutaDrawdownMensile(1100, 1050, false)?.piccoEquity).toBe(1100);
  });
  it("blocca a -20% dal massimo mensile e non si sblocca nel mese", () => {
    const stato = valutaDrawdownMensile(800, 1000, false);
    expect(stato?.bloccato).toBe(true);
    expect(valutaDrawdownMensile(950, 1000, true)?.bloccato).toBe(true);
  });
  it("rifiuta equity non verificabile", () => {
    expect(valutaDrawdownMensile(Number.NaN, 1000, false)).toBeNull();
  });
});
describe("storico mercato offline", () => {
  it("legge tutte le pagine in unità corrette per split", async () => {
    const chiamate: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      chiamate.push(url);
      return Response.json(chiamate.length === 1
        ? { bars: { EYPT: [{ c: 3, t: "2026-10-20T04:00:00Z" }] }, next_page_token: "seconda" }
        : { bars: { EYPT: [{ c: 0.43, t: "2026-10-21T04:00:00Z" }] }, next_page_token: null });
    }));
    const date: Record<string, string> = {};
    expect(await serieStorica(["EYPT"], {}, date)).toEqual({ EYPT: [3, 0.43] });
    expect(chiamate).toHaveLength(2);
    expect(chiamate[0]).toContain("adjustment=split");
    expect(chiamate[1]).toContain("page_token=seconda");
    expect(date["EYPT"]).toBe("2026-10-21T04:00:00Z");
  });
  it("scarta tutte le barre se una pagina successiva va in timeout", async () => {
    let n=0;
    vi.stubGlobal("fetch",vi.fn(async()=>{ if (++n===2) throw new Error("timeout"); return Response.json({bars:{TEST:[{c:10,t:"2026-10-20T04:00:00Z"}]},next_page_token:"next"}); }));
    const date: Record<string,string>={};
    expect(await serieStorica(["TEST"],{},date)).toEqual({});
    expect(date["TEST"]).toBeUndefined();
  });
  it("non usa barre duplicate o fuori sequenza per SMA", async () => {
    vi.stubGlobal("fetch",vi.fn(async()=>Response.json({bars:{TEST:[{c:10,t:"2026-10-21T04:00:00Z"},{c:11,t:"2026-10-20T04:00:00Z"}]}})));
    expect(await serieStorica(["TEST"],{})).toEqual({});
  });
});