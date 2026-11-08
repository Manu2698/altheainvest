// Comitato multi-agente operativo: 3 analisti in parallelo → Dual Risk Debate (2 turni) → Risk Manager → Coordinatore.
// Viene chiamato da eseguiCiclo solo per i candidati all'acquisto che hanno già superato tutte le protezioni.
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import { decisioneFinale, esitoDibattito, indicatoriTecnici, type Analisi, type Coordinatore, type Rischio, type Turno } from "./comitato";

const MODELLO = "openai/gpt-oss-20b";
const GATEWAY = "https://api.groq.com/openai/v1";
const CACHE_ORE = 4;
export const MAX_ANALISI_PER_CICLO = 2;

const sAnalisi = z.object({
  voto: z.enum(["favorevole", "contrario", "neutrale", "dati_insufficienti"]),
  fiducia: z.number(), sintesi: z.string(), punti: z.array(z.string()), datiMancanti: z.array(z.string()),
});
const sTurno = z.object({
  posizione: z.enum(["BUY", "SELL", "HOLD"]), argomenti: z.array(z.string()), risposteObiezioni: z.array(z.string()),
  attendibilita: z.string(), conclusione: z.boolean(),
});
const sRischio = z.object({ veto: z.boolean(), livello: z.enum(["basso", "medio", "alto"]), motivi: z.array(z.string()), fattoreMassimo: z.number() });
const sCoord = z.object({ decisione: z.enum(["procedi", "attendi"]), fattore: z.number(), contraddizioni: z.array(z.string()), motivazione: z.string() });

const REGOLE = "Usa SOLO i dati JSON forniti. Non inventare numeri, notizie o fatti. Se un dato manca, dichiaralo. Rispondi in italiano, frasi brevi (massimo 5 punti).";

export class StopComitato extends Error {}

type Contesto = {
  userId: string; contoId: string | null; ambiente: "paper" | "reale"; strategia: string;
  ticker: string; cripto: boolean; importo: number; motivo: string; chiusure: number[];
  posizione: { valore: number; pnlPct: number } | undefined;
  conto: { capitale: number; liquidita: number; investito: number; numeroPosizioni: number; perditaOggi: number | null; limitePerdita: number | null };
  alpacaHeaders: Record<string, string>;
};

async function fondamentali(ticker: string, cripto: boolean) {
  if (cripto) return { disponibile: false, motivo: "Criptovaluta: nessun bilancio aziendale." };
  const key = process.env["FMP_API_KEY"];
  if (!key) return { disponibile: false, motivo: "Servizio bilanci non collegato." };
  const get = async (p: string) => {
    const separator = p.includes("?") ? "&" : "?";
    const r = await fetch(`https://financialmodelingprep.com${p}${separator}apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return Array.isArray(j) ? j : null;
  };
  const s = encodeURIComponent(ticker);
  const [ratios, metrics, income] = await Promise.all([get(`/stable/ratios-ttm?symbol=${s}`), get(`/stable/key-metrics-ttm?symbol=${s}`), get(`/stable/income-statement?symbol=${s}&limit=2`)]);
  if (!ratios?.length && !metrics?.length && !income?.length) return { disponibile: false, motivo: "Nessun dato di bilancio per questo titolo (es. ETF o non coperto)." };
  const pick = (o: Record<string, unknown> | undefined, k: string[]) => Object.fromEntries(k.filter((x) => o?.[x] != null).map((x) => [x, o![x]]));
  return {
    disponibile: true, fonte: "Financial Modeling Prep",
    indici: pick(ratios?.[0], ["grossProfitMarginTTM", "operatingProfitMarginTTM", "netProfitMarginTTM", "priceToEarningsRatioTTM", "priceToBookRatioTTM", "debtToEquityRatioTTM", "currentRatioTTM"]),
    metriche: pick(metrics?.[0], ["marketCap", "evToEBITDATTM", "returnOnEquityTTM", "freeCashFlowYieldTTM", "netDebtToEBITDATTM"]),
    contiEconomici: (income ?? []).map((i: Record<string, unknown>) => pick(i, ["date", "period", "revenue", "netIncome", "eps", "operatingIncome"])),
  };
}

async function notizie(ticker: string, headers: Record<string, string>) {
  try {
    const r = await fetch(`https://data.alpaca.markets/v1beta1/news?symbols=${encodeURIComponent(ticker)}&limit=8&sort=desc`, { headers, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return { disponibile: false, motivo: `Notizie non leggibili (HTTP ${r.status}).` };
    const j = (await r.json()) as { news?: Record<string, unknown>[] };
    const lista = (j.news ?? []).map((n) => ({ data: n["created_at"], titolo: n["headline"], sintesi: String(n["summary"] ?? "").slice(0, 280), fonte: n["source"] }));
    return lista.length ? { disponibile: true, fonte: "Alpaca News", notizie: lista } : { disponibile: false, motivo: "Nessuna notizia recente." };
  } catch { return { disponibile: false, motivo: "Notizie non raggiungibili." }; }
}

export async function valutaCandidato(c: Contesto): Promise<{ procedi: boolean; importo: number; motivo: string; cache: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const dal = new Date(Date.now() - CACHE_ORE * 3600_000).toISOString();
  const { data: prec } = await supabaseAdmin.from("analisi_comitato").select("decisione, motivo, agenti").eq("user_id", c.userId).eq("ambiente", c.ambiente).eq("ticker", c.ticker).eq("proposta", "BUY").is("errore", null).gte("created_at", dal).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (prec) {
    const fattore = Number((prec.agenti as { fattoreFinale?: number } | null)?.fattoreFinale ?? 0);
    const importo = prec.decisione === "BUY" ? Math.floor(c.importo * Math.max(0, Math.min(1, fattore)) * 100) / 100 : 0;
    return { procedi: prec.decisione === "BUY" && importo >= 1, importo, motivo: `Comitato (analisi recente): ${prec.motivo}`, cache: true };
  }

  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) throw new StopComitato("IA non configurata: manca GROQ_API_KEY.");
  const provider = createOpenAI({ baseURL: GATEWAY, apiKey });
  const agente = async <T,>(nome: string, sistema: string, input: unknown, schema: z.ZodType<T>): Promise<T | null> => {
    try {
      const r = await generateText({
        model: provider.chat(MODELLO), instructions: `${sistema}\n${REGOLE}`, prompt: JSON.stringify(input),
        output: Output.object({ schema }),
      });
      return r.output as T;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/\b(402|403)\b|credit|not_enabled|denied/i.test(msg)) throw new StopComitato(`Comitato sospeso (${nome}): ${msg.slice(0, 120)}`);
      console.error(`[comitato] ${nome}`, msg.slice(0, 200));
      return null;
    }
  };

  const tecnici = indicatoriTecnici(c.chiusure);
  const [fond, news] = await Promise.all([fondamentali(c.ticker, c.cripto), notizie(c.ticker, c.alpacaHeaders)]);
  const dati = { ticker: c.ticker, strategia: c.strategia, propostaMotore: { azione: "BUY", importoUSD: c.importo, motivo: c.motivo }, tecnici, fondamentali: fond, notizie: news, posizioneAttuale: c.posizione ?? null, conto: c.conto };

  // 1. Tre analisti in parallelo sugli stessi dati condivisi.
  const [af, at, an] = await Promise.all([
    agente("fondamentale", "Sei l'Analista fondamentale: valuta solidità, bilanci, crescita e valutazione. Se fondamentali.disponibile è false vota dati_insufficienti.", { ticker: c.ticker, fondamentali: fond }, sAnalisi),
    agente("tecnico", "Sei l'Analista tecnico: valuta trend, indicatori (SMA, RSI, momentum, volatilità), supporti e resistenze dai dati forniti.", { ticker: c.ticker, tecnici, propostaMotore: dati.propostaMotore }, sAnalisi),
    agente("news", "Sei l'Analista news e sentiment: valuta notizie, eventi e sentiment. Se notizie.disponibile è false vota dati_insufficienti.", { ticker: c.ticker, notizie: news }, sAnalisi),
  ]);
  const analisti = { fondamentale: af, tecnico: at, news: an };

  // 2. Dual Risk Debate: 2 turni, Bull e Bear in parallelo per turno, con risposta alle obiezioni.
  const turni: Turno[] = [];
  const bullSys = "Sei il Bull Analyst: sostieni la proposta BUY con gli elementi favorevoli verificabili. 'conclusione' = true solo se la tesi regge alle obiezioni.";
  const bearSys = "Sei il Bear Analyst: contesta la tesi cercando rischi, debolezze e motivi per non procedere. 'conclusione' = true solo se hai obiezioni decisive basate sui dati.";
  for (const n of [1, 2]) {
    const ctx = { dati, analisti, turniPrecedenti: turni, turno: n };
    const [b, r] = await Promise.all([agente(`bull${n}`, bullSys, ctx, sTurno), agente(`bear${n}`, bearSys, ctx, sTurno)]);
    if (b) turni.push({ ...b, agente: "bull", turno: n });
    if (r) turni.push({ ...r, agente: "bear", turno: n });
    if (!b || !r) break;
  }
  const esito = esitoDibattito(turni, "BUY");

  // 3. Risk Manager indipendente (veto assoluto), 4. Coordinatore.
  const rischio = await agente<Rischio>("risk", "Sei il Risk Manager: valuta in modo indipendente rischio, volatilità, esposizione, dimensione della posizione e protezione del capitale. Metti veto=true se il rischio non è accettabile o i dati sono incoerenti. fattoreMassimo tra 0 e 1 = quota massima dell'importo proposto.", { dati, analisti, dibattito: { turni, esito } }, sRischio);
  const coord = rischio && !rischio.veto
    ? await agente<Coordinatore>("coordinatore", "Sei il Coordinatore: confronta analisti, dibattito e Risk Manager, individua contraddizioni e decidi 'procedi' o 'attendi'. fattore tra 0 e 1 riduce l'importo. Con dati insufficienti o dibattito HOLD scegli attendi.", { dati, analisti, dibattito: { turni, esito }, rischio }, sCoord)
    : null;

  const finale = decisioneFinale({ proposta: "BUY", importo: c.importo, analisti: [af, at, an] as (Analisi | null)[], dibattito: esito, rischio, coordinatore: coord });
  const fattoreFinale = c.importo > 0 ? finale.importo / c.importo : 0;
  await supabaseAdmin.from("analisi_comitato").insert({
    user_id: c.userId, conto_id: c.contoId, ambiente: c.ambiente, strategia: c.strategia, ticker: c.ticker,
    proposta: "BUY", decisione: finale.procedi ? "BUY" : "HOLD", veto: Boolean(rischio?.veto), esito_dibattito: esito, motivo: finale.motivo,
    agenti: JSON.parse(JSON.stringify({ ...analisti, rischio, coordinatore: coord, fattoreFinale })),
    dibattito: JSON.parse(JSON.stringify(turni)), dati: JSON.parse(JSON.stringify(dati)),
    errore: [af, at, an, rischio].some((x) => !x) ? "Uno o più agenti non hanno risposto: HOLD." : null,
  });
  return { ...finale, motivo: `Comitato: ${finale.motivo}`, cache: false };
}
