import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Candidato, Evidenza } from "./motore";
const mock=vi.hoisted(()=>({stream:vi.fn(),provider:vi.fn(()=>({responses:vi.fn()}))}));
vi.mock("ai",()=>({streamText:mock.stream,Output:{object:vi.fn()},NoObjectGeneratedError:{isInstance:()=>false}}));
vi.mock("@ai-sdk/openai",()=>({createOpenAI:mock.provider}));
import { analizzaStorico } from "./comitato.server";
const c:Candidato={data:"2000-01-21",chiusure:Array(30).fill(10),importo:100,motivo:"trend",posizione:null,conto:{capitale:1000,liquidita:1000,investito:0,numeroPosizioni:0,perditaOggi:0,limitePerdita:null}};
const docs:Evidenza[]=[{disponibileIl:"2000-01-01T00:00:00Z",tipo:"fondamentali",fonte:"archivio",contenuto:"bilancio"},{disponibileIl:"2000-01-20T00:00:00Z",tipo:"news",fonte:"archivio",contenuto:"notizia"}];
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("LOVABLE_API_KEY","offline-test");});
describe("comitato storico isolato (modelli simulati)",()=>{
  it("non spende chiamate se mancano dati point-in-time",async()=>{const r=await analizzaStorico("AAPL","medio",c,[]);expect(r.procedi).toBe(false);expect(mock.stream).not.toHaveBeenCalled();});
  it("esegue tre analisti, due turni, risk e coordinatore con riduzione",async()=>{
    const responses=[...Array(3).fill({voto:"favorevole",fiducia:70,sintesi:"prova",punti:[],datiMancanti:[]}),{posizione:"BUY",argomenti:[],risposteObiezioni:[],attendibilita:"dati",conclusione:true},{posizione:"HOLD",argomenti:[],risposteObiezioni:[],attendibilita:"dati",conclusione:false},{posizione:"BUY",argomenti:[],risposteObiezioni:[],attendibilita:"dati",conclusione:true},{posizione:"HOLD",argomenti:[],risposteObiezioni:[],attendibilita:"dati",conclusione:false},{veto:false,livello:"basso",motivi:[],fattoreMassimo:.5},{decisione:"procedi",fattore:.8,contraddizioni:[],motivazione:"accettato"}];
    mock.stream.mockImplementation(()=>({output:Promise.resolve(responses.shift())}));
    const r=await analizzaStorico("AAPL","medio",c,docs);expect(mock.stream).toHaveBeenCalledTimes(9);expect(r.procedi).toBe(true);expect(r.importo).toBe(50);const first=mock.stream.mock.calls[0]?.[0];expect(first.maxRetries).toBe(0);expect(first.providerOptions.openai.store).toBe(false);
  });
  it("il veto impedisce di consultare il coordinatore",async()=>{
    let i=0;mock.stream.mockImplementation(()=>({output:Promise.resolve(++i<=3?{voto:"favorevole",fiducia:70,sintesi:"",punti:[],datiMancanti:[]}:i<=7?{posizione:"BUY",argomenti:[],risposteObiezioni:[],attendibilita:"dati",conclusione:false}:{veto:true,livello:"alto",motivi:["rischio"],fattoreMassimo:1})}));
    const r=await analizzaStorico("AAPL","medio",c,docs);expect(r.procedi).toBe(false);expect(r.importo).toBe(0);expect(mock.stream).toHaveBeenCalledTimes(8);
  });
  it("non prosegue il dibattito dopo un rifiuto del servizio",async()=>{mock.stream.mockImplementation(()=>({output:Promise.reject(new Error("403 denied"))}));await expect(analizzaStorico("AAPL","medio",c,docs)).rejects.toThrow("accesso");expect(mock.stream).toHaveBeenCalledTimes(3);});
});