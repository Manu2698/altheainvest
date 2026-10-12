import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bot, CheckCircle2, Loader2, Play, RefreshCw } from "lucide-react";
import { eseguiCicloIA, getOrdiniBroker } from "@/lib/alpaca.functions";
import { getAutomazione, salvaAutomazione, salvaLimitePerdita } from "@/lib/automazione.functions";
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

  const leggiAuto = useServerFn(getAutomazione);
  const salvaAuto = useServerFn(salvaAutomazione);
  const [esito, setEsito] = useState<EsitoCiclo | null>(null);
  const [modalita, setModalita] = useState<"limite" | "conto">("limite");
  const params = useRef({ reale, strategia, capitale, modalita });
  params.current = { reale, strategia, capitale, modalita };

  const impostazioni = useQuery({
    queryKey: ["automazione-ia"],
    enabled: autenticato,
    queryFn: () => leggiAuto(),
    refetchInterval: 30_000,
    retry: false,
  });
  const auto = impostazioni.data?.attivo ?? false;
  const ultimoCiclo = impostazioni.data?.ultimoCiclo ?? null;
  const esitoMostrato = esito ?? impostazioni.data?.ultimoEsito ?? null;

  useEffect(() => {
    if (impostazioni.data) setModalita(impostazioni.data.modalita);
  }, [impostazioni.data?.modalita]); // eslint-disable-line react-hooks/exhaustive-deps

  const salva = useMutation({
    mutationFn: (attivo: boolean) => salvaAuto({ data: { attivo, ...params.current } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["automazione-ia"] }),
  });

  // Se il motore è attivo, tieni allineate sul server strategia, capitale e modalità.
  useEffect(() => {
    if (!auto || !autenticato) return;
    const id = setTimeout(() => salva.mutate(true), 800);
    return () => clearTimeout(id);
  }, [reale, strategia, capitale, modalita]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvaLimiteFn = useServerFn(salvaLimitePerdita);
  const [limiteTesto, setLimiteTesto] = useState("");
  useEffect(() => {
    const v = impostazioni.data?.perditaMaxGiornaliera;
    setLimiteTesto(v != null ? String(v) : "");
  }, [impostazioni.data?.perditaMaxGiornaliera]);
  const salvaLimite = useMutation({
    mutationFn: () =>
      salvaLimiteFn({ data: { limite: limiteTesto.trim() ? Number(limiteTesto) : null } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["automazione-ia"] }),
  });
  const pausa = !auto ? impostazioni.data?.pausaMotivo : null;

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
      if (r.bloccoPerdita) void qc.invalidateQueries({ queryKey: ["automazione-ia"] });
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
          {auto ? "automatico · ogni minuto, anche a sito chiuso" : "manuale"}
        </span>
        {ultimoCiclo && (
          <span className="numeric text-[10px] text-muted-foreground">
            ultimo ciclo {giorno(ultimoCiclo)} {ultimoCiclo.slice(11, 19)} UTC
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => salva.mutate(!auto)}
            disabled={!autenticato || salva.isPending}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-60",
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
        {modalita === "limite" ? (
          <>
            Capitale gestito: <span className="numeric text-foreground">{capitale} $</span> sul
            conto {reale ? "reale" : "paper"}: l'IA non supera mai questa cifra.
          </>
        ) : (
          <>L'IA legge il valore del conto {reale ? "reale" : "paper"} Alpaca e investe usando tutta quella cifra.</>
        )}
      </p>

      <div className="mt-3 inline-flex rounded-lg border border-border bg-surface-2 p-0.5 text-[11px]">
        {(
          [
            ["limite", "Usa il mio limite"],
            ["conto", "Usa tutto il conto Alpaca"],
          ] as const
        ).map(([id, testo]) => (
          <button
            key={id}
            onClick={() => setModalita(id)}
            className={cn(
              "rounded-md px-3 py-1.5 font-semibold transition-colors",
              modalita === id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {testo}
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
        <label htmlFor="limite-perdita" className="text-[11px] font-semibold">
          Perdita massima giornaliera ($)
        </label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Se il conto perde questa cifra rispetto alla chiusura di ieri, l'IA si mette in pausa da
          sola. Lascia vuoto per nessun limite.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            id="limite-perdita"
            type="number"
            min={0}
            step="1"
            inputMode="decimal"
            value={limiteTesto}
            onChange={(e) => setLimiteTesto(e.target.value)}
            placeholder="nessun limite"
            className="numeric w-36 rounded-md border border-border bg-background px-2 py-1 text-xs"
          />
          <button
            onClick={() => salvaLimite.mutate()}
            disabled={!autenticato || salvaLimite.isPending}
            className="rounded-md border border-border px-3 py-1 text-[11px] font-semibold hover:text-foreground disabled:opacity-60"
          >
            {salvaLimite.isPending ? "Salvo…" : "Salva limite"}
          </button>
          {impostazioni.data?.perditaMaxGiornaliera != null && (
            <span className="numeric self-center text-[11px] text-muted-foreground">
              attivo: {impostazioni.data.perditaMaxGiornaliera} $
            </span>
          )}
        </div>
      </div>

      {pausa && (
        <div role="alert" className="mt-3 rounded-lg border border-bear/50 bg-bear/10 p-3 text-[11px] text-bear">
          <p className="flex items-start gap-2 font-semibold">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" /> Trading automatico in pausa
          </p>
          <p className="mt-1">{pausa}</p>
          {impostazioni.data?.pausaIl && (
            <p className="numeric mt-1 opacity-80">
              dal {giorno(impostazioni.data.pausaIl)} {impostazioni.data.pausaIl.slice(11, 16)} UTC ·
              premi "Avvia automatico" per riprendere
            </p>
          )}
        </div>
      )}

      {esitoMostrato?.selezione && (
        <p className="mt-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px] text-muted-foreground">
          {esitoMostrato.selezione}
          {esitoMostrato.universo?.length ? (
            <span className="numeric block mt-1 text-foreground">
              {esitoMostrato.universo.join(" · ")}
            </span>
          ) : null}
        </p>
      )}


      {esitoMostrato && (
        <div
          className={cn(
            "mt-4 rounded-lg border p-3 text-[11px]",
            esitoMostrato.ok
              ? "border-bull/40 bg-bull/10 text-bull"
              : "border-bear/40 bg-bear/10 text-bear",
          )}
        >
          <p className="flex items-start gap-2">
            {esitoMostrato.ok ? (
              <CheckCircle2 className="mt-0.5 size-3 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            )}
            {esitoMostrato.messaggio}
          </p>
        </div>
      )}

      {esitoMostrato?.decisioni.length ? (
        <ul className="mt-3 max-h-52 space-y-1.5 overflow-y-auto pr-1">
          {esitoMostrato.decisioni.map((d) => (
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
