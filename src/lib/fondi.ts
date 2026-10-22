export function validaLimiteFondi(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error("Inserisci un importo valido, maggiore o uguale a zero.");
  return Math.floor(n * 100) / 100;
}

/** I limiti personali riducono fondi utilizzabili, non concedono margine o fondi aggiuntivi. */
export function fondiUtilizzabili(cash: number, buyingPower: number, liquidita: number | null, acquisto: number | null) {
  if (![cash, buyingPower].every(Number.isFinite)) return 0;
  return Math.max(0, Math.min(cash, buyingPower, liquidita ?? Infinity, acquisto ?? Infinity));
}