import { describe, expect, it, vi, afterEach } from "vitest";
import { serieStorica } from "./trading.server";

afterEach(() => vi.unstubAllGlobals());
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
    expect(date.EYPT).toBe("2026-10-21T04:00:00Z");
  });
});