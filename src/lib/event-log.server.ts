import type { EventoDaRegistrare, EventoRegistrato } from "./event-log.types";

const tronca = (v: string | undefined | null, n: number) =>
  typeof v === "string" ? v.slice(0, n) : null;

/** Scrive un evento nel log persistente. Non lancia mai: il logging non deve rompere l'app. */
export async function salvaEvento(e: EventoDaRegistrare): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("event_log").insert({
      livello: e.livello ?? "error",
      origine: tronca(e.origine, 120) ?? "sconosciuta",
      tipo: tronca(e.tipo, 120) ?? "Error",
      messaggio: tronca(e.messaggio, 4000) ?? "",
      stack: tronca(e.stack, 8000),
      contesto: (e.contesto ?? null) as never,
      ambiente: tronca(e.ambiente, 40),
      url: tronca(e.url, 500),
      user_agent: tronca(e.userAgent, 400),
    });
    if (error) {
      console.error("[event-log] insert fallito:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[event-log] insert fallito:", err);
    return false;
  }
}

/** Fire-and-forget per i percorsi sincroni. */
export function salvaEventoAsync(e: EventoDaRegistrare) {
  void salvaEvento(e);
}

export async function leggiEventi(opts: {
  limite: number;
  livello?: string | undefined;
  origine?: string | undefined;
}): Promise<EventoRegistrato[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("event_log")
    .select("id, created_at, livello, origine, tipo, messaggio, stack, contesto, ambiente, url")
    .order("created_at", { ascending: false })
    .limit(opts.limite);

  if (opts.livello) q = q.eq("livello", opts.livello);
  if (opts.origine) q = q.ilike("origine", `%${opts.origine}%`);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    createdAt: r.created_at as string,
    livello: r.livello as string,
    origine: r.origine as string,
    tipo: r.tipo as string,
    messaggio: r.messaggio as string,
    stack: (r.stack as string | null) ?? null,
    contesto: (r.contesto as Record<string, unknown> | null) ?? null,
    ambiente: (r.ambiente as string | null) ?? null,
    url: (r.url as string | null) ?? null,
  }));
}
