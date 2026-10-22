import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getRiconciliazione, salvaFondi } from "@/lib/riconciliazione.functions";
import type { ContoAutomazione } from "@/lib/automazione.functions";
import { leggiContabilita } from "@/lib/contabilita";

export function FondiConto({ conto }: { conto: ContoAutomazione }) {
  const [cash, setCash] = useState(conto.liquiditaLimite == null ? "" : String(conto.liquiditaLimite));
  const [power, setPower] = useState(conto.acquistoLimite == null ? "" : String(conto.acquistoLimite));
  const qc = useQueryClient();
  const leggi = useServerFn(getRiconciliazione);
  const salva = useServerFn(salvaFondi);
  const q = useQuery({ queryKey: ["riconciliazione", conto.ambiente], queryFn: () => leggi({ data: { reale: conto.ambiente === "reale" } }), enabled: conto.piattaforma === "alpaca" && conto.collegato, retry: 1, retryDelay: 3000, refetchInterval: 60_000 });
  const mutation = useMutation({ mutationFn: () => salva({ data: { piattaforma: conto.piattaforma, ambiente: conto.ambiente, liquidita: cash.trim() ? Number(cash) : null, acquisto: power.trim() ? Number(power) : null } }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["automazioni-conti"] }); void q.refetch(); } });
  if (conto.piattaforma !== "alpaca") return null;
  const fmt = (n: number | null | undefined) => n == null ? "—" : `${Number(n).toLocaleString("it-IT", { maximumFractionDigits: 2 })} ${q.data?.valuta ?? "USD"}`;
  const saldi = leggiContabilita(q.data?.contabilita).saldi;
  return <div className="mt-3 border-t border-border pt-3">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <h4 className="font-semibold">Fondi utilizzabili dall'IA</h4>
      <span className="text-muted-foreground">Disponibili: liquidità {fmt(q.data?.liquidita)} · potere d'acquisto {fmt(q.data?.potereAcquisto)}</span>
      <Button variant="ghost" size="icon-sm" title="Aggiorna e riconcilia" aria-label={`Riconcilia conto ${conto.ambiente}`} disabled={q.isFetching} onClick={() => void q.refetch()}><RefreshCw className={q.isFetching ? "animate-spin" : ""} /></Button>
    </div>
    <div className="mt-2 flex flex-wrap items-end gap-3">
      <label className="text-[11px] text-muted-foreground">Liquidità massima utilizzabile
        <input aria-label={`Liquidità massima ${conto.ambiente}`} className="numeric mt-1 block w-44 rounded-md border border-border bg-background px-2 py-1.5 text-xs" type="number" min={0} max={q.data?.liquidita ?? undefined} step="0.01" placeholder="Disponibilità del conto" value={cash} onChange={e => setCash(e.target.value)} />
      </label>
      <label className="text-[11px] text-muted-foreground">Potere d'acquisto massimo utilizzabile
        <input aria-label={`Potere d'acquisto massimo ${conto.ambiente}`} className="numeric mt-1 block w-44 rounded-md border border-border bg-background px-2 py-1.5 text-xs" type="number" min={0} max={q.data?.potereAcquisto ?? undefined} step="0.01" placeholder="Disponibilità del conto" value={power} onChange={e => setPower(e.target.value)} />
      </label>
      <Button size="sm" variant="outline" disabled={mutation.isPending || !q.data} onClick={() => mutation.mutate()}><Save />Salva fondi</Button>
    </div>
    <p className="mt-2 text-[10px] text-muted-foreground">Valori vuoti: disponibilità del broker. Zero: nessun nuovo acquisto. Restano validi il tetto di capitale e la liquidità effettiva, senza leva aggiuntiva.</p>
    {mutation.isSuccess && <p role="status" className="mt-2 text-xs text-bull">Limiti salvati.</p>}
    {(mutation.error || q.error) && <p role="alert" className="mt-2 text-xs text-warn">{(mutation.error || q.error)?.message}</p>}
    {q.data && <p className="mt-2 text-[11px] text-muted-foreground">{q.data.stato === "riconciliato" ? "Riconciliato" : "Dati incompleti"} · {q.data.motivo} · {new Date(q.data.aggiornatoIl).toLocaleString("it-IT")}</p>}
    {saldi.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[440px] text-left text-[11px]"><thead><tr className="border-b border-border"><th>Titolo</th><th>Quantità</th><th>Costo medio</th><th>P&L realizzato lordo fee</th></tr></thead><tbody>{saldi.map(s=><tr key={s.ticker} className="border-b border-border"><td className="py-1">{s.ticker}</td><td>{s.coerente ? s.quantita : "Da verificare"}</td><td>{s.coerente ? fmt(s.prezzoMedio) : "—"}</td><td>{s.coerente ? fmt(s.realizzato) : "—"}</td></tr>)}</tbody></table></div>}
    {q.data && <div className="mt-3 border-t border-border pt-3 text-xs">
      <h4 className="font-semibold">Rischio rispetto al capitale effettivo</h4>
      <p className="mt-1 text-warn">Limite giornaliero attuale: {fmt(conto.perditaMaxGiornaliera)}{conto.perditaMaxGiornaliera != null && q.data.equity != null && q.data.equity > 0 ? ` · ${(conto.perditaMaxGiornaliera / q.data.equity * 100).toFixed(2)}% del conto` : " · percentuale non determinabile"}. Nessuna modifica automatica.</p>
      <p className="mt-1 text-muted-foreground">Capitale configurato: {fmt(conto.capitale)} · {conto.modalita === "conto" ? "modalità tutto il conto: il valore configurato non crea fondi" : "tetto di allocazione, non denaro disponibile"}.</p>
      <p className="mt-1 text-muted-foreground">Acquisti entro liquidità, potere d'acquisto e tetto residuo dopo posizioni e ordini pendenti. Dati non verificabili: nessun nuovo ordine.</p>
      <p className="mt-1 text-muted-foreground">Non sono ancora attivi limiti indipendenti per rischio per operazione, concentrazione per titolo/settore, numero di posizioni o drawdown.</p>
      {q.data.equity != null && q.data.equity > 0 && <p className="mt-1 text-muted-foreground">Proposta da confermare, non applicata: perdita giornaliera 1% ({fmt(Math.floor(q.data.equity * 0.01 * 100) / 100)}); esposizione 80%; concentrazione titolo 10%, settore 25%; massimo 10 posizioni. Su capitali piccoli il minimo d'ordine può rendere questi vincoli incompatibili.</p>}
      <p className="mt-2 text-warn">Gli stop sono controlli periodici, non garanzie: gap, slippage o interruzioni possono causare perdite superiori alle soglie e un prezzo di uscita diverso.</p>
    </div>}
  </div>;
}