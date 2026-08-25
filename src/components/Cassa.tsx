import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  Loader2,
  Lock,
} from "lucide-react";
import { creaMovimento, listaMovimenti } from "@/lib/alpaca.functions";
import { useSessione } from "@/hooks/useSessione";
import { cn } from "@/lib/utils";

const METODI = [
  { id: "bonifico", label: "Bonifico SEPA" },
  { id: "carta", label: "Carta" },
  { id: "cripto", label: "Stablecoin" },
];

const fmt = (v: number, valuta: string) =>
  `${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ${valuta || "USD"}`;

export function Cassa({ reale }: { reale: boolean }) {
  const invia = useServerFn(creaMovimento);
  const lista = useServerFn(listaMovimenti);
  const qc = useQueryClient();
  const { autenticato, caricata } = useSessione();

  const [tipo, setTipo] = useState<"deposito" | "prelievo">("deposito");
  const [importo, setImporto] = useState("1000");
  const [metodo, setMetodo] = useState("bonifico");
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);

  const { data: movimenti } = useQuery({
    queryKey: ["movimenti"],
    enabled: autenticato,
    queryFn: () => lista({}),
    retry: false,
  });

  const mut = useMutation({
    mutationFn: () =>
      invia({ data: { tipo, importo: Number(importo.replace(",", ".")), metodo, reale } }),
    onSuccess: (r) => {
      setEsito({ ok: r.ok, testo: r.messaggio });
      if (r.ok) {
        void qc.invalidateQueries({ queryKey: ["movimenti"] });
        void qc.invalidateQueries({ queryKey: ["conto-broker"] });
      }
    },
    onError: (e) =>
      setEsito({ ok: false, testo: e instanceof Error ? e.message : "Errore imprevisto." }),
  });

  if (caricata && !autenticato) {
    return (
      <div className="panel p-6">
        <div className="flex items-center gap-2">
          <Lock className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Deposita e preleva</h3>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Accedi per caricare capitale sul conto o richiedere un prelievo.
        </p>
        <Link
          to="/auth"
          className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
        >
          Accedi o registrati
        </Link>
      </div>
    );
  }

  return (
    <div className="panel p-6">
      <div className="flex items-center gap-2">
        <Banknote className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Deposita e preleva</h3>
        <span className="numeric ml-auto rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          conto {reale ? "reale" : "paper"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {reale
          ? "Le richieste sul conto reale vengono inoltrate al broker ed elaborate in 1-3 giorni lavorativi."
          : "Sul conto paper i movimenti sono virtuali e immediati: servono a impostare il capitale dell'IA."}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {(
          [
            { id: "deposito", label: "Deposita", icona: ArrowDownToLine },
            { id: "prelievo", label: "Preleva", icona: ArrowUpFromLine },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTipo(t.id)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-medium transition-colors",
              tipo === t.id
                ? "border-primary bg-primary/12 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icona className="size-3.5" /> {t.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setEsito(null);
          mut.mutate();
        }}
        className="mt-3 space-y-3"
      >
        <div>
          <label className="text-[11px] text-muted-foreground">Importo (USD)</label>
          <input
            value={importo}
            onChange={(e) => setImporto(e.target.value)}
            inputMode="decimal"
            className="numeric mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <div className="mt-2 flex gap-2">
            {[500, 1000, 5000, 25000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setImporto(String(v))}
                className="numeric rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground">Metodo</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {METODI.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetodo(m.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px] transition-colors",
                  metodo === m.id
                    ? "border-primary bg-primary/12 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={mut.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {mut.isPending && <Loader2 className="size-4 animate-spin" />}
          {tipo === "deposito" ? "Deposita" : "Richiedi prelievo"}
        </button>

        {esito && (
          <p
            className={cn(
              "rounded-lg border px-3 py-2 text-[11px]",
              esito.ok
                ? "border-bull/40 bg-bull/10 text-bull"
                : "border-bear/40 bg-bear/10 text-bear",
            )}
          >
            {esito.testo}
          </p>
        )}
      </form>

      <div className="mt-5 border-t border-border pt-4">
        <p className="text-xs font-medium">Ultimi movimenti</p>
        {!movimenti || movimenti.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Nessun movimento registrato.</p>
        ) : (
          <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {movimenti.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs"
              >
                <span
                  className={cn(
                    "font-medium",
                    m.tipo === "deposito" ? "text-bull" : "text-bear",
                  )}
                >
                  {m.tipo === "deposito" ? "Deposito" : "Prelievo"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {m.createdAt.slice(0, 10).split("-").reverse().join("/")} · {m.metodo} ·{" "}
                  {m.ambiente}
                </span>
                <span className="numeric ml-auto font-semibold">
                  {fmt(m.importo, m.valuta)}
                </span>
                <span
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[10px]",
                    m.stato === "completato"
                      ? "border-bull/40 text-bull"
                      : m.stato === "rifiutato"
                        ? "border-bear/40 text-bear"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {m.stato.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
