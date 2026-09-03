import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { getOrdiniBroker } from "@/lib/alpaca.functions";
import { useSessione } from "@/hooks/useSessione";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ordini")({
  head: () => ({
    meta: [
      { title: "Ordini reali del conto — Althea" },
      {
        name: "description",
        content:
          "Elenco in tempo reale degli ordini inviati al conto Alpaca: data, orario, stato, quantità e prezzo medio di esecuzione.",
      },
      { property: "og:title", content: "Ordini reali del conto — Althea" },
      {
        property: "og:description",
        content:
          "Tutti gli ordini inviati dal motore IA e dagli ordini pianificati, con stato aggiornato in tempo reale.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PaginaOrdini,
  errorComponent: ({ error }) => (
    <div role="alert" className="mx-auto max-w-3xl p-8 text-sm text-bear">
      {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl p-8 text-sm text-muted-foreground">
      Nessun ordine disponibile.
    </div>
  ),
});

const STATI_BUONI = ["filled", "partially_filled"];

const dataOra = (iso: string) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—";
const ora = (iso: string) => (iso ? iso.slice(11, 19) : "—");

function PaginaOrdini() {
  const [reale, setReale] = useState(false);
  const { autenticato } = useSessione();
  const fn = useServerFn(getOrdiniBroker);

  const ordini = useQuery({
    queryKey: ["ordini-broker", reale],
    enabled: autenticato,
    queryFn: () => fn({ data: { reale } }),
    refetchInterval: 15_000,
    retry: false,
  });

  const righe = ordini.data ?? [];
  const linkBroker = reale ? "https://app.alpaca.markets/brokerage/orders" : "https://app.alpaca.markets/paper/dashboard/orders";

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Torna alla dashboard
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Ordini reali del conto</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ogni ordine inviato ad Alpaca con data, orario e stato — aggiornato ogni 15
            secondi, anche dopo l'apertura del mercato.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface p-1">
            {[
              { v: false, label: "Paper" },
              { v: true, label: "Reale" },
            ].map((m) => (
              <button
                key={m.label}
                onClick={() => setReale(m.v)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                  reale === m.v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <a
            href={linkBroker}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Apri su Alpaca <ExternalLink className="size-3.5" />
          </a>
          <button
            onClick={() => void ordini.refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {ordini.isFetching ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Aggiorna
          </button>
        </div>
      </div>

      {!autenticato && (
        <p className="mt-8 text-sm text-muted-foreground">
          Accedi al tuo account e collega le chiavi Alpaca per vedere gli ordini.
        </p>
      )}

      {autenticato && (
        <div className="panel mt-6 overflow-x-auto p-5">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 text-left">Data</th>
                <th className="py-2 text-left">Orario</th>
                <th className="py-2 text-left">Strumento</th>
                <th className="py-2 text-left">Lato</th>
                <th className="py-2 text-right">Quantità</th>
                <th className="py-2 text-right">Importo</th>
                <th className="py-2 text-right">Prezzo medio</th>
                <th className="py-2 text-right">Stato</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((o) => (
                <tr key={o.id} className="border-b border-border/60">
                  <td className="numeric py-2.5">{dataOra(o.creatoIl)}</td>
                  <td className="numeric py-2.5 text-muted-foreground">{ora(o.creatoIl)}</td>
                  <td className="numeric py-2.5 font-semibold">{o.ticker}</td>
                  <td className={cn("py-2.5", o.lato === "buy" ? "text-bull" : "text-bear")}>
                    {o.lato === "buy" ? "Acquisto" : "Vendita"}
                  </td>
                  <td className="numeric py-2.5 text-right">{o.quantita || "—"}</td>
                  <td className="numeric py-2.5 text-right">
                    {o.importo != null ? `${o.importo.toFixed(2)} $` : "—"}
                  </td>
                  <td className="numeric py-2.5 text-right">
                    {o.prezzoMedio != null ? o.prezzoMedio.toFixed(2) : "—"}
                  </td>
                  <td className="py-2.5 text-right">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
                        STATI_BUONI.includes(o.stato)
                          ? "border-bull/40 bg-bull/10 text-bull"
                          : o.stato === "canceled" || o.stato === "rejected"
                            ? "border-bear/40 bg-bear/10 text-bear"
                            : "border-border text-muted-foreground",
                      )}
                    >
                      {o.stato}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {righe.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {ordini.isFetching ? "Carico gli ordini…" : "Nessun ordine registrato sul conto."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
