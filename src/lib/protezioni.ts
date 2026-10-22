// Protezioni del motore (logica pura, testabile). Decidono solo quando NON comprare:
// non cambiano i segnali di acquisto/vendita.

export const MAX_GIORNI_DATI = 4;
/** Scostamento dalla media 10g oltre il quale il prezzo è considerato anomalo (non un'occasione). */
export const MAX_SCOSTAMENTO_SMA10 = 40;
/** Variazione giornaliera oltre la quale la serie è sospetta (split non corretto, errore di dati). */
export const MAX_SALTO_GIORNALIERO = 50;

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
  if (giorni < 0) return "Prezzo con data futura: acquisto saltato.";
  if (giorni > MAX_GIORNI_DATI) return `Prezzi vecchi di ${Math.floor(giorni)} giorni: acquisto saltato.`;
  const ultime = chiusure.slice(-11);
  for (let i = 1; i < ultime.length; i++) {
    const corrente = ultime[i];
    const precedente = ultime[i - 1];
    if (corrente == null || precedente == null) return "Serie incompleta: acquisto saltato.";
    const salto = Math.abs(corrente / precedente - 1) * 100;
    if (salto > MAX_SALTO_GIORNALIERO)
      return `Serie prezzi non confrontabile (salto di ${salto.toFixed(0)}% in un giorno: possibile split o errore): acquisto saltato.`;
  }
  const dieci = chiusure.slice(-10);
  const ultimo = chiusure.at(-1);
  if (dieci.length && ultimo != null) {
    const sma = dieci.reduce((a, b) => a + b, 0) / dieci.length;
    const sc = ((ultimo - sma) / sma) * 100;
    if (Math.abs(sc) > MAX_SCOSTAMENTO_SMA10)
      return `Prezzo anomalo (${sc.toFixed(1)}% dalla media 10g): un ribasso estremo non è trattato come occasione, acquisto saltato.`;
  }
  return null;
}

/** Simboli con ordini ancora aperti presso il broker, normalizzati (BTC/USD → BTCUSD). */
export function simboliAperti(ordini: { symbol?: unknown }[]): Set<string> {
  return new Set(ordini.map((o) => String(o.symbol ?? "").replace("/", "").toUpperCase()).filter(Boolean));
}
