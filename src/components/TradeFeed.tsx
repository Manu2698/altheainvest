import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DecisioneLog } from "@/lib/alpaca.functions";

export function TradeFeed({ decisioni }: { decisioni: DecisioneLog[] }) {
  if (decisioni.length === 0) {
    return (
      <p className="py-6 text-xs text-muted-foreground">
        Nessuna decisione dell'IA registrata su questo conto per ora.
      </p>
    );
  }
  return (
    <ul className="max-h-[320px] divide-y divide-border overflow-y-auto">
      {decisioni.map((op) => {
        const buy = op.lato === "buy";
        const positivo = (op.pnlPct ?? 0) >= 0;
        return (
          <li key={op.id} className="flex items-start gap-3 py-3">
            <span
              className={cn(
                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                buy ? "bg-bull/12 text-bull" : "bg-bear/12 text-bear",
              )}
            >
              {buy ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="numeric text-sm font-semibold">{op.ticker}</span>
                <span className="text-xs text-muted-foreground">
                  {buy ? "acquisto" : "vendita"} · <span className="numeric">{op.importo.toFixed(2)} $</span> · {op.strategia}
                </span>
                <span className="numeric ml-auto text-xs text-muted-foreground">
                  {op.createdAt.slice(5, 16).replace("T", " ")}
                </span>
              </div>
              {op.motivo && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{op.motivo}</p>
              )}
            </div>
            {op.pnlPct != null && (
              <span
                className={cn("numeric shrink-0 text-sm font-semibold", positivo ? "text-bull" : "text-bear")}
              >
                {positivo ? "+" : ""}
                {op.pnlPct.toFixed(1)}%
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
