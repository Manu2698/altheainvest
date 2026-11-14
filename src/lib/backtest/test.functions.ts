import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { simula, validaConfig, type ConfigTest, type Evidenza, type Barra, type Verdetto } from "./motore";

export const getStoricoTest=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
  .inputValidator((i:ConfigTest)=>{validaConfig(i);return i;})
  .handler(async({data,context})=>{
    const {caricaStorico}=await import("./historique.server");
    return caricaStorico(context.userId,data.ticker,data.dal,data.al);
  });

const schema=z.object({config:z.custom<ConfigTest>(),barre:z.array(z.object({data:z.string(),apertura:z.number(),chiusura:z.number(),volume:z.number()})).max(25000),verdetti:z.record(z.string(),z.object({procedi:z.boolean(),importo:z.number(),motivo:z.string(),dettagli:z.unknown()})),evidenze:z.array(z.object({disponibileIl:z.string(),fonte:z.string().max(200),contenuto:z.string().max(4000),tipo:z.enum(["fondamentali","news"])})).max(1000),automatiche:z.boolean().default(true)});
export const analizzaCandidatoTest=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
  .inputValidator((i:{config:ConfigTest;barre:Barra[];verdetti:Record<string,Verdetto>;evidenze:Evidenza[];automatiche?:boolean})=>{const v=schema.parse(i);validaConfig(v.config);if(v.config.modalita!=="comitato")throw new Error("Modalità non valida.");return v;})
  .handler(async({data,context})=>{
    const replay=simula(data.config,data.barre,data.verdetti);
    if(!replay.candidato) throw new Error("Nessun candidato da analizzare.");
    const {analizzaStorico}=await import("./comitato.server");
    const archivio=data.automatiche ? await (await import("./evidenze.server")).caricaEvidenzeStoriche(context.userId,data.config.ticker,replay.candidato.data) : {evidenze:data.evidenze,avvisi:["Documenti inseriti dall’utente, provenienza non certificata."]};
    const verdetto=await analizzaStorico(data.config.ticker,data.config.strategia,replay.candidato,archivio.evidenze);
    return {data:replay.candidato.data,verdettoJson:JSON.stringify({...verdetto,dettagli:{analisi:verdetto.dettagli,evidenze:archivio.evidenze,avvisi:archivio.avvisi}})};
  });