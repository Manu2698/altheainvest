export type Fill = { id: string; ordine: string; ticker: string; lato: string; quantita: number; prezzo: number; ora: string };
export type SaldoTitolo = { ticker: string; quantita: number; costo: number; prezzoMedio: number | null; realizzato: number; coerente: boolean };
export function contabilizzaEsecuzioni(fills: Fill[], origineCompleta: boolean) {
  const saldi = new Map<string, SaldoTitolo>();
  const vendite: { ordine: string; ticker: string; ora: string; costo: number; pnl: number }[] = [];
  const unici = new Map<string, Fill>();
  const conflitti = new Set<string>();
  for (const f of fills) {
    const old = unici.get(f.id);
    if (old && JSON.stringify(old) !== JSON.stringify(f)) conflitti.add(f.ticker);
    unici.set(f.id, f);
  }
  for (const f of [...unici.values()].sort((a,b) => a.ora.localeCompare(b.ora) || a.id.localeCompare(b.id))) {
    const s = saldi.get(f.ticker) ?? { ticker:f.ticker,quantita:0,costo:0,prezzoMedio:null,realizzato:0,coerente:origineCompleta };
    if (!f.id || !f.ordine || !Number.isFinite(Date.parse(f.ora)) || !Number.isFinite(f.quantita) || f.quantita <= 0 || !Number.isFinite(f.prezzo) || f.prezzo <= 0 || !["buy","sell"].includes(f.lato) || conflitti.has(f.ticker)) s.coerente = false;
    if (s.coerente) {
      if (f.lato === "buy") { s.quantita += f.quantita; s.costo += f.quantita * f.prezzo; }
      else if (f.quantita > s.quantita + 1e-8) s.coerente = false;
      else {
        const costo = (s.quantita > 0 ? s.costo / s.quantita : 0) * f.quantita;
        const pnl = f.quantita * f.prezzo - costo;
        s.realizzato += pnl; s.quantita = Math.max(0,s.quantita-f.quantita); s.costo = s.quantita < 1e-8 ? 0 : s.costo-costo;
        vendite.push({ordine:f.ordine,ticker:f.ticker,ora:f.ora,costo,pnl});
      }
      s.prezzoMedio = s.quantita > 1e-8 ? s.costo/s.quantita : null;
    }
    saldi.set(f.ticker,s);
  }
  return { saldi:[...saldi.values()], vendite:vendite.filter(v => saldi.get(v.ticker)?.coerente) };
}

export function verificaEseguito(qty: number, prezzo: number | null, fills: Fill[]) {
  const unici = [...new Map(fills.map(f => [f.id,f])).values()];
  if (!Number.isFinite(qty) || qty < 0 || unici.some(f => !f.id || f.quantita <= 0 || f.prezzo <= 0 || !Number.isFinite(f.quantita*f.prezzo))) return false;
  const q = unici.reduce((s,f)=>s+f.quantita,0);
  const valore = unici.reduce((s,f)=>s+f.quantita*f.prezzo,0);
  return Math.abs(q-qty)<1e-8 && (qty===0 || (prezzo != null && Number.isFinite(prezzo) && Math.abs(valore/qty-prezzo)<0.0001));
}

/** Ordini market in quantità senza prezzo massimo: esposizione non determinabile. */
export function capitalePendenti(ordini: Record<string, unknown>[]): number | null {
  let totale=0;
  for (const o of ordini) {
    if (o["side"] !== "buy") continue;
    const eseguito=Number(o["filled_qty"] ?? 0);
    if (!Number.isFinite(eseguito) || eseguito<0) return null;
    if (o["notional"] != null) {
      const n=Number(o["notional"]), p=Number(o["filled_avg_price"] ?? 0);
      if (!Number.isFinite(n) || n<0 || !Number.isFinite(p) || (eseguito>0 && p<=0)) return null;
      totale+=Math.max(0,n-eseguito*p);
    } else {
      const q=Number(o["qty"]), p=Number(o["limit_price"]);
      if (!Number.isFinite(q) || q<eseguito || !Number.isFinite(p) || p<=0 || !["limit","stop_limit"].includes(String(o["type"]))) return null;
      totale+=(q-eseguito)*p;
    }
  }
  return totale;
}