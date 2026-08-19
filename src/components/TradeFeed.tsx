import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Operazione } from "@/lib/strategies";

export function TradeFeed({ operazioni }: { operazioni: Operazione[] }) {
  return (
    <ul className="divide-y divide-border">
      {operazioni.map((op) => {
        const positivo = op.pnl >= 0;
        return (
          <li key={op.id} className="flex items-start gap-3 py-3">
            <span
              className={cn(
                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                op.lato === "BUY"
                  ? "bg-bull/12 text-bull"
                  : "bg-bear/12 text-bear",
              )}
            >
              {op.lato === "BUY" ? (
                <ArrowUpRight className="size-4" />
              ) : (
                <ArrowDownRight className="size-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="numeric text-sm font-semibold">{op.ticker}</span>
                <span className="text-xs text-muted-foreground">
                  {op.lato === "BUY" ? "acquisto" : "vendita"} · {op.quantita} @{" "}
                  <span className="numeric">{op.prezzo.toFixed(2)}</span>
                </span>
                <span className="numeric ml-auto text-xs text-muted-foreground">{op.ora}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {op.motivazione}
              </p>
            </div>
            <span
              className={cn(
                "numeric shrink-0 text-sm font-semibold",
                positivo ? "text-bull" : "text-bear",
              )}
            >
              {positivo ? "+" : ""}
              {op.pnl.toFixed(2)} €
            </span>
          </li>
        );
      })}
    </ul>
  );
}
