import { createOpenAI } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import type { Database } from "@/integrations/supabase/types";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.server";

const MODELLO = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

const json = (status: number, messaggio: string) =>
  Response.json({ error: messaggio }, { status });

function clientUtente(token: string) {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        h.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

async function contesto(
  db: ReturnType<typeof clientUtente>,
  userId: string,
): Promise<string> {
  const { leggiConto } = await import("@/lib/alpaca.server");
  const { leggiOrdini } = await import("@/lib/trading.server");
  const { data: conti } = await db.from("automazioni_conti").select("*").eq("user_id", userId);
  const [{ data: registro }, ordiniPaper, ordiniReale, contoPaper, contoReale] = await Promise.all([
    db
      .from("ordini_ia")
      .select("created_at, strategia, ambiente, piattaforma, ticker, lato, importo, pnl_pct, motivo")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40),
    leggiOrdini(userId, false, 25).catch(() => []),
    leggiOrdini(userId, true, 25).catch(() => []),
    leggiConto(false, userId).catch(() => null),
    leggiConto(true, userId).catch(() => null),
  ]);

  const sintesi = (conto: Awaited<ReturnType<typeof leggiConto>> | null) =>
    conto && conto.stato === "collegato"
      ? {
          ambiente: conto.ambiente,
          valuta: conto.valuta,
          valorePortafoglio: conto.valorePortafoglio,
          liquidita: conto.liquidita,
          poterAcquisto: conto.poterAcquisto,
          pnlGiornaliero: conto.pnlGiornaliero,
          posizioni: conto.posizioni,
        }
      : { stato: conto?.stato ?? "sconosciuto", messaggio: conto && "messaggio" in conto ? conto.messaggio : null };

  const impostazioni = (conti ?? []).map((c) => ({
    piattaforma: c.piattaforma,
    ambiente: c.ambiente,
    motoreAutomaticoAttivo: c.attivo,
    strategia: c.strategia,
    capitaleImpostato: Number(c.capitale),
    modalitaCapitale: c.modalita === "conto" ? "usa tutto il conto" : "usa il limite dell'utente",
    perditaMaxGiornaliera: c.perdita_max_giornaliera,
    motivoPausa: c.pausa_motivo,
    pausaIl: c.pausa_il,
    ultimoCiclo: c.ultimo_ciclo,
    ultimoEsito: c.ultimo_esito,
  }));

  return JSON.stringify(
    {
      oraUTC: new Date().toISOString(),
      contiIA: impostazioni,
      contoAlpacaPaper: sintesi(contoPaper),
      contoAlpacaReale: sintesi(contoReale),
      ordiniRecentiBrokerPaper: ordiniPaper,
      ordiniRecentiBrokerReale: ordiniReale,
      registroDecisioniIA: registro ?? [],
    },
    null,
    1,
  ).slice(0, 60_000);
}

const ISTRUZIONI = `Sei l'assistente di Althea, una piattaforma in cui un'IA investe in automatico su uno o più conti collegati dall'utente (Alpaca, Trading 212, Binance, Kraken, Coinbase, eToro; ognuno in versione paper o reale) con tre strategie: conservativo (accumulo graduale, stop a -10%), medio (trend sopra media mobile 20 giorni, uscita sotto -3% della media o stop -8%), aggressivo (compra sui ribassi sotto la media 10 giorni, prende profitto a +5%, taglia a -7%). Ogni conto ha le sue impostazioni: strategia, capitale, modalità (limite utente o intero conto) e limite di perdita giornaliera.
Rispondi alle domande dell'investitore sui suoi ordini automatici, sulle impostazioni delle strategie, sui limiti di perdita giornaliera e sull'attività dei conti, basandoti SOLO sui dati forniti qui sotto. Se un dato non c'è, dillo chiaramente. Non inventare numeri. Spiega in modo semplice. Non dare consigli finanziari personalizzati né promesse di rendimento; puoi spiegare il comportamento dell'IA. Rispondi nella lingua dell'utente, usando markdown con elenchi brevi e importi formattati.`;

export async function gestisciChat(request: Request): Promise<Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, "Accedi per usare l'assistente.");
  const db = clientUtente(token);
  const { data: utente, error: errAuth } = await db.auth.getUser(token);
  if (errAuth || !utente.user) return json(401, "Sessione non valida, accedi di nuovo.");
  const userId = utente.user.id;

  let body: { messages?: UIMessage[]; threadId?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, "Richiesta non valida.");
  }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-60) : [];
  const threadId = typeof body.threadId === "string" ? body.threadId : "";
  if (!threadId || !messages.length) return json(400, "Conversazione non valida.");

  const { data: thread } = await db
    .from("chat_thread")
    .select("id, titolo")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!thread) return json(404, "Conversazione non trovata.");

  const ultimo = messages[messages.length - 1]!;
  if (ultimo.role === "user") {
    const { error } = await db.from("chat_messaggi").upsert(
      {
        thread_id: threadId,
        user_id: userId,
        sdk_id: ultimo.id,
        ruolo: "user",
        messaggio: JSON.parse(JSON.stringify(ultimo)),
      },
      { onConflict: "thread_id,sdk_id" },
    );
    if (error) {
      console.error("[assistente] salvataggio messaggio utente", error);
      return json(500, "Impossibile salvare il messaggio.");
    }
    if (thread.titolo === "Nuova conversazione") {
      const testo = ultimo.parts
        .map((p) => (p.type === "text" ? p.text : ""))
        .join(" ")
        .trim()
        .slice(0, 60);
      if (testo) await db.from("chat_thread").update({ titolo: testo }).eq("id", threadId);
    }
  }

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return json(500, "Assistente non configurato.");

  const dati = await contesto(db, userId);
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const result = streamText({
    model: provider.responses(MODELLO),
    instructions: `${ISTRUZIONI}\n\nDATI ATTUALI DELL'UTENTE (JSON):\n${dati}`,
    messages: await convertToModelMessages(messages),
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  const risposta = result.toUIMessageStreamResponse({
    originalMessages: messages,
    sendReasoning: true,
    onFinish: async ({ responseMessage }) => {
      if (!responseMessage?.parts?.length) return;
      const { error } = await db.from("chat_messaggi").upsert(
        {
          thread_id: threadId,
          user_id: userId,
          sdk_id: responseMessage.id,
          ruolo: "assistant",
          messaggio: JSON.parse(JSON.stringify(responseMessage)),
        },
        { onConflict: "thread_id,sdk_id" },
      );
      if (error) console.error("[assistente] salvataggio risposta", error);
      await db.from("chat_thread").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
    },
    onError: (e) => {
      console.error("[assistente] errore modello", e);
      const msg = e instanceof Error ? e.message : "";
      if (/402|credit/i.test(msg)) return "Crediti IA esauriti: ricarica il piano per continuare.";
      if (/429|rate/i.test(msg)) return "Troppe richieste, riprova tra poco.";
      return "L'assistente non è disponibile in questo momento.";
    },
  });
  return withLovableAiGatewayRunIdHeader(risposta, runIdFetch);
}
