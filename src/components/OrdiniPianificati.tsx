import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Loader2, Trash2 } from "lucide-react";
import {
  annullaOrdinePianificato,
  creaOrdinePianificato,
  eseguiOrdiniScaduti,
  listaOrdiniPianificati,
} from "@/lib/mercato.functions";
import { useSessione } from "@/hooks/useSessione";
import { cn } from "@/lib/utils";

const dataOra = (iso: string) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}` : "—";

const STATI: Record<string, string> = {
  in_attesa: "border-border text-muted-foreground",
  inviato: "border-bull/40 bg-bull/10 text-bull",
  errore: "border-bear/40 bg-bear/10 text-bear",
  annullato: "border-border text-muted-foreground line-through",
};

export function OrdiniPianificati({ reale, universo }: { reale: boolean; universo: string[] }) {
  const { autenticato } = useSessione();
  const qc = useQueryClient();
  const lista = useServerFn(listaOrdiniPianificati);
  const crea = useServerFn(creaOrdinePianificato);
  const annulla = useServerFn(annullaOrdinePianificato);
  const scaduti = useServerFn(eseguiOrdiniScaduti);

  const [ticker, setTicker] = useState(universo[0] ?? "AAPL");
  const [lato, setLato] = useState<"buy" | "sell">("buy");
  const [importo, setImporto] = useState(50);
  const [quando, setQuando] = useState("");
  const [messaggio, setMessaggio] = useState<string | null>(null);

  const ordini = useQuery({
    queryKey: ["ordini-pianificati"],
    enabled: autenticato,
    queryFn: () => lista({}),
    refetchInterval: 30_000,
    retry: false,
  });

  const invia = useMutation({
    mutationFn: () =>
      crea({ data: { ticker, lato, importo, reale, eseguiIl: new Date(quando).toISOString() } }),
    onSuccess: (r) => {
      setMessaggio(r.messaggio);
      void qc.invalidateQueries({ queryKey: ["ordini-pianificati"] });
    },
    onError: (e) => setMessaggio(e instanceof Error ? e.message : "Errore imprevisto."),
  });

  const rimuovi = useMutation({
    mutationFn: (id: string) => annulla({ data: { id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ordini-pianificati"] }),
  });

  // Ogni minuto invia al broker gli ordini pianificati la cui ora è arrivata.
  const eseguiScaduti = scaduti;
  useEffect(() => {
    if (!autenticato) return;
    const tick = () => {
      void eseguiScaduti({}).then((r) => {
        if (r.inviati || r.falliti) {
          void qc.invalidateQueries({ queryKey: ["ordini-pianificati"] });
          void qc.invalidateQueries({ queryKey: ["ordini-broker"] });
        }
      });
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [autenticato, eseguiScaduti, qc]);

  return (
    <div className="panel p-6">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Ordini pianificati</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">
          conto {reale ? "reale" : "paper"}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Programma un ordine con data, orario e importo: all'ora indicata viene inviato ad
        Alpaca come ordine reale a mercato.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="lg:col-span-1">
          <span className="text-[11px] text-muted-foreground">Strumento</span>
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            list="universo-pianificati"
            className="numeric mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none"
          />
          <datalist id="universo-pianificati">
            {universo.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label>
          <span className="text-[11px] text-muted-foreground">Direzione</span>
          <select
            value={lato}
            onChange={(e) => setLato(e.target.value === "sell" ? "sell" : "buy")}
            className="mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none"
          >
            <option value="buy">Acquisto</option>
            <option value="sell">Vendita</option>
          </select>
        </label>
        <label>
          <span className="text-[11px] text-muted-foreground">Importo (€)</span>
          <input
            type="number"
            min={1}
            step={1}
            value={importo}
            onChange={(e) => setImporto(Math.max(1, Number(e.target.value) || 1))}
            className="numeric mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none"
          />
        </label>
        <label>
          <span className="text-[11px] text-muted-foreground">Data e ora</span>
          <input
            type="datetime-local"
            value={quando}
            onChange={(e) => setQuando(e.target.value)}
            className="numeric mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none"
          />
        </label>
        <button
          onClick={() => {
            setMessaggio(null);
            invia.mutate();
          }}
          disabled={!autenticato || !quando || invia.isPending}
          className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {invia.isPending && <Loader2 className="size-3 animate-spin" />}
          Pianifica ordine
        </button>
      </div>

      {messaggio && <p className="mt-3 text-xs text-muted-foreground">{messaggio}</p>}
      {!autenticato && (
        <p className="mt-3 text-xs text-muted-foreground">
          Accedi e collega le chiavi del broker per pianificare ordini.
        </p>
      )}

      <div className="mt-5 space-y-1.5">
        {(ordini.data ?? []).length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Nessun ordine pianificato.
          </p>
        )}
        {(ordini.data ?? []).map((o) => (
          <div
            key={o.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-surface-2 px-3 py-2 text-xs"
          >
            <span className="numeric w-20 font-semibold">{o.ticker}</span>
            <span className={o.lato === "buy" ? "text-bull" : "text-bear"}>
              {o.lato === "buy" ? "Acquisto" : "Vendita"}
            </span>
            <span className="numeric">{o.importo.toFixed(2)} €</span>
            <span className="numeric text-muted-foreground">{dataOra(o.eseguiIl)}</span>
            <span className="text-[10px] uppercase text-muted-foreground">
              {o.reale ? "reale" : "paper"}
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
                STATI[o.stato] ?? "border-border text-muted-foreground",
              )}
            >
              {o.stato.replace("_", " ")}
            </span>
            {o.errore && <span className="text-bear">{o.errore}</span>}
            {o.stato === "in_attesa" && (
              <button
                onClick={() => rimuovi.mutate(o.id)}
                aria-label={`Annulla ordine ${o.ticker}`}
                className="ml-auto text-muted-foreground hover:text-bear"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
