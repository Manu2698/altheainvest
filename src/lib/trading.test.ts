import { describe, expect, it, vi, afterEach } from "vitest";
import { decide, serieStorica } from "./trading.server";
import { problemaAccumulo } from "./protezioni";

afterEach(() => vi.unstubAllGlobals());
describe("protezione accumulo dopo il segnale reale", () => {
  it("vieta di ricomprare sul ribasso una posizione già detenuta", () => {
    const posizione = { ticker: "TEST", valore: 1, pnlPct: -2 };
    const serie = [...Array(19).fill(10), 9];
    expect(decide("aggressivo", "TEST", serie, posizione, 10).azione).toBe("compra");
    expect(problemaAccumulo("aggressivo", posizione, serie)).not.toBeNull();
  });
  it("mantiene la vendita di protezione invariata", () => {
    const scelta = decide("aggressivo", "TEST", Array(20).fill(10), { ticker: "TEST", valore: 10, pnlPct: -8 }, 20);
    expect(scelta.azione).toBe("vendi");
    expect(scelta.importo).toBe(10);
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