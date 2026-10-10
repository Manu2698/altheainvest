import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bot, CheckCircle2, Loader2, Play, RefreshCw } from "lucide-react";
import { eseguiCicloIA, getOrdiniBroker } from "@/lib/alpaca.functions";
import type { EsitoCiclo } from "@/lib/trading.types";
import type { StrategyId } from "@/lib/strategies";
import { useSessione } from "@/hooks/useSessione";
import { cn } from "@/lib/utils";

const ora = (iso: string) => (iso ? iso.slice(11, 16) : "—");
const giorno = (iso: string) => (iso ? iso.slice(0, 10) : "—");

export function MotoreIA({
  reale,
  strategia,
  capitale,
}: {
  reale: boolean;
  strategia: StrategyId;
  capitale: number;
}) {
  const esegui = useServerFn(eseguiCicloIA);
  const ordini = useServerFn(getOrdiniBroker);
  const qc = useQueryClient();
  const { autenticato } = useSessione();

  const [auto, setAuto] = useState(false);
  const [esito, setEsito] = useState<EsitoCiclo | null>(null);
  const [ultimoCiclo, setUltimoCiclo] = useState<string | null>(null);
  const params = useRef({ reale, strategia, capitale });
  params.current = { reale, strategia, capitale };


  const listaOrdini = useQuery({
    queryKey: ["ordini-broker", reale],
    enabled: autenticato,
    queryFn: () => ordini({ data: { reale } }),
    retry: false,
    refetchInterval: 60_000,
  });

  const ciclo = useMutation({
    mutationFn: () => esegui({ data: params.current }),
    onSuccess: (r) => {
      setEsito(r);
      setUltimoCiclo(new Date().toISOString());
      void qc.invalidateQueries({ queryKey: ["ordini-broker"] });
      void qc.invalidateQueries({ queryKey: ["conto-broker"] });
    },
    onError: (e) =>
      setEsito({
        ok: false,
        messaggio: e instanceof Error ? e.message : "Errore imprevisto.",
        mercatoAperto: false,
        decisioni: [],
        eseguiti: 0,
      }),
  });

  const lancia = ciclo.mutate;
  const inCorso = useRef(false);
  inCorso.current = ciclo.isPending;
  useEffect(() => {
    if (!auto || !autenticato) return;
    // Analisi continua: un ciclo al minuto (limite pratico delle API del broker),
    // senza mai sovrapporre due cicli.
    if (!inCorso.current) lancia();
    const id = setInterval(() => {
      if (!inCorso.current) lancia();
    }, 60_000);
    return () => clearInterval(id);
  }, [auto, autenticato, lancia]);

  return (
    <div className="panel p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Motore operativo</h3>
        <span
          className={cn(
            "numeric rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest",
            auto ? "border-bull/40 bg-bull/10 text-bull" : "border-border text-muted-foreground",
          )}
        >
          {auto ? "auto · analisi ogni minuto" : "manuale"}
        </span>
        {ultimoCiclo && (
          <span className="numeric text-[10px] text-muted-foreground">
            ultimo ciclo {ultimoCiclo.slice(11, 19)} UTC
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setAuto((v) => !v)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors",
              auto
                ? "border-bear/50 text-bear hover:bg-bear/10"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {auto ? "Ferma automatico" : "Avvia automatico"}
          </button>
          <button
            onClick={() => {
              setEsito(null);
              ciclo.mutate();
            }}
            disabled={ciclo.isPending || !autenticato}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {ciclo.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Play className="size-3" />
            )}
            Esegui ciclo ora
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        L'IA analizza da sola tutti gli strumenti disponibili sul broker (azioni, ETF e
        cripto) e sceglie in autonomia su cosa investire, secondo la strategia attiva.
        Capitale gestito: <span className="numeric text-foreground">{capitale} $</span> sul
        conto {reale ? "reale" : "paper"}.
      </p>

      {esito?.selezione && (
        <p className="mt-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px] text-muted-foreground">
          {esito.selezione}
          {esito.universo?.length ? (
            <span className="numeric block mt-1 text-foreground">
              {esito.universo.join(" · ")}
            </span>
          ) : null}
        </p>
      )}


      {esito && (
        <div
          className={cn(
            "mt-4 rounded-lg border p-3 text-[11px]",
            esito.ok
              ? "border-bull/40 bg-bull/10 text-bull"
              : "border-bear/40 bg-bear/10 text-bear",
          )}
        >
          <p className="flex items-start gap-2">
            {esito.ok ? (
              <CheckCircle2 className="mt-0.5 size-3 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            )}
            {esito.messaggio}
          </p>
        </div>
      )}

      {esito?.decisioni.length ? (
        <ul className="mt-3 max-h-52 space-y-1.5 overflow-y-auto pr-1">
          {esito.decisioni.map((d) => (
            <li
              key={d.ticker}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px]"
            >
              <div className="flex items-center gap-2">
                <span className="numeric font-semibold">{d.ticker}</span>
                <span
                  className={cn(
                    "numeric rounded px-1.5 py-0.5 text-[10px] uppercase",
                    d.azione === "compra"
                      ? "bg-bull/15 text-bull"
                      : d.azione === "vendi"
                        ? "bg-bear/15 text-bear"
                        : "bg-surface text-muted-foreground",
                  )}
                >
                  {d.azione}
                </span>
                {d.eseguito && (
                  <span className="numeric ml-auto text-bull">ordine inviato</span>
                )}
                {d.errore && (
                  <span className="numeric ml-auto text-bear">rifiutato</span>
                )}
              </div>
              <p className="mt-1 text-muted-foreground">{d.errore ?? d.motivo}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium">Ordini sul conto broker</p>
          <button
            onClick={() => void listaOrdini.refetch()}
            className="ml-auto text-muted-foreground hover:text-foreground"
            aria-label="Aggiorna ordini"
          >
            {listaOrdini.isFetching ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </button>
        </div>
        {!listaOrdini.data?.length ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Nessun ordine registrato sul conto: avvia un ciclo per farne inviare all'IA.
          </p>
        ) : (
          <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {listaOrdini.data.map((o) => (
              <li
                key={o.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px]"
              >
                <span
                  className={cn(
                    "numeric font-semibold",
                    o.lato === "buy" ? "text-bull" : "text-bear",
                  )}
                >
                  {o.lato === "buy" ? "BUY" : "SELL"}
                </span>
                <span className="numeric font-semibold">{o.ticker}</span>
                <span className="numeric text-muted-foreground">
                  {o.quantita ? o.quantita : o.importo ? `${o.importo} $` : "—"}
                  {o.prezzoMedio ? ` @ ${o.prezzoMedio}` : ""}
                </span>
                <span className="numeric ml-auto text-muted-foreground">
                  {giorno(o.creatoIl)} {ora(o.creatoIl)}
                </span>
                <span className="numeric w-20 text-right text-muted-foreground">
                  {o.stato}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
