import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { getStatisticheStrategie } from "@/lib/report.functions";
import { useSessione } from "@/hooks/useSessione";
import { STRATEGIE } from "@/lib/strategies";

const COLORI = {
  conservativo: "var(--color-chart-2, hsl(160 60% 45%))",
  medio: "var(--color-primary)",
  aggressivo: "var(--color-bear, hsl(0 70% 55%))",
};

export function useStatistiche(reale: boolean) {
  const fn = useServerFn(getStatisticheStrategie);
  const { autenticato } = useSessione();
  return useQuery({
    queryKey: ["statistiche-strategie", reale],
    enabled: autenticato,
    queryFn: () => fn({ data: { reale } }),
    refetchInterval: 60_000,
    retry: false,
  });
}

export function StatisticheStrategie({ reale }: { reale: boolean }) {
  const { autenticato } = useSessione();
  const q = useStatistiche(reale);
  const dati = q.data;

  return (
    <div className="panel p-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Risultati per strategia</h3>
        <span className="numeric ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">
          conto {reale ? "reale" : "paper"}
        </span>
      </div>

      {!autenticato ? (
        <p className="mt-3 text-xs text-muted-foreground">Accedi per vedere le statistiche.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {STRATEGIE.map((s) => {
              const r = dati?.riepilogo.find((x) => x.strategia === s.id);
              return (
                <div key={s.id} className="rounded-lg border border-border bg-surface-2 p-3">
                  <p className="text-xs font-medium">{s.nome}</p>
                  <p className="numeric mt-1 text-2xl font-semibold">{r?.ordini ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">ordini inviati</p>
                  <div className="numeric mt-2 flex gap-3 text-[11px]">
                    <span className="text-bull">{r?.vincite ?? 0} vincite</span>
                    <span className="text-bear">{r?.perdite ?? 0} perdite</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 h-[220px] w-full">
            <ResponsiveContainer>
              <BarChart data={dati?.settimane ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="settimana" tickFormatter={(v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`} tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
                <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="conservativo" stackId="a" fill={COLORI.conservativo} />
                <Bar dataKey="medio" stackId="a" fill={COLORI.medio} />
                <Bar dataKey="aggressivo" stackId="a" fill={COLORI.aggressivo} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Ordini settimanali inviati dall'IA (ultime 8 settimane). Vincite e perdite contano le
            posizioni chiuse in utile o in perdita.
          </p>
        </>
      )}
    </div>
  );
}
