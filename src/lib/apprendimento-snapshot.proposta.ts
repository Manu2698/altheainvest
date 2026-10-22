/** Proposta isolata della fase 1: NON importata dal motore o dalle funzioni operative. */
export type EvidenzaSnapshot = {
  snapshot: { stato: string; osservatoAl: string } | null;
  erroreSnapshot: boolean;
  erroreOrdini: boolean;
  numeroOrdini: number;
};

/** Mantiene freschezza 120s e cap query 5000 esistenti; non decide acquisti o vendite. */
export function snapshotAmmissibilePerLezioni(e: EvidenzaSnapshot, adesso: number): boolean {
  if (e.erroreSnapshot || e.erroreOrdini || !e.snapshot || e.snapshot.stato !== "riconciliato") return false;
  if (!Number.isInteger(e.numeroOrdini) || e.numeroOrdini < 0 || e.numeroOrdini >= 5000) return false;
  const osservato = Date.parse(e.snapshot.osservatoAl);
  const eta = adesso - osservato;
  return Number.isFinite(adesso) && Number.isFinite(osservato) && eta >= 0 && eta < 120000;
}