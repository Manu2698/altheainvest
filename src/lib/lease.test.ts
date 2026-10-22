import {describe,it,expect,vi,beforeEach} from "vitest";
const mock=vi.hoisted(()=>({rpc:vi.fn(),delete:vi.fn()}));
vi.mock("@/integrations/supabase/client.server",()=>({supabaseAdmin:{rpc:mock.rpc,from:()=>({delete:()=>({eq:()=>({eq:()=>({eq:()=>({eq:mock.delete})})})})})}}));
import {conLeaseConto,registraIntento,verificaLease} from "./riconciliazione.server";
const lease={userId:"test-user",piattaforma:"alpaca",ambiente:"paper",owner:"test-owner"};
beforeEach(()=>{vi.clearAllMocks();mock.delete.mockResolvedValue({error:null});});
describe("lock e intenti offline",()=>{
  it("un secondo ciclo non esegue il callback quando lock occupato",async()=>{mock.rpc.mockResolvedValue({data:false,error:null});const fn=vi.fn();expect(await conLeaseConto("test-user","alpaca","paper",fn)).toBeNull();expect(fn).not.toHaveBeenCalled();});
  it("proprietario scaduto non può preparare un ordine",async()=>{mock.rpc.mockResolvedValue({data:false,error:null});await expect(registraIntento({userId:"test-user",piattaforma:"alpaca",ambiente:"paper",contoId:"test",ticker:"TEST",lato:"buy",strategia:"medio",importo:1},lease)).rejects.toThrow(/scaduto/);expect(mock.rpc).toHaveBeenCalledTimes(1);});
  it("senza lock non viene scritto alcun intento",async()=>{await expect(registraIntento({userId:"test-user",piattaforma:"alpaca",ambiente:"paper",contoId:"test",ticker:"TEST",lato:"sell",strategia:"medio",importo:1})).rejects.toThrow(/lock/);expect(mock.rpc).not.toHaveBeenCalled();});
  it("database indisponibile impedisce rinnovo e invio",async()=>{mock.rpc.mockResolvedValue({data:null,error:{message:"offline"}});await expect(verificaLease(lease)).rejects.toThrow(/non verificabile/);});
});