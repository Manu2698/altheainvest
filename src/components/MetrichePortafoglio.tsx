import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMetrichePortafoglio } from "@/lib/metriche.functions";
import type { MetricheOperazioni, Qualita } from "@/lib/metriche";
import { useSessione } from "@/hooks/useSessione";
import { cn } from "@/lib/utils";

const fmt$ = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "" : "−"}${Math.abs(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`);
const fmtPct = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);
const tono = (n: number | null) => (n == null ? "" : n >= 0 ? "text-bull" : "text-bear");
const QUALITA: Record<Qualita, string> = {
  insufficiente: "dati insufficienti",
  limitata: "campione limitato",
  sufficiente: "campione sufficiente",
};

function Voce({ k, v, c, nota }: { k: string; v: string; c?: string; nota?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] text-muted-foreground">{k}</p>
      <p className={cn("numeric mt-1 text-lg font-semibold", c)}>{v}</p>
      {nota && <p className="mt-0.5 text-[10px] text-muted-foreground">{nota}</p>}
    </div>
  );
}

function RigaOperazioni({ nome, m }: { nome: string; m: MetricheOperazioni }) {
  const affidabile = m.qualita === "sufficiente";
  return (
    <tr className="border-t border-border">
      <td className="py-2 capitalize">{nome}</td>
      <td className="numeric">{m.operazioni}</td>
      <td className={cn("numeric", tono(m.pnlRealizzato))}>{fmt$(m.pnlRealizzato)}</td>
      <td className="numeric">{m.profitFactor ?? "—"}</td>
      <td className="numeric">{m.rapportoVinciPerdi ?? "—"}</td>
      <td className="numeric">{m.percentualeVincite == null ? "—" : `${m.percentualeVincite}%`}</td>
      <td className={cn("text-[11px]", affidabile ? "text-bull" : "text-muted-foreground")}>{QUALITA[m.qualita]}</td>
    </tr>
  );
}

export function MetrichePortafoglio({ reale }: { reale: boolean }) {
  const [giorni, setGiorni] = useState(30);
  const { autenticato } = useSessione();
  const fn = useServerFn(getMetrichePortafoglio);
  const q = useQuery({
    queryKey: ["metriche-portafoglio", reale, giorni],
    enabled: autenticato,
    queryFn: () => fn({ data: { reale, giorni } }),
    refetchInterval: 120_000,
    retry: false,
  });
  const r = q.data;
  const m = r?.metriche;

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Rendimento netto del portafoglio</h3>
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", reale ? "border-bear text-bear" : "border-border text-muted-foreground")}>
          {reale ? "Reale" : "Paper · simulato dal broker"}
        </span>
        <span className="text-[10px] text-muted-foreground">Dati effettivi del conto Alpaca · nessun backtest</span>
        <div className="ml-auto flex gap-1">
          {[7, 30, 90].map((g) => (
            <button key={g} onClick={() => setGiorni(g)} className={cn("rounded-full px-2.5 py-1 text-[11px]", g === giorni ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground")}>
              {g} giorni
            </button>
          ))}
        </div>
      </div>

      {!autenticato ? (
        <p className="mt-3 text-xs text-muted-foreground">Accedi per vedere le metriche del tuo conto.</p>
      ) : q.isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Calcolo in corso…</p>
      ) : !r?.collegato || !m ? (
        <p className="mt-3 text-xs text-muted-foreground">Conto Alpaca {reale ? "reale" : "paper"} non collegato.</p>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Periodo: {m.dal ?? "—"} → {m.al ?? "—"} ({m.giorniConDati} giorni con dati) · aggiornato {new Date(r.aggiornatoIl).toLocaleString("it-IT")}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Voce k="Rendimento netto %" v={fmtPct(m.rendimentoPct)} c={tono(m.rendimentoPct)} nota="ponderato nel tempo, al netto di versamenti/prelievi" />
            <Voce k="Profitto/perdita netta" v={fmt$(m.pnlNetto)} c={tono(m.pnlNetto)} nota="finale − iniziale − versamenti + prelievi" />
            <Voce k="Capitale iniziale" v={fmt$(m.capitaleIniziale)} />
            <Voce k="Capitale finale" v={fmt$(m.capitaleFinale)} nota={`versati ${fmt$(m.versamenti)} · prelevati ${fmt$(m.prelievi)}`} />
            <Voce k="Drawdown massimo" v={fmtPct(m.drawdownMassimoPct)} c={m.drawdownMassimoPct ? "text-bear" : ""} />
            <Voce k="Volatilità annua" v={m.volatilitaAnnuaPct == null ? "dati insufficienti" : `${m.volatilitaAnnuaPct.toFixed(2)}%`} />
            <Voce k="Benchmark" v={fmtPct(m.benchmarkPct)} nota={r.benchmark} />
            <Voce k="Differenza vs benchmark" v={fmtPct(m.differenzaBenchmarkPct)} c={tono(m.differenzaBenchmarkPct)} nota="punti percentuali" />
          </div>

          <div className="mt-3 grid gap-2 text-[11px] text-muted-foreground md:grid-cols-2">
            <div>
              <p className="font-medium text-foreground">Costi inclusi</p>
              <ul className="list-disc pl-4">{r.costiInclusi.map((c) => <li key={c}>{c}{c.startsWith("Commissioni") ? ` — ${fmt$(m.costiRegistrati)} nel periodo` : ""}</li>)}</ul>
            </div>
            <div>
              <p className="font-medium text-foreground">Costi mancanti</p>
              <ul className="list-disc pl-4">{r.costiMancanti.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          </div>

          <h4 className="mt-4 text-xs font-semibold">Qualità delle operazioni chiuse (per profilo)</h4>
          <div className="overflow-x-auto">
            <table className="mt-1 w-full text-left text-xs">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr><th className="py-1">Profilo</th><th>Chiuse</th><th>P&L realizzato</th><th>Profit factor</th><th>Guad./perd. medi</th><th>% vincenti</th><th>Affidabilità</th></tr>
              </thead>
              <tbody>
                <RigaOperazioni nome="Totale" m={m.operazioni} />
                {Object.entries(m.perStrategia).map(([s, x]) => <RigaOperazioni key={s} nome={s} m={x} />)}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Rendimento e drawdown riguardano l'intero conto (i profili lo condividono). La % di vincite è secondaria: si può vincere spesso e perdere denaro.
          </p>
          {m.avvisi.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-lg border border-border p-3 text-[11px] text-muted-foreground">
              {m.avvisi.map((a) => <li key={a}>⚠ {a}</li>)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
