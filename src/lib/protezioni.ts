// Protezioni del motore (logica pura, testabile). Decidono solo quando NON comprare:
// non cambiano i segnali di acquisto/vendita.

export const MAX_GIORNI_DATI = 4;

/** Ragione per cui in questo ciclo non si fanno nuovi acquisti (null = acquisti consentiti). */
export function motivoBloccoAcquisti(s: {
  contoOk: boolean;
  posizioniOk: boolean;
  ordiniApertiOk: boolean;
  limitePerdita: number | null;
  perditaOggi: number | null;
}): string | null {
  if (!s.contoOk) return "Dati del conto non disponibili: nessun nuovo acquisto in questo ciclo.";
  if (!s.posizioniOk) return "Posizioni non leggibili: nessun nuovo acquisto in questo ciclo.";
  if (!s.ordiniApertiOk) return "Ordini aperti non leggibili: nessun nuovo acquisto per evitare duplicati.";
  if (s.limitePerdita && s.limitePerdita > 0 && s.perditaOggi == null)
    return "Perdita giornaliera non verificabile: nessun nuovo acquisto in questo ciclo.";
  return null;
}

/** Ragione per cui i dati di mercato di un titolo non sono utilizzabili per comprare. */
export function problemaDati(chiusure: number[], ultimoGiorno: string | undefined, ora = Date.now()): string | null {
  if (chiusure.some((c) => !Number.isFinite(c) || c <= 0)) return "Prezzi incoerenti: acquisto saltato.";
  if (!ultimoGiorno) return "Data dell'ultimo prezzo mancante: acquisto saltato.";
  const t = Date.parse(ultimoGiorno);
  if (!Number.isFinite(t)) return "Data dell'ultimo prezzo non valida: acquisto saltato.";
  const giorni = (ora - t) / 86_400_000;
  if (giorni > MAX_GIORNI_DATI) return `Prezzi vecchi di ${Math.floor(giorni)} giorni: acquisto saltato.`;
  return null;
}

/** Simboli con ordini ancora aperti presso il broker, normalizzati (BTC/USD → BTCUSD). */
export function simboliAperti(ordini: { symbol?: unknown }[]): Set<string> {
  return new Set(ordini.map((o) => String(o.symbol ?? "").replace("/", "").toUpperCase()).filter(Boolean));
}
