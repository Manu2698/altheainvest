import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Calculator, Loader2 } from "lucide-react";
import { simulaPortafoglio } from "@/lib/report.functions";
import { useSessione } from "@/hooks/useSessione";
import { cn } from "@/lib/utils";

const usd = (n: number) => `${n < 0 ? "-" : ""}${Math.abs(n).toFixed(2)} $`;

export function Simulatore({ reale }: { reale: boolean }) {
  const { autenticato } = useSessione();
  const fn = useServerFn(simulaPortafoglio);
  const [costoPct, setCosto] = useState(0.1);
  const [dividendoPct, setDiv] = useState(1.5);
  const [giorni, setGiorni] = useState(60);
  const sim = useMutation({
    mutationFn: () => fn({ data: { reale, costoPct, dividendoPct, giorni } }),
  });
  const r = sim.data;

  const campo = (label: string, val: number, set: (n: number) => void, step: number) => (
    <label className="text-[11px] text-muted-foreground">
      {label}
      <input
        type="number"
        step={step}
        value={val}
        onChange={(e) => set(Number(e.target.value))}
        className="numeric mt-1 block w-28 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs text-foreground"
      />
    </label>
  );

  return (
    <div className="panel p-6">
      <div className="flex items-center gap-2">
        <Calculator className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Simulatore di rendimento</h3>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Calcola cosa avresti ottenuto tenendo le tue posizioni reali dall'inizio del periodo
        (buy &amp; hold), con commissioni di acquisto/vendita e dividendi, e lo confronta con
        l'andamento reale del conto. Risultati ipotetici, non garantiti.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        {campo("Costo transazione %", costoPct, setCosto, 0.05)}
        {campo("Dividendi annui %", dividendoPct, setDiv, 0.1)}
        {campo("Giorni di borsa", giorni, setGiorni, 5)}
        <button
          onClick={() => sim.mutate()}
          disabled={!autenticato || sim.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {sim.isPending && <Loader2 className="size-3 animate-spin" />}
          Simula
        </button>
      </div>

      {!autenticato && <p className="mt-3 text-xs text-muted-foreground">Accedi per usare il simulatore.</p>}
      {r && !r.ok && <p className="mt-3 text-xs text-bear">{r.messaggio}</p>}

      {r?.ok && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {[
              { l: "Investito", v: r.totale.costo, plain: true },
              { l: "Rendimento reale", v: r.totale.pnlReale },
              { l: "Rendimento ipotetico", v: r.totale.pnlIpotetico },
              { l: "Dividendi / costi", txt: `${usd(r.totale.dividendi)} / ${usd(r.totale.costi)}` },
            ].map((k) => (
              <div key={k.l} className="rounded-lg border border-border bg-surface-2 p-3">
                <p className="text-[10px] text-muted-foreground">{k.l}</p>
                <p
                  className={cn(
                    "numeric mt-1 text-sm font-semibold",
                    !k.plain && k.v !== undefined && (k.v >= 0 ? "text-bull" : "text-bear"),
                  )}
                >
                  {k.txt ?? usd(k.v ?? 0)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 h-[220px] w-full">
            <ResponsiveContainer>
              <AreaChart data={r.serie}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="data" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
                <YAxis tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", fontSize: 11 }} />
                <Area dataKey="ipotetico" name="Ipotetico" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.15} />
                <Line dataKey="investito" name="Investito" stroke="var(--color-muted-foreground)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <table className="mt-4 w-full text-[11px]">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-1.5 text-left">Strumento</th>
                <th className="text-right">Investito</th>
                <th className="text-right">Reale</th>
                <th className="text-right">Ipotetico</th>
                <th className="text-right">Differenza</th>
              </tr>
            </thead>
            <tbody>
              {r.posizioni.map((p) => (
                <tr key={p.ticker} className="numeric border-b border-border/60">
                  <td className="py-1.5 font-semibold">{p.ticker}</td>
                  <td className="text-right">{usd(p.costo)}</td>
                  <td className={cn("text-right", p.pnlReale >= 0 ? "text-bull" : "text-bear")}>{usd(p.pnlReale)}</td>
                  <td className={cn("text-right", p.pnlIpotetico >= 0 ? "text-bull" : "text-bear")}>{usd(p.pnlIpotetico)}</td>
                  <td className="text-right">{usd(p.pnlReale - p.pnlIpotetico)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
