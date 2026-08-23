import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { getContoBroker } from "@/lib/alpaca.functions";
import { cn } from "@/lib/utils";

const PASSI = [
  {
    icona: KeyRound,
    titolo: "1 · Crea le chiavi API",
    testo:
      "Dal pannello del tuo broker (es. Alpaca) genera una coppia di chiavi in modalità paper: servono solo per leggere il conto e inviare ordini simulati.",
  },
  {
    icona: Link2,
    titolo: "2 · Collega il conto",
    testo:
      "Incolli le chiavi una volta sola: vengono salvate cifrate lato server e non passano mai dal browser.",
  },
  {
    icona: ShieldCheck,
    titolo: "3 · Passa al reale quando vuoi",
    testo:
      "Le stesse strategie girano sul conto reale con un limite di capitale che decidi tu. Puoi fermare il motore in qualsiasi momento.",
  },
];

const usd = (v: number, valuta: string) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: valuta || "USD",
    maximumFractionDigits: 2,
  }).format(v);

export function BrokerConnect({ reale }: { reale: boolean }) {
  const fetchConto = useServerFn(getContoBroker);
  const [autenticato, setAutenticato] = useState<boolean | null>(null);

  useEffect(() => {
    let attivo = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (attivo) setAutenticato(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAutenticato(Boolean(session));
    });
    return () => {
      attivo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["conto-broker", reale],
    enabled: autenticato === true,
    queryFn: async () => {
      try {
        return await fetchConto({ data: { reale } });
      } catch {
        return {
          stato: "errore",
          messaggio:
            "Impossibile leggere il conto broker: riprova tra qualche istante.",
        } as const;
      }
    },
    retry: false,
    refetchInterval: 60_000,
  });



  const collegato = data?.stato === "collegato";

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
            Conto {data.numeroConto} · dati letti in diretta dal broker
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
              <ul className="mt-2 space-y-1.5">
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
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            {data?.stato === "errore" || data?.stato === "non_configurato"
              ? data.messaggio
              : "Collega il broker per far operare l'IA su un conto vero."}
          </p>

          <ol className="mt-5 space-y-4">
            {PASSI.map((p) => (
              <li key={p.titolo} className="flex gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-primary">
                  <p.icona className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">{p.titolo}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {p.testo}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
            {data?.stato === "errore" ? (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-bull" />
            )}
            <span>
              Scrivimi in chat quando vuoi procedere: ti chiedo le chiavi in un modulo
              sicuro e attivo il collegamento con il broker.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
