import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
const mock=vi.hoisted(()=>({credenziali:vi.fn()}));
vi.mock("../alpaca.server",()=>({credenzialiUtente:mock.credenziali}));
import {caricaEvidenzeStoriche} from "./evidenze.server";
beforeEach(()=>{vi.stubEnv("UDC_FINANCIAL_MODELING_PREP_API_KEY","test-key");vi.stubEnv("LOVABLE_API_KEY","test-gateway");mock.credenziali.mockResolvedValue({headers:{test:"offline"}});});
afterEach(()=>vi.unstubAllGlobals());
describe("recupero automatico storico isolato",()=>{
 it("legge tre bilanci e notizie limitate alla data senza endpoint ordini",async()=>{
  const fetchMock=vi.fn(async(input:URL)=>{const url=new URL(input);return new Response(JSON.stringify(url.hostname.includes("alpaca")?{news:[{symbols:["AAPL"],created_at:"2000-01-20T10:00:00Z",updated_at:"2000-01-20T11:00:00Z",headline:"notizia",url:"https://example.org/news"}]}:[{symbol:"AAPL",filingDate:"2000-01-10",revenue:100}]),{status:200});});vi.stubGlobal("fetch",fetchMock);
  const r=await caricaEvidenzeStoriche("test","AAPL","2000-01-21");expect(fetchMock).toHaveBeenCalledTimes(4);expect(r.evidenze.filter(e=>e.tipo==="fondamentali")).toHaveLength(3);expect(r.evidenze.filter(e=>e.tipo==="news")).toHaveLength(1);
  const url=new URL(fetchMock.mock.calls[3]?.[0]??"https://example.org");expect(url.pathname).toBe("/v1beta1/news");expect(url.searchParams.get("end")).toBe("2000-01-21T00:00:00.000Z");expect(fetchMock.mock.calls.every(c=>!String(c[0]).includes("orders"))).toBe(true);
 });
 it("non ripete chiamate negate e segnala HOLD per dati mancanti",async()=>{const f=vi.fn(async()=>new Response("denied",{status:403}));vi.stubGlobal("fetch",f);const r=await caricaEvidenzeStoriche("test","AAPL","2000-01-21");expect(f).toHaveBeenCalledTimes(2);expect(r.evidenze).toHaveLength(0);expect(r.avvisi.some(a=>a.includes("HTTP 403"))).toBe(true);expect(r.avvisi.some(a=>a.includes("HOLD"))).toBe(true);});
 it("non usa notizie di una risposta troncata",async()=>{vi.stubEnv("UDC_FINANCIAL_MODELING_PREP_API_KEY","");vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({news:[{symbols:["AAPL"],created_at:"2000-01-20T10:00:00Z",headline:"news",url:"https://example.org"}],next_page_token:"more"}))));const r=await caricaEvidenzeStoriche("test","AAPL","2000-01-21");expect(r.evidenze).toHaveLength(0);expect(r.avvisi.some(a=>a.includes("troncata"))).toBe(true);});
});
