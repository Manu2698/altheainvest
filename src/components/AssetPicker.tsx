import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { cercaAsset, type AssetTipo } from "@/lib/alpaca.functions";
import { cn } from "@/lib/utils";

const FILTRI: { id: AssetTipo | "tutti" | "meme"; label: string }[] = [
  { id: "tutti", label: "Tutti" },
  { id: "azione", label: "Azioni" },
  { id: "etf", label: "ETF" },
  { id: "cripto", label: "Cripto" },
  { id: "meme", label: "Memecoin" },
];

const MEME = ["DOGE", "SHIB", "PEPE", "BONK", "WIF", "FLOKI", "TRUMP", "MEME"];

export function AssetPicker({
  universo,
  onChange,
}: {
  universo: string[];
  onChange: (u: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filtro, setFiltro] = useState<(typeof FILTRI)[number]["id"]>("tutti");
  const cerca = useServerFn(cercaAsset);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const tipo: AssetTipo | "tutti" = filtro === "meme" ? "cripto" : filtro;

  const { data, isFetching } = useQuery({
    queryKey: ["asset", debounced, tipo],
    queryFn: () => cerca({ data: { q: debounced, tipo } }),
    staleTime: 5 * 60 * 1000,
  });

  const risultati = useMemo(() => {
    const base = data?.risultati ?? [];
    if (filtro !== "meme") return base;
    return base.filter((a) => MEME.some((m) => a.ticker.startsWith(m)));
  }, [data, filtro]);

  const attivo = (t: string) => universo.includes(t);
  const toggle = (t: string) =>
    onChange(attivo(t) ? universo.filter((x) => x !== t) : [...universo, t]);

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Universo investibile</h3>
          <p className="text-[11px] text-muted-foreground">
            Cerca fra tutte le azioni, gli ETF e le cripto/memecoin disponibili sul
            broker e scegli su cosa l'IA può operare.
          </p>
        </div>
        <span className="numeric rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] text-muted-foreground">
          {data?.totale ? `${data.totale.toLocaleString("it-IT")} strumenti` : "—"}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca ticker o nome: NVDA, Vanguard, DOGE…"
          className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        {isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {q && !isFetching && (
          <button onClick={() => setQ("")} aria-label="Pulisci ricerca">
            <X className="size-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {FILTRI.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] transition-colors",
              filtro === f.id
                ? "border-primary bg-primary/12 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 max-h-72 space-y-1 overflow-y-auto pr-1">
        {risultati.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {isFetching ? "Cerco…" : "Nessuno strumento trovato."}
          </p>
        )}
        {risultati.map((a) => (
          <button
            key={a.ticker}
            onClick={() => toggle(a.ticker)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
              attivo(a.ticker)
                ? "border-primary/50 bg-primary/8"
                : "border-transparent hover:bg-surface-2",
            )}
          >
            <span className="numeric w-24 shrink-0 text-xs font-semibold">{a.ticker}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {a.nome}
            </span>
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {a.tipo}
            </span>
            {attivo(a.ticker) ? (
              <Check className="size-4 shrink-0 text-primary" />
            ) : (
              <Plus className="size-4 shrink-0 text-muted-foreground" />
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Selezionati <span className="numeric text-foreground">{universo.length}</span>
          </p>
          {universo.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="text-[11px] text-muted-foreground hover:text-bear"
            >
              Svuota
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {universo.map((t) => (
            <button
              key={t}
              onClick={() => toggle(t)}
              className="numeric inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs hover:border-bear/60"
            >
              {t} <X className="size-3 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
