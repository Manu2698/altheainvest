// Logica pura del comitato multi-agente: indicatori verificabili e regole di decisione finale.
// Le regole qui sono vincolanti: nessuna risposta di un modello può scavalcarle.

export type Voto = "favorevole" | "contrario" | "neutrale" | "dati_insufficienti";
export type Analisi = { voto: Voto; fiducia: number; sintesi: string; punti: string[]; datiMancanti: string[] };
export type Turno = { agente: "bull" | "bear"; turno: number; posizione: "BUY" | "SELL" | "HOLD"; argomenti: string[]; risposteObiezioni: string[]; attendibilita: string; conclusione: boolean };
export type Rischio = { veto: boolean; livello: "basso" | "medio" | "alto"; motivi: string[]; fattoreMassimo: number };
export type Coordinatore = { decisione: "procedi" | "attendi"; fattore: number; contraddizioni: string[]; motivazione: string };

const media = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Indicatori calcolati solo dai prezzi di chiusura disponibili; null quando lo storico non basta. */
export function indicatoriTecnici(chiusure: number[]) {
  const c = chiusure.filter((x) => Number.isFinite(x) && x > 0);
  const ultimo = c.at(-1) ?? null;
  const sma = (n: number) => (c.length >= n ? r2(media(c.slice(-n))) : null);
  const variazione = (n: number) => (c.length > n && ultimo ? r2((ultimo / c[c.length - 1 - n]! - 1) * 100) : null);
  let rsi14: number | null = null;
  if (c.length >= 15) {
    let su = 0, giu = 0;
    for (let i = c.length - 14; i < c.length; i++) {
      const d = c[i]! - c[i - 1]!;
      if (d > 0) su += d; else giu -= d;
    }
    rsi14 = giu === 0 ? 100 : r2(100 - 100 / (1 + su / giu));
  }
  let volatilita20: number | null = null;
  if (c.length >= 21) {
    const rend = c.slice(-21).slice(1).map((p, i) => p / c.slice(-21)[i]! - 1);
    const m = media(rend);
    volatilita20 = r2(Math.sqrt(media(rend.map((x) => (x - m) ** 2))) * 100);
  }
  const finestra = c.slice(-20);
  return {
    osservazioni: c.length,
    ultimo,
    sma10: sma(10),
    sma20: sma(20),
    rsi14,
    variazione5g: variazione(5),
    variazione20g: variazione(20),
    volatilitaGiornaliera20g: volatilita20,
    supporto20g: finestra.length >= 20 ? Math.min(...finestra) : null,
    resistenza20g: finestra.length >= 20 ? Math.max(...finestra) : null,
    volumi: "non disponibili in questa versione",
  };
}

/** Esito del dibattito: senza tesi solida e senza obiezioni superate prevale HOLD. */
export function esitoDibattito(turni: Turno[], proposta: "BUY" | "SELL"): "BUY" | "SELL" | "HOLD" {
  const ultimoBull = [...turni].reverse().find((t) => t.agente === "bull");
  const ultimoBear = [...turni].reverse().find((t) => t.agente === "bear");
  if (!ultimoBull || !ultimoBear || turni.length < 4) return "HOLD";
  // bull.conclusione = la tesi regge; bear.conclusione = obiezioni decisive.
  if (ultimoBull.posizione === proposta && ultimoBull.conclusione && !ultimoBear.conclusione) return proposta;
  return "HOLD";
}

/** Decisione finale vincolante: veto del Risk Manager assoluto, HOLD su dati insufficienti o dibattito non concluso. */
export function decisioneFinale(s: {
  proposta: "BUY" | "SELL";
  importo: number;
  analisti: (Analisi | null)[];
  dibattito: "BUY" | "SELL" | "HOLD";
  rischio: Rischio | null;
  coordinatore: Coordinatore | null;
}): { procedi: boolean; importo: number; motivo: string } {
  const stop = (motivo: string) => ({ procedi: false, importo: 0, motivo });
  if (!s.rischio) return stop("Risk Manager non disponibile: nessuna operazione.");
  if (s.rischio.veto) return stop(`Veto del Risk Manager: ${s.rischio.motivi.slice(0, 2).join("; ") || "rischio non accettabile"}.`);
  if (s.analisti.some((a) => !a)) return stop("Analisi incomplete: prevale HOLD.");
  const validi = s.analisti.filter((a): a is Analisi => a != null && a.voto !== "dati_insufficienti");
  if (validi.length < 2) return stop("Dati insufficienti per almeno due analisti: prevale HOLD.");
  if (s.dibattito !== s.proposta) return stop("Dual Risk Debate senza conclusione affidabile: prevale HOLD.");
  if (!s.coordinatore || s.coordinatore.decisione !== "procedi") return stop(`Coordinatore: ${s.coordinatore?.motivazione || "non intervenire"}.`);
  const fattore = Math.max(0, Math.min(1, s.coordinatore.fattore, s.rischio.fattoreMassimo));
  const importo = Math.floor(s.importo * fattore * 100) / 100;
  if (importo < 1) return stop("Importo ridotto dal comitato sotto il minimo d'ordine: nessuna operazione.");
  return { procedi: true, importo, motivo: s.coordinatore.motivazione };
}
