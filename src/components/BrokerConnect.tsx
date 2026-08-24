import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  Unlink,
} from "lucide-react";
import {
  collegaBroker,
  getContoBroker,
  getStatoBroker,
  scollegaBroker,
} from "@/lib/alpaca.functions";
import { useSessione } from "@/hooks/useSessione";
import { cn } from "@/lib/utils";

const usd = (v: number, valuta: string) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: valuta || "USD",
    maximumFractionDigits: 2,
  }).format(v);

export function BrokerConnect({ reale }: { reale: boolean }) {
  const fetchConto = useServerFn(getContoBroker);
  const fetchStato = useServerFn(getStatoBroker);
  const collega = useServerFn(collegaBroker);
  const scollega = useServerFn(scollegaBroker);
  const qc = useQueryClient();

  const { autenticato, caricata } = useSessione();
  const [form, setForm] = useState({ keyId: "", secret: "" });
  const [apri, setApri] = useState(false);
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["conto-broker", reale],
    enabled: autenticato,
    queryFn: async () => {
      try {
        return await fetchConto({ data: { reale } });
      } catch {
        return {
          stato: "errore",
          messaggio: "Impossibile leggere il conto broker: riprova tra qualche istante.",
        } as const;
      }
    },
    retry: false,
    refetchInterval: 60_000,
  });

  const { data: stato } = useQuery({
    queryKey: ["stato-broker"],
    enabled: autenticato,
    queryFn: () => fetchStato({}),
    retry: false,
  });

  const salva = useMutation({
    mutationFn: () => collega({ data: { ...form, reale } }),
    onSuccess: (r) => {
      setEsito({ ok: r.ok, testo: r.messaggio });
      if (r.ok) {
        setForm({ keyId: "", secret: "" });
        setApri(false);
        void qc.invalidateQueries({ queryKey: ["conto-broker"] });
        void qc.invalidateQueries({ queryKey: ["stato-broker"] });
      }
    },
    onError: (e) =>
      setEsito({ ok: false, testo: e instanceof Error ? e.message : "Errore imprevisto." }),
  });

  const rimuovi = useMutation({
    mutationFn: () => scollega({ data: { reale } }),
    onSuccess: () => {
      setEsito({ ok: true, testo: "Chiavi rimosse." });
      void qc.invalidateQueries({ queryKey: ["conto-broker"] });
      void qc.invalidateQueries({ queryKey: ["stato-broker"] });
    },
  });

  const collegato = data?.stato === "collegato";
  const proprie = collegato ? data.proprieChiavi : false;
  const chiaveSalvata = reale ? stato?.reale : stato?.paper;

  if (caricata && !autenticato) {
    return (
      <div className="panel p-6">
        <div className="flex items-center gap-2">
          <Lock className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Conto broker</h3>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Accedi al tuo account per collegare il broker e vedere il conto in tempo reale.
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
        <Link2 className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Conto broker</h3>
        <span
          className={cn(
            "numeric ml-auto rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest",
            collegato
              ? "border-bull/40 bg-bull/10 text-bull"
              : "border-border text-muted-foreground",
          )}
        >
          {isFetching && !data
            ? "verifica…"
            : collegato
              ? `collegato · ${data.ambiente}`
              : "non collegato"}
        </span>
        <button
          onClick={() => void refetch()}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Aggiorna dati del conto"
        >
          {isFetching ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
        </button>
      </div>

      {collegato ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Conto {data.numeroConto} ·{" "}
            {proprie ? "chiavi personali" : "chiavi dimostrative della piattaforma"}
            {data.bloccato ? " · trading bloccato dal broker" : ""}.
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
            {[
              ["Valore conto", usd(data.valorePortafoglio, data.valuta)],
              ["Liquidità", usd(data.liquidita, data.valuta)],
              ["Potere d'acquisto", usd(data.poterAcquisto, data.valuta)],
              [
                "P&L giornaliero",
                `${data.pnlGiornaliero >= 0 ? "+" : ""}${data.pnlGiornaliero.toFixed(2)}%`,
              ],
            ].map(([k, v], i) => (
              <div key={k} className="bg-surface px-4 py-3">
                <dt className="text-[11px] text-muted-foreground">{k}</dt>
                <dd
                  className={cn(
                    "numeric mt-1 text-sm font-semibold",
                    i === 3 && (data.pnlGiornaliero >= 0 ? "text-bull" : "text-bear"),
                  )}
                >
                  {v}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-4">
            <p className="text-xs font-medium">Posizioni aperte</p>
            {data.posizioni.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Nessuna posizione aperta sul conto in questo momento.
              </p>
            ) : (
              <ul className="mt-2 max-h-52 space-y-1.5 overflow-y-auto pr-1">
                {data.posizioni.map((p) => (
                  <li
                    key={p.ticker}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs"
                  >
                    <span className="numeric font-semibold">{p.ticker}</span>
                    <span className="numeric text-muted-foreground">
                      {p.quantita} @ {usd(p.prezzoMedio, data.valuta)}
                    </span>
                    <span className="numeric ml-auto">{usd(p.valore, data.valuta)}</span>
                    <span
                      className={cn(
                        "numeric w-16 text-right font-semibold",
                        p.pnl >= 0 ? "text-bull" : "text-bear",
                      )}
                    >
                      {p.pnlPct >= 0 ? "+" : ""}
                      {p.pnlPct.toFixed(2)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          {data?.stato === "errore" || data?.stato === "non_configurato"
            ? data.messaggio
            : "Collega il tuo conto Alpaca per far operare l'IA con dati reali."}
        </p>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <KeyRound className="size-3.5 text-primary" />
              Chiavi API {reale ? "live" : "paper"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {chiaveSalvata?.collegato
                ? `Salvate: ${chiaveSalvata.chiave}`
                : "Generale su alpaca.markets → API Keys e incollale qui: restano cifrate lato server."}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {chiaveSalvata?.collegato && (
              <button
                onClick={() => rimuovi.mutate()}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-bear/60 hover:text-bear"
              >
                <Unlink className="size-3" /> Scollega
              </button>
            )}
            <button
              onClick={() => setApri((v) => !v)}
              className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground"
            >
              {chiaveSalvata?.collegato ? "Sostituisci" : "Collega"}
            </button>
          </div>
        </div>

        {apri && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setEsito(null);
              salva.mutate();
            }}
            className="mt-3 space-y-2"
          >
            <input
              value={form.keyId}
              onChange={(e) => setForm((f) => ({ ...f, keyId: e.target.value }))}
              placeholder="API Key ID"
              autoComplete="off"
              className="numeric w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs outline-none focus:border-primary"
            />
            <input
              value={form.secret}
              onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
              placeholder="API Secret Key"
              type="password"
              autoComplete="off"
              className="numeric w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={salva.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {salva.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Verifica e salva
            </button>
          </form>
        )}

        {esito && (
          <p
            className={cn(
              "mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-[11px]",
              esito.ok
                ? "border-bull/40 bg-bull/10 text-bull"
                : "border-bear/40 bg-bear/10 text-bear",
            )}
          >
            {esito.ok ? (
              <CheckCircle2 className="mt-0.5 size-3 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            )}
            {esito.testo}
          </p>
        )}
      </div>
    </div>
  );
}
