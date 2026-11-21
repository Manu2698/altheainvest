import type { StrategyId } from "./strategies";

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

export type PosizioneDecisione = { ticker: string; valore: number; pnlPct: number; piccoPnlPct?: number };

export function decide(
  strategia: StrategyId,
  ticker: string,
  chiusure: number[],
  posizione: PosizioneDecisione | undefined,
  quotaTarget: number,
): { azione: "compra" | "vendi" | "attendi"; importo: number; motivo: string } {
  if (chiusure.length < 6) {
    return { azione: "attendi", importo: 0, motivo: "Storico prezzi insufficiente." };
  }
  const ultimo = chiusure.at(-1) ?? 0;
  const sma10 = media(chiusure.slice(-10));
  const sma20 = media(chiusure.slice(-20));
  const scostamento = ((ultimo - sma10) / sma10) * 100;
  const ultimi15 = chiusure.slice(-15);
  let rsi14: number | null = null;
  if (ultimi15.length === 15) {
    let guadagni = 0, perdite = 0;
    for (let i = 1; i < ultimi15.length; i++) {
      const delta = ultimi15[i]! - ultimi15[i - 1]!;
      if (delta > 0) guadagni += delta;
      else perdite -= delta;
    }
    rsi14 = perdite === 0 ? 100 : 100 - 100 / (1 + guadagni / perdite);
  }
  const finestra20 = chiusure.slice(-20);
  const deviazione20 = finestra20.length === 20
    ? Math.sqrt(media(finestra20.map((p) => (p - sma20) ** 2)))
    : null;
  const bandaInferiore2σ = deviazione20 == null ? null : sma20 - 2 * deviazione20;
  const posseduto = posizione?.valore ?? 0;
  const mancante = Math.max(0, quotaTarget - posseduto);
  const pnl = posizione?.pnlPct ?? 0;

  if (strategia === "conservativo") {
    if (pnl <= -10)
      return { azione: "vendi", importo: posseduto, motivo: `Stop di protezione a ${pnl.toFixed(1)}%.` };
    if (mancante > quotaTarget * 0.2)
      return {
        azione: "compra",
        importo: mancante,
        motivo: `Accumulo graduale verso la quota target (prezzo ${scostamento.toFixed(1)}% dalla media 10g).`,
      };
    return { azione: "attendi", importo: 0, motivo: "Posizione già alla quota prevista." };
  }

  if (strategia === "medio") {
    if (ultimo > sma20 && mancante > quotaTarget * 0.2)
      return {
        azione: "compra",
        importo: mancante,
        motivo: "Trend positivo: prezzo sopra la media a 20 giorni.",
      };
    if (ultimo < sma20 * 0.97 && posseduto > 0)
      return {
        azione: "vendi",
        importo: posseduto,
        motivo: "Rottura al ribasso della media a 20 giorni.",
      };
    if (pnl <= -8 && posseduto > 0)
      return { azione: "vendi", importo: posseduto, motivo: `Stop di rischio a ${pnl.toFixed(1)}%.` };
    return { azione: "attendi", importo: 0, motivo: "Nessun segnale netto sul trend." };
  }

  // aggressivo: ingresso contrarian, stop iniziale -7% e trailing profit persistente.
  if (posseduto > 0 && pnl <= -7)
    return { azione: "vendi", importo: posseduto, motivo: `Stop loss fisso della strategia aggressiva a -7% (attuale ${pnl.toFixed(1)}%).` };
  const picco = Math.max(pnl, posizione?.piccoPnlPct ?? pnl);
  const sogliaTrailing = Math.max(2, picco - 5);
  if (posseduto > 0 && picco >= 5 && pnl <= sogliaTrailing)
    return { azione: "vendi", importo: posseduto, motivo: `Trailing stop aggressivo: massimo profitto +${picco.toFixed(1)}%, protezione attivata a +${sogliaTrailing.toFixed(1)}%, attuale +${pnl.toFixed(1)}%.` };
  if (rsi14 != null && bandaInferiore2σ != null && rsi14 < 30 && ultimo <= bandaInferiore2σ && mancante > quotaTarget * 0.2)
    return {
      azione: "compra",
      importo: mancante,
      motivo: `Segnale aggressivo completo: RSI14 ${rsi14.toFixed(1)} (<30) e prezzo sotto la banda inferiore a -2σ (${bandaInferiore2σ.toFixed(2)}); ingresso sul ribasso estremo.`,
    };
  return { azione: "attendi", importo: 0, motivo: rsi14 == null || bandaInferiore2σ == null
    ? "Storico insufficiente per RSI14 e bande a 2 deviazioni standard."
    : `Segnale aggressivo non completo: RSI14 ${rsi14.toFixed(1)}, prezzo ${ultimo.toFixed(2)}, soglia -2σ ${bandaInferiore2σ.toFixed(2)}.` };
}



/** Decisione operativa quando il limite di drawdown mensile aggressivo è stato raggiunto. */
export function decisioneDrawdownMensile(
  bloccato: boolean,
  posizione: { valore: number } | undefined,
): { azione: "vendi" | "attendi"; importo: number; motivo: string } | null {
  if (!bloccato) return null;
  if (posizione && Number.isFinite(posizione.valore) && posizione.valore > 0)
    return { azione: "vendi", importo: posizione.valore, motivo: "Drawdown mensile superiore al 20%: liquidazione totale della posizione e blocco acquisti fino al mese successivo." };
  return { azione: "attendi", importo: 0, motivo: "Drawdown mensile superiore al 20%: strategia in pausa fino al mese successivo." };
}
