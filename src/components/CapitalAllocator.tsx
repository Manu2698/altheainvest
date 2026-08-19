import { Wallet } from "lucide-react";
import { STRATEGIE, formatEuro, type StrategyId } from "@/lib/strategies";
import { cn } from "@/lib/utils";

export interface Allocazioni {
  conservativo: number;
  medio: number;
  aggressivo: number;
}

const COLORI: Record<StrategyId, string> = {
  conservativo: "bg-bull",
  medio: "bg-chart-2",
  aggressivo: "bg-warn",
};

export function CapitalAllocator({
  capitale,
  setCapitale,
  allocazioni,
  setAllocazioni,
  attiva,
  onAttiva,
}: {
  capitale: number;
  setCapitale: (n: number) => void;
  allocazioni: Allocazioni;
  setAllocazioni: (a: Allocazioni) => void;
  attiva: StrategyId;
  onAttiva: (id: StrategyId) => void;
}) {
  const totale = allocazioni.conservativo + allocazioni.medio + allocazioni.aggressivo;
  const liquidita = Math.max(0, 100 - totale);
  const eccesso = totale > 100;

  const aggiorna = (id: StrategyId, valore: number) => {
    const prossime = { ...allocazioni, [id]: valore };
    const altri = (Object.keys(prossime) as StrategyId[])
      .filter((k) => k !== id)
      .reduce((s, k) => s + prossime[k], 0);
    // Il totale non può superare il 100%: comprimo il resto proporzionalmente.
    if (valore + altri > 100) {
      const spazio = 100 - valore;
      (Object.keys(prossime) as StrategyId[])
        .filter((k) => k !== id)
        .forEach((k) => {
          prossime[k] = altri === 0 ? 0 : Math.round((prossime[k] / altri) * spazio);
        });
    }
    setAllocazioni(prossime);
  };

  return (
    <div className="panel p-6">
      <div className="flex items-center gap-2">
        <Wallet className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Capitale affidato all'IA</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Decidi quanto può muovere in totale e come dividerlo tra le tre correnti di
        pensiero. Quello che resta non viene mai investito.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <label className="flex-1 min-w-[220px]">
          <span className="text-[11px] tracking-wide text-muted-foreground">
            Capitale totale
          </span>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
            <span className="text-muted-foreground">€</span>
            <input
              type="number"
              min={500}
              step={500}
              value={capitale}
              onChange={(e) => setCapitale(Math.max(500, Number(e.target.value) || 500))}
              className="numeric w-full bg-transparent text-lg font-semibold outline-none"
            />
          </div>
        </label>
        <div className="flex gap-2">
          {[5000, 25000, 100000].map((v) => (
            <button
              key={v}
              onClick={() => setCapitale(v)}
              className={cn(
                "numeric rounded-lg border border-border px-3 py-2 text-xs transition-colors",
                capitale === v
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "bg-surface hover:bg-surface-2",
              )}
            >
              {formatEuro(v)}
            </button>
          ))}
        </div>
      </div>

      {/* Barra di ripartizione */}
      <div className="mt-6 flex h-2.5 overflow-hidden rounded-full bg-muted">
        {STRATEGIE.map((s) => (
          <span
            key={s.id}
            className={cn("h-full transition-all", COLORI[s.id])}
            style={{ width: `${Math.min(100, allocazioni[s.id])}%` }}
          />
        ))}
      </div>

      <div className="mt-5 space-y-5">
        {STRATEGIE.map((s) => (
          <div key={s.id}>
            <div className="flex items-center justify-between text-xs">
              <button
                onClick={() => onAttiva(s.id)}
                className={cn(
                  "flex items-center gap-2 font-medium transition-colors",
                  attiva === s.id ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span className={cn("size-2 rounded-full", COLORI[s.id])} />
                {s.nome}
              </button>
              <span className="numeric text-muted-foreground">
                {allocazioni[s.id]}% ·{" "}
                <span className="text-foreground">
                  {formatEuro((capitale * allocazioni[s.id]) / 100)}
                </span>
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={allocazioni[s.id]}
              onChange={(e) => aggiorna(s.id, Number(e.target.value))}
              aria-label={`Percentuale su profilo ${s.nome}`}
              className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs">
        <span className="text-muted-foreground">Liquidità non investita</span>
        <span className={cn("numeric font-semibold", eccesso ? "text-bear" : "text-foreground")}>
          {liquidita}% · {formatEuro((capitale * liquidita) / 100)}
        </span>
      </div>
    </div>
  );
}
