export type PosizioneContabile = { ticker: string; quantita: number; valore: number; costo: number; pnl: number };
export type ControlloContabile = { stato: "riconciliato" | "incompleto"; motivo: string; scarto: number | null };
export function controllaIstantanea(i: {
  prima: { id: string; equity: number; cash: number };
  dopo: { id: string; equity: number; cash: number };
  posizioni: PosizioneContabile[];
  ordiniStabili: boolean;
  datiCompleti: boolean;
  ordiniPendenti: boolean;
}): ControlloContabile {
  const incompleto = (motivo: string, scarto: number | null = null): ControlloContabile => ({ stato: "incompleto", motivo, scarto });
  if (!i.prima.id || i.prima.id !== i.dopo.id) return incompleto("Identità del conto non verificata.");
  if (!i.datiCompleti || ![i.prima.equity, i.prima.cash, i.dopo.equity, i.dopo.cash, ...i.posizioni.flatMap(p => [p.valore, p.quantita, p.costo, p.pnl])].every(Number.isFinite))
    return incompleto("Ordini, esecuzioni, flussi o posizioni incompleti.");
  if (!i.ordiniStabili || i.prima.equity !== i.dopo.equity || i.prima.cash !== i.dopo.cash)
    return incompleto("Il conto è cambiato durante la lettura: nuova riconciliazione necessaria.");
  const scarto = Math.round((i.dopo.equity - i.dopo.cash - i.posizioni.reduce((s, p) => s + p.valore, 0)) * 100) / 100;
  if (scarto !== 0) return incompleto("Equity, liquidità e posizioni non coincidono al centesimo.", scarto);
  if (i.ordiniPendenti) return incompleto("Ordini in corso o esecuzioni non ancora confermate.", scarto);
  return { stato: "riconciliato", motivo: "Equity, posizioni ed esecuzioni coerenti nella finestra di osservazione; non è una certificazione del profitto realizzato.", scarto };
}