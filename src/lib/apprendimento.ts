// Apprendimento dell'IA: dai risultati delle vendite passate (pnl_pct) ricava
// lezioni che correggono le decisioni future. Logica pura, testabile.

export type EsitoPassato = { ticker: string; pnlPct: number; segnale?: string | null };

/** Riconosce il segnale che ha generato un acquisto dal suo motivo. */
export function segnaleDi(motivo: string | null | undefined): string | null {
  const m = (motivo ?? "").toLowerCase();
  if (m.includes("accumulo")) return "accumulo graduale";
  if (m.includes("trend positivo")) return "trend sopra media 20g";
  if (m.includes("ribasso del")) return "acquisto sul ribasso";
  return null;
}

export type Lezioni = {
  vendite: number;
  tassoVincite: number; // 0..1
  /** Moltiplicatore della quota d'acquisto (meno capitale se si perde spesso). */
  fattoreQuota: number;
  /** Moltiplicatore degli stop: < 1 = stop più stretti. */
  fattoreStop: number;
  /** Guadagno medio delle vincite: usato per prendere profitto prima. */
  guadagnoMedio: number | null;
  segnaliVincenti: Set<string>;
  segnaliPerdenti: Set<string>;
  bloccati: Set<string>; // titoli che fanno perdere ripetutamente
  favoriti: Set<string>; // titoli che fanno vincere con costanza
  riepilogo: string;
};

const MIN_CAMPIONE = 3;

export function calcolaLezioni(esiti: EsitoPassato[]): Lezioni {
  const vendite = esiti.length;
  const vincite = esiti.filter((e) => e.pnlPct > 0);
  const tassoVincite = vendite ? vincite.length / vendite : 0;
  const guadagnoMedio = vincite.length
    ? vincite.reduce((s, e) => s + e.pnlPct, 0) / vincite.length
    : null;

  let fattoreQuota = 1;
  let fattoreStop = 1;
  if (vendite >= MIN_CAMPIONE) {
    if (tassoVincite < 0.4) {
      fattoreQuota = 0.6;
      fattoreStop = 0.7;
    } else if (tassoVincite < 0.5) {
      fattoreQuota = 0.8;
      fattoreStop = 0.85;
    } else if (tassoVincite >= 0.65) {
      fattoreQuota = 1.2;
    }
  }

  const perTicker = new Map<string, number[]>();
  for (const e of esiti) perTicker.set(e.ticker, [...(perTicker.get(e.ticker) ?? []), e.pnlPct]);
  const bloccati = new Set<string>();
  const favoriti = new Set<string>();
  for (const [t, r] of perTicker) {
    const perse = r.filter((x) => x <= 0).length;
    const vinte = r.length - perse;
    const somma = r.reduce((a, b) => a + b, 0);
    if (perse >= 2 && perse > vinte && somma < 0) bloccati.add(t);
    else if (vinte >= 2 && perse === 0) favoriti.add(t);
  }

  const perSegnale = new Map<string, number[]>();
  for (const e of esiti) if (e.segnale) perSegnale.set(e.segnale, [...(perSegnale.get(e.segnale) ?? []), e.pnlPct]);
  const segnaliVincenti = new Set<string>();
  const segnaliPerdenti = new Set<string>();
  for (const [g, r] of perSegnale) {
    if (r.length < MIN_CAMPIONE) continue;
    const tasso = r.filter((x) => x > 0).length / r.length;
    const somma = r.reduce((a, b) => a + b, 0);
    if (tasso >= 0.6 && somma > 0) segnaliVincenti.add(g);
    else if (tasso < 0.4 && somma < 0) segnaliPerdenti.add(g);
  }

  const parti: string[] = [];
  if (segnaliVincenti.size) parti.push(`punta sui segnali vincenti: ${[...segnaliVincenti].join(", ")}`);
  if (segnaliPerdenti.size) parti.push(`scarta i segnali perdenti: ${[...segnaliPerdenti].join(", ")}`);
  if (vendite < MIN_CAMPIONE) parti.push(`l'IA sta ancora raccogliendo esperienza (${vendite} vendite chiuse)`);
  else {
    parti.push(`${Math.round(tassoVincite * 100)}% di vendite in guadagno su ${vendite}`);
    if (fattoreStop < 1) parti.push("stop di perdita più stretti e importi ridotti");
    if (fattoreQuota > 1) parti.push("importi aumentati perché la strategia sta funzionando");
  }
  if (bloccati.size) parti.push(`evita ${[...bloccati].join(", ")} (perdite ripetute)`);
  if (favoriti.size) parti.push(`privilegia ${[...favoriti].join(", ")}`);

  return {
    vendite,
    tassoVincite,
    fattoreQuota,
    fattoreStop,
    guadagnoMedio,
    segnaliVincenti,
    segnaliPerdenti,
    bloccati,
    favoriti,
    riepilogo: `Apprendimento: ${parti.join("; ")}.`,
  };
}

/** Stop base per strategia (in %, negativo). */
const STOP: Record<string, number> = { conservativo: -10, medio: -8, aggressivo: -7 };

export type Scelta = { azione: "compra" | "vendi" | "attendi"; importo: number; motivo: string };

export function applicaLezioni(
  scelta: Scelta,
  strategia: string,
  ticker: string,
  posizione: { valore: number; pnlPct: number } | undefined,
  l: Lezioni,
): Scelta {
  const pos = posizione && posizione.valore > 0 ? posizione : undefined;
  if (pos && scelta.azione !== "vendi") {
    const stop = (STOP[strategia] ?? -8) * l.fattoreStop;
    if (pos.pnlPct <= stop)
      return { azione: "vendi", importo: pos.valore, motivo: `Stop appreso a ${stop.toFixed(1)}% (perdite passate): taglio a ${pos.pnlPct.toFixed(1)}%.` };
    if (l.bloccati.has(ticker) && pos.pnlPct > 0)
      return { azione: "vendi", importo: pos.valore, motivo: `Titolo con perdite ripetute: l'IA incassa subito +${pos.pnlPct.toFixed(1)}%.` };
    if (l.guadagnoMedio != null && l.vendite >= MIN_CAMPIONE && l.tassoVincite < 0.5 && pos.pnlPct >= Math.max(2, l.guadagnoMedio))
      return { azione: "vendi", importo: pos.valore, motivo: `Presa di profitto appresa a +${pos.pnlPct.toFixed(1)}% (media vincite ${l.guadagnoMedio.toFixed(1)}%).` };
  }
  if (scelta.azione === "compra") {
    if (l.bloccati.has(ticker))
      return { azione: "attendi", importo: 0, motivo: "Escluso dall'apprendimento: questo titolo ha fatto perdere più volte." };
    const segnale = segnaleDi(scelta.motivo);
    if (segnale && l.segnaliPerdenti.has(segnale))
      return { azione: "attendi", importo: 0, motivo: `Segnale "${segnale}" scartato: in passato ha fatto perdere.` };
    let fattore = l.favoriti.has(ticker) ? Math.max(l.fattoreQuota, 1.2) : l.fattoreQuota;
    if (segnale && l.segnaliVincenti.has(segnale)) fattore = Math.max(fattore, 1) * 1.3;
    if (fattore !== 1)
      return {
        ...scelta,
        importo: scelta.importo * fattore,
        motivo: `${scelta.motivo} Importo ×${fattore.toFixed(1)} in base ai risultati passati.`,
      };
  }
  return scelta;
}

export async function leggiLezioni(
  userId: string,
  piattaforma: string,
  ambiente: "paper" | "reale",
  strategia: string,
): Promise<Lezioni> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("ordini_ia")
      .select("ticker, pnl_pct, lato, motivo, created_at")
      .eq("user_id", userId)
      .eq("piattaforma", piattaforma)
      .eq("ambiente", ambiente)
      .eq("strategia", strategia)
      .gte("created_at", new Date(Date.now() - 60 * 86400_000).toISOString())
      .order("created_at", { ascending: true })
      .limit(1000);
    // Abbina ogni vendita all'ultimo acquisto dello stesso titolo per sapere quale segnale l'ha generata.
    const ultimoAcquisto = new Map<string, string | null>();
    const esiti: EsitoPassato[] = [];
    for (const r of data ?? []) {
      if (r.lato === "buy") ultimoAcquisto.set(r.ticker, segnaleDi(r.motivo));
      else if (r.pnl_pct != null)
        esiti.push({ ticker: r.ticker, pnlPct: Number(r.pnl_pct), segnale: ultimoAcquisto.get(r.ticker) ?? null });
    }
    return calcolaLezioni(esiti);
  } catch {
    return calcolaLezioni([]);
  }
}
