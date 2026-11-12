import type { StrategyId } from "./strategies";

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
type Posizione = { ticker: string; valore: number; pnlPct: number };

/** Segnale condiviso, invariato: nessuna chiamata al broker o apprendimento. */
export function decide(
  strategia: StrategyId,
  ticker: string,
  chiusure: number[],
  posizione: Posizione | undefined,
  quotaTarget: number,
): { azione: "compra" | "vendi" | "attendi"; importo: number; motivo: string } {
  if (chiusure.length < 6) {
    return { azione: "attendi", importo: 0, motivo: "Storico prezzi insufficiente." };
  }
  const ultimo = chiusure.at(-1) ?? 0;
  const sma10 = media(chiusure.slice(-10));
  const sma20 = media(chiusure.slice(-20));
  const scostamento = ((ultimo - sma10) / sma10) * 100;
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

  if (posseduto > 0 && pnl >= 5)
    return {
      azione: "vendi",
      importo: posseduto,
      motivo: `Presa di profitto a +${pnl.toFixed(1)}% prima del rientro.`,
    };
  if (posseduto > 0 && pnl <= -7)
    return { azione: "vendi", importo: posseduto, motivo: `Taglio perdita a ${pnl.toFixed(1)}%.` };
  if (scostamento <= -2 && mancante > quotaTarget * 0.2)
    return {
      azione: "compra",
      importo: mancante,
      motivo: `Ribasso del ${scostamento.toFixed(1)}% sotto la media 10g: entrata sul calo.`,
    };
  return { azione: "attendi", importo: 0, motivo: "Prezzo non ancora abbastanza sceso." };
}