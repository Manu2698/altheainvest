import type { Json } from "@/integrations/supabase/types";
import type { SaldoTitolo } from "./esecuzioni";
export type VenditaContabile = { ordine:string;ticker:string;ora:string;costo:number;pnl:number };
export function leggiContabilita(v: Json | undefined) {
  if (!v || typeof v!=="object" || Array.isArray(v)) return {saldi:[] as SaldoTitolo[],vendite:[] as VenditaContabile[]};
  const saldi = Array.isArray(v["saldi"]) ? v["saldi"] as unknown as SaldoTitolo[] : [];
  const vendite = Array.isArray(v["vendite"]) ? v["vendite"] as unknown as VenditaContabile[] : [];
  return {saldi,vendite};
}
/** Un ordine con più esecuzioni conta una sola volta; i parziali ancora aperti non sono esiti chiusi. */
export function venditeConfermate(v: VenditaContabile[], ordini:{broker_id:string|null;stato:string;riconciliato_il:string|null;strategia:string}[]) {
  const grouped = new Map<string,VenditaContabile & {strategia:string}>();
  for (const f of v) {
    const o=ordini.find(o=>o.broker_id===f.ordine);
    if (!o?.riconciliato_il || !["filled","canceled","expired"].includes(o.stato) || !["medio","conservativo","aggressivo"].includes(o.strategia) || !Number.isFinite(f.costo) || f.costo<=0 || !Number.isFinite(f.pnl)) continue;
    const prior=grouped.get(f.ordine);
    grouped.set(f.ordine,{...f,costo:f.costo+(prior?.costo ?? 0),pnl:f.pnl+(prior?.pnl ?? 0),strategia:o.strategia});
  }
  return [...grouped.values()];
}