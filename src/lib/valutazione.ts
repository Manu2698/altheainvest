import { qualitaCampione, validaFuoriCampione, type Metriche } from "./metriche";

export type EsitoValutabile = {
  id: string; conto: string; ticker: string; strategia: string; ora: string;
  pnlLordo: number; costoAllocato: number | null;
  settore: string | null; mercato: string | null;
};

/** Una vendita broker terminale, non un fill né un intero round-trip di posizione. */
export function riepilogaEsiti(input: EsitoValutabile[]) {
  const unici = new Map<string, EsitoValutabile>();
  const conflitti = new Set<string>();
  for (const e of input) {
    const key = `${e.conto}:${e.id}`;
    const prior = unici.get(key);
    if (prior && JSON.stringify(prior) !== JSON.stringify(e)) conflitti.add(key);
    unici.set(key, e);
  }
  const esiti = [...unici.entries()].filter(([key, e]) => !conflitti.has(key) && Number.isFinite(e.pnlLordo) && Number.isFinite(Date.parse(e.ora))).map(([, e]) => e);
  const costiCompleti = esiti.length > 0 && esiti.every(e => e.costoAllocato != null && Number.isFinite(e.costoAllocato) && e.costoAllocato >= 0);
  const pnl = esiti.map(e => e.pnlLordo - (costiCompleti ? (e.costoAllocato ?? 0) : 0));
  const gains = pnl.filter(x => x > 0), losses = pnl.filter(x => x < 0);
  const somma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const utile = somma(gains), perdita = -somma(losses);
  const guadagnoMedio = gains.length ? utile / gains.length : null;
  const perditaMedia = losses.length ? perdita / losses.length : null;
  return {
    operazioni: pnl.length, vincite: gains.length, perdite: losses.length, pareggi: pnl.filter(x => x === 0).length,
    percentualeVincite: pnl.length ? gains.length / pnl.length * 100 : null,
    guadagnoMedio, perditaMedia,
    rapporto: guadagnoMedio != null && perditaMedia != null ? guadagnoMedio / perditaMedia : null,
    profitFactor: perdita > 0 ? utile / perdita : null,
    pnl: pnl.length ? somma(pnl) : null,
    aspettativaNetta: costiCompleti ? somma(pnl) / pnl.length : null,
    base: costiCompleti ? "netto" as const : "lordo" as const,
    qualita: qualitaCampione(pnl.length), conflitti: conflitti.size,
  };
}

export function raggruppaEsiti(esiti: EsitoValutabile[], campo: "ticker" | "strategia" | "settore" | "mercato") {
  const nomi = [...new Set(esiti.map(e => e[campo] ?? "Non disponibile"))].sort();
  return nomi.map(nome => ({ nome, ...riepilogaEsiti(esiti.filter(e => (e[campo] ?? "Non disponibile") === nome)) }));
}

export const FATTORI_INIZIALI = [
  { id: "trend" as const, nome: "Direzione del trend", regola: "SMA10 > SMA20", dati: "20 chiusure split-adjusted, note prima dell'acquisto" },
  { id: "momentum" as const, nome: "Momentum a 5 sedute", regola: "Chiusura / chiusura di 5 sedute prima − 1 > 0", dati: "6 chiusure confrontabili, note prima dell'acquisto" },
];

export type OsservazioneFattori = EsitoValutabile & {
  ingressoIl: string; osservatoIl: string;
  sma10: number | null; sma20: number | null; momentum5: number | null;
};

/** Analisi offline descrittiva; non collegata al dimensionamento o all'invio di ordini. */
export function confrontaFattore(input: OsservazioneFattori[], fattore: "trend" | "momentum", portafogli?: { base: Metriche; candidato: Metriche }) {
  const unici = new Map<string, OsservazioneFattori>();
  const conflitti = new Set<string>();
  for (const e of input) {
    const key = `${e.conto}:${e.id}`;
    const prior = unici.get(key);
    if (prior && JSON.stringify(prior) !== JSON.stringify(e)) conflitti.add(key);
    unici.set(key, e);
  }
  const rows = [...unici.values()].sort((a, b) => a.ingressoIl.localeCompare(b.ingressoIl));
  const valido = (e: OsservazioneFattori) => Number.isFinite(Date.parse(e.osservatoIl)) && Number.isFinite(Date.parse(e.ingressoIl)) && Date.parse(e.osservatoIl) <= Date.parse(e.ingressoIl) && Number.isFinite(e.pnlLordo) && e.costoAllocato != null && Number.isFinite(e.costoAllocato) && e.costoAllocato >= 0 && (fattore === "trend" ? e.sma10 != null && e.sma20 != null && Number.isFinite(e.sma10) && Number.isFinite(e.sma20) && e.sma10 > 0 && e.sma20 > 0 : e.momentum5 != null && Number.isFinite(e.momentum5));
  const seleziona = (e: OsservazioneFattori) => fattore === "trend" ? (e.sma10 ?? 0) > (e.sma20 ?? 0) : (e.momentum5 ?? 0) > 0;
  // Nessuna cancellazione silenziosa di osservazioni mancanti o contaminazione di conti/profili.
  const completo = rows.length > 0 && !conflitti.size && new Set(rows.map(e => `${e.conto}:${e.strategia}`)).size === 1 && rows.every(valido);
  const taglio = Math.floor(rows.length * 0.7);
  const fuori = rows.slice(taglio);
  const base = riepilogaEsiti(completo ? fuori : []);
  const candidato = riepilogaEsiti(completo ? fuori.filter(seleziona) : []);
  const netto = (e: OsservazioneFattori) => e.pnlLordo - (e.costoAllocato ?? 0);
  const validato = completo && validaFuoriCampione(rows.map(netto)) && validaFuoriCampione(rows.filter(seleziona).map(netto));
  const b = portafogli?.base, c = portafogli?.candidato;
  const rischioConfrontabile = Boolean(b && c && b.dal === c.dal && b.al === c.al && b.rendimentoPct != null && c.rendimentoPct != null && b.drawdownMassimoPct != null && c.drawdownMassimoPct != null);
  const miglioramento = validato && rischioConfrontabile && base.aspettativaNetta != null && candidato.aspettativaNetta != null && candidato.aspettativaNetta > base.aspettativaNetta && base.profitFactor != null && candidato.profitFactor != null && candidato.profitFactor > base.profitFactor && b?.rendimentoPct != null && c?.rendimentoPct != null && c.rendimentoPct > b.rendimentoPct && b.drawdownMassimoPct != null && c.drawdownMassimoPct != null && c.drawdownMassimoPct >= b.drawdownMassimoPct;
  return { base, candidato, completo, validato, rischioConfrontabile, miglioramento, attivazioneAutomatica: false as const };
}