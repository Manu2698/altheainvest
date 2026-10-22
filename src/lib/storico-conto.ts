/** I registri precedenti restano persistenti, ma non entrano nello storico del conto collegato. */
export function ordiniContoAttuale<T extends { piattaforma: string; ambiente: string; conto_id: string | null; conto_attribuzione?: string | null }>(
  righe: T[], piattaforma: string, ambiente: string, contoId: string | null,
): T[] {
  if (!contoId) return [];
  return righe.filter(r => r.piattaforma === piattaforma && r.ambiente === ambiente
    && r.conto_id === contoId && ["motore", "verificato_broker"].includes(r.conto_attribuzione ?? ""));
}