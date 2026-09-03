import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Loader2 } from "lucide-react";
import { getSegnali } from "@/lib/mercato.functions";
import type { SegnaleStrumento } from "@/lib/mercato.types";
import { useSessione } from "@/hooks/useSessione";
import { cn } from "@/lib/utils";

const n2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

function Sparkline({ serie, positiva }: { serie: number[]; positiva: boolean }) {
  if (serie.length < 2) return <div className="h-8 w-24 rounded bg-surface-2" />;
  const min = Math.min(...serie);
  const max = Math.max(...serie);
  const span = max - min || 1;
  const punti = serie
    .map((v, i) => `${(i / (serie.length - 1)) * 100},${30 - ((v - min) / span) * 28}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 30" className="h-8 w-24" preserveAspectRatio="none" aria-hidden>
      <polyline
        points={punti}
        fill="none"
        strokeWidth="1.6"
        className={positiva ? "stroke-bull" : "stroke-bear"}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const COLORE: Record<SegnaleStrumento["giudizio"], string> = {
  compra: "border-bull/40 bg-bull/10 text-bull",
  vendi: "border-bear/40 bg-bear/10 text-bear",
  attendi: "border-border text-muted-foreground",
};

export function PannelloSegnali({ reale, universo }: { reale: boolean; universo: string[] }) {
  const fn = useServerFn(getSegnali);
  const { autenticato } = useSessione();

  const { data, isFetching } = useQuery({
    queryKey: ["segnali", reale, universo.join(",")],
    enabled: autenticato && universo.length > 0,
    queryFn: () => fn({ data: { reale, tickers: universo.slice(0, 40) } }),
    refetchInterval: 60_000,
    retry: false,
  });

  const righe = data ?? [];

  return (
    <div className="panel p-6">
      <div className="flex items-center gap-2">
        <Activity className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Segnali e indicatori</h3>
        {isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        <span className="ml-auto text-[11px] text-muted-foreground">
          Medie 10/20 giorni · RSI 14 · volatilità
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Questi sono i dati che il motore legge prima di decidere: andamento recente,
        distanza dalla media, forza relativa e volatilità di ogni strumento selezionato.
      </p>

      {!autenticato && (
        <p className="mt-6 text-xs text-muted-foreground">
          Accedi e collega le chiavi del broker per vedere gli indicatori.
        </p>
      )}

      {autenticato && !universo.length && (
        <p className="mt-6 text-xs text-muted-foreground">
          Seleziona almeno uno strumento nell'universo investibile.
        </p>
      )}

      {righe.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 text-left">Strumento</th>
                <th className="py-2 text-left">Andamento</th>
                <th className="py-2 text-right">Prezzo</th>
                <th className="py-2 text-right">SMA 10</th>
                <th className="py-2 text-right">SMA 20</th>
                <th className="py-2 text-right">RSI</th>
                <th className="py-2 text-right">Volat.</th>
                <th className="py-2 text-right">Segnale</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((s) => (
                <tr key={s.ticker} className="border-b border-border/60">
                  <td className="numeric py-2.5 font-semibold">{s.ticker}</td>
                  <td className="py-1.5">
                    <Sparkline serie={s.serie} positiva={s.scostamentoPct >= 0} />
                  </td>
                  <td className="numeric py-2.5 text-right">{n2(s.prezzo)}</td>
                  <td className="numeric py-2.5 text-right text-muted-foreground">{n2(s.sma10)}</td>
                  <td className="numeric py-2.5 text-right text-muted-foreground">{n2(s.sma20)}</td>
                  <td
                    className={cn(
                      "numeric py-2.5 text-right",
                      s.rsi14 < 35 ? "text-bull" : s.rsi14 > 70 ? "text-bear" : "",
                    )}
                  >
                    {n2(s.rsi14)}
                  </td>
                  <td className="numeric py-2.5 text-right text-muted-foreground">
                    {n2(s.volatilitaPct)}%
                  </td>
                  <td className="py-2.5 text-right">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
                        COLORE[s.giudizio],
                      )}
                    >
                      {s.giudizio}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
