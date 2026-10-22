import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessione } from "@/hooks/useSessione";
import { getEvaluationStrategie } from "@/lib/valutazione.functions";
import { FATTORI_INIZIALI, type riepilogaEsiti } from "@/lib/valutazione";

type Sintesi = ReturnType<typeof riepilogaEsiti> & { nome: string };
const n = (v: number | null, suffix = "") => v == null ? "—" : `${v.toFixed(2)}${suffix}`;

function TabellaEsiti({ rows }: { rows: Sintesi[] }) {
  return <div className="overflow-x-auto"><table className="mt-4 w-full min-w-[980px] text-xs">
    <thead className="border-b border-border text-muted-foreground"><tr>{["Gruppo", "Vendite", "Vincenti", "Guadagno medio $", "Perdita media $", "Rapporto G/P", "Profit factor", "P&L $", "Aspettativa netta $", "Campione"].map(h => <th key={h} className="px-2 py-3 text-left font-medium">{h}</th>)}</tr></thead>
    <tbody>{rows.map(r => <tr key={r.nome} className="border-b border-border/60 numeric"><td className="px-2 py-3 font-medium">{r.nome}</td><td className="px-2">{r.operazioni}</td><td className="px-2">{n(r.percentualeVincite, "%")}</td><td className="px-2">{n(r.guadagnoMedio)}</td><td className="px-2">{n(r.perditaMedia)}</td><td className="px-2">{n(r.rapporto)}</td><td className="px-2">{n(r.profitFactor)}</td><td className="px-2">{n(r.pnl)}</td><td className="px-2">{n(r.aspettativaNetta)}</td><td className="px-2">{r.qualita}</td></tr>)}</tbody>
  </table></div>;
}

export function ValutazioneStrategie({ reale }: { reale: boolean }) {
  const [giorni, setGiorni] = useState(30);
  const [vista, setVista] = useState<"strategia" | "titolo">("strategia");
  const { autenticato } = useSessione();
  const fn = useServerFn(getEvaluationStrategie);
  const q = useQuery({ queryKey: ["valutazione-strategie", reale, giorni], enabled: autenticato, queryFn: () => fn({ data: { reale, giorni } }), retry: false, refetchInterval: 60000 });
  const d = q.data;
  return <section className="border-y border-border py-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><FlaskConical className="size-5 text-primary" /> Valutazione delle strategie</h2><div className="flex gap-1 print:hidden" aria-label="Periodo di valutazione">{[7,30,90].map(g => <Button key={g} size="sm" variant={giorni === g ? "secondary" : "ghost"} aria-pressed={giorni === g} onClick={() => setGiorni(g)}>{g} giorni</Button>)}</div></div>
    <p className="mt-2 text-xs text-muted-foreground">{reale ? "REALE" : "PAPER"} · Alpaca · USD · {d ? `${d.dal} → ${d.al}` : "Dati del conto"}</p>
    {!autenticato ? <p className="mt-4 text-sm text-muted-foreground">Accedi per vedere i dati verificabili dei tuoi conti.</p> : q.isPending ? <p className="mt-4 text-sm text-muted-foreground">Lettura delle esecuzioni registrate…</p> : q.isError ? <p className="mt-4 text-sm text-destructive">Dati non disponibili. Nessun risultato stimato al loro posto.</p> : d ? <>
      <div className="mt-5 flex flex-wrap items-center gap-2"><ShieldCheck className="size-4 text-primary" /><p className="text-sm font-medium">{d.totale.operazioni} vendite verificate · {d.esclusi} vendite escluse o non riconciliate</p></div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Una vendita terminale conta una volta anche con più esecuzioni; vendite parziali concluse restano vendite distinte, non posizioni interamente chiuse. P&L da prezzi effettivi e costo medio, al lordo delle fee non allocate. Aspettativa netta non disponibile finché i costi per operazione non sono completi.</p>
      <div className="mt-4 flex gap-1 print:hidden"><Button size="sm" variant={vista === "strategia" ? "secondary" : "ghost"} aria-pressed={vista === "strategia"} onClick={() => setVista("strategia")}>Per strategia</Button><Button size="sm" variant={vista === "titolo" ? "secondary" : "ghost"} aria-pressed={vista === "titolo"} onClick={() => setVista("titolo")}>Per titolo</Button></div>
      <TabellaEsiti rows={[{ nome: "Totale", ...d.totale }, ...(vista === "strategia" ? d.perStrategia : d.perTitolo)]} />
      <p className="mt-3 text-xs text-muted-foreground">Settori e condizioni di mercato: classificazione storica affidabile non disponibile. Campione sufficiente per il conteggio non significa strategia profittevole; nessuna conclusione sui pochi trade o sui soli risultati PAPER.</p>
      <h3 className="mt-6 text-sm font-semibold">Rendimento e rischio per conto</h3>
      {!d.conti.length && <p className="mt-2 text-xs text-muted-foreground">Nessun conto Alpaca attivo.</p>}
      {d.conti.map((c,i) => <div key={c.conto} className="mt-3 border-l-2 border-border pl-4"><p className="text-sm font-medium">Conto {i+1} · {c.completo ? "Istantanea riconciliata" : "Non riconciliato o non aggiornato"}</p><p className="mt-1 text-xs text-muted-foreground">Ultima osservazione: {c.aggiornatoIl?.replace("T", " ").slice(0,19) ?? "—"} UTC</p><dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 text-xs sm:grid-cols-4">{[
        ["Capitale iniziale", n(c.metriche.capitaleIniziale, " $")], ["Capitale finale", n(c.metriche.capitaleFinale, " $")],
        ["Profitto corretto per flussi", n(c.metriche.pnlNetto, " $")], ["Rendimento TWR", n(c.metriche.rendimentoPct, "%")],
        ["Drawdown TWR", n(c.metriche.drawdownMassimoPct, "%")], ["Volatilità annua", n(c.metriche.volatilitaAnnuaPct, "%")],
        ["Depositi / prelievi", `${n(c.metriche.versamenti)} / ${n(c.metriche.prelievi)} $`], ["Fee già nell'equity", n(c.metriche.costiRegistrati, " $")],
      ].map(([k,v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="numeric mt-1 font-medium">{v}</dd></div>)}</dl><p className="mt-3 text-xs text-muted-foreground">Periodo effettivo: {c.metriche.dal ?? "—"} → {c.metriche.al ?? "—"}. Rendimento, profitto e rischio nascosti se dati o flussi incompleti. Posizioni aperte incluse nell'equity; fee non sottratte due volte. Tasse escluse.</p></div>)}
    </> : null}
    <div className="mt-7 border-t border-border pt-5"><h3 className="text-sm font-semibold">Primi confronti: un fattore alla volta</h3><div className="mt-3 grid gap-4 sm:grid-cols-2">{FATTORI_INIZIALI.map(f => <div key={f.id} className="border-l-2 border-primary pl-4"><p className="text-sm font-medium">{f.nome}</p><p className="numeric mt-1 text-xs">{f.regola}</p><p className="mt-2 text-xs text-muted-foreground">{f.dati}</p><p className="mt-2 text-xs font-medium">In attesa di dati storici verificabili · Non attivo</p></div>)}</div>
    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Non sono stati eseguiti confronti storici sui conti. Mancano osservazioni dei fattori al momento dell'ingresso, costi allocati e curve del portafoglio candidato. Le quotazioni attuali non ricostruiscono questi dati senza distorsioni. Confronto cronologico 70% / 30%, campione e profit factor secondo le verifiche esistenti; solo miglioramenti di aspettativa netta, profit factor e TWR senza peggiorare il drawdown possono proseguire alla revisione, mai all'attivazione automatica.</p>
    <p className="mt-3 text-xs text-muted-foreground">Forza del trend, volumi, volatilità come filtro, liquidità/spread, mercato, correlazioni ed eventi restano esclusi dal primo confronto. Servono serie datate, confrontabili e fonti affidabili; nessun indicatore o soglia di rischio aggiunto agli ordini.</p></div>
  </section>;
}