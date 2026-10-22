import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bot, CheckCircle2, Loader2, Play } from "lucide-react";
import { eseguiCicloIA } from "@/lib/alpaca.functions";
import {
  getAutomazioni,
  salvaAutomazione,
  salvaLimitePerdita,
  type ContoAutomazione,
} from "@/lib/automazione.functions";
import { INFO_PIATTAFORME } from "@/lib/piattaforme.types";
import type { EsitoCiclo } from "@/lib/trading.types";
import { STRATEGIE, type StrategyId } from "@/lib/strategies";
import { useSessione } from "@/hooks/useSessione";
import { cn } from "@/lib/utils";
import { FondiConto } from "./FondiConto";

const giorno = (iso: string) => (iso ? iso.slice(0, 10) : "—");

function CardConto({
  conto,
  defStrategia,
  defCapitale,
}: {
  conto: ContoAutomazione;
  defStrategia: StrategyId;
  defCapitale: number;
}) {
  const qc = useQueryClient();
  const esegui = useServerFn(eseguiCicloIA);
  const salvaAuto = useServerFn(salvaAutomazione);
  const salvaLimiteFn = useServerFn(salvaLimitePerdita);

  const [strategia, setStrategia] = useState<StrategyId>(conto.strategia);
  const [capitaleT, setCapitaleT] = useState(conto.capitale > 0 ? String(conto.capitale) : String(defCapitale));
  const [modalita, setModalita] = useState<"limite" | "conto">(conto.modalita);
  const [limiteT, setLimiteT] = useState(
    conto.perditaMaxGiornaliera != null ? String(conto.perditaMaxGiornaliera) : "",
  );
  const [esito, setEsito] = useState<EsitoCiclo | null>(null);

  const reale = conto.ambiente === "reale";
  const capitaleNum = () => {
    const n = Number(capitaleT);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };

  const salva = useMutation({
    mutationFn: (attivo: boolean) =>
      salvaAuto({
        data: {
          piattaforma: conto.piattaforma,
          ambiente: conto.ambiente,
          attivo,
          strategia,
          capitale: capitaleNum(),
          modalita,
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["automazioni-conti"] }),
  });

  // Se il motore è attivo, tieni allineate sul server strategia, capitale e modalità.
  const primo = useRef(true);
  useEffect(() => {
    if (primo.current) {
      primo.current = false;
      return;
    }
    if (!conto.attivo) return;
    const id = setTimeout(() => salva.mutate(true), 800);
    return () => clearTimeout(id);
  }, [strategia, capitaleT, modalita]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvaLimite = useMutation({
    mutationFn: () =>
      salvaLimiteFn({
        data: {
          piattaforma: conto.piattaforma,
          ambiente: conto.ambiente,
          limite: limiteT.trim() ? Number(limiteT) : null,
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["automazioni-conti"] }),
  });

  const ciclo = useMutation({
    mutationFn: () =>
      esegui({
        data: {
          reale,
          piattaforma: conto.piattaforma,
          strategia,
          capitale: capitaleNum(),
          modalita,
          universo: [],
        },
      }),
    onSuccess: (r) => {
      setEsito(r);
      void qc.invalidateQueries({ queryKey: ["automazioni-conti"] });
      void qc.invalidateQueries({ queryKey: ["conto-broker"] });
      void qc.invalidateQueries({ queryKey: ["panoramica-piattaforme"] });
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

  const esitoMostrato = esito ?? conto.ultimoEsito;
  const pausa = !conto.attivo ? conto.pausaMotivo : null;
  const info = INFO_PIATTAFORME[conto.piattaforma];

  return (
    <div className={cn("rounded-xl border p-4", conto.attivo ? "border-primary/50" : "border-border")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold">{info.nome}</span>
        <span
          className={cn(
            "numeric rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest",
            reale ? "bg-accent/15 text-accent" : "bg-primary/12 text-primary",
          )}
        >
          {conto.ambiente}
        </span>
        <span
          className={cn(
            "numeric rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest",
            conto.attivo
              ? "border-bull/40 bg-bull/10 text-bull"
              : "border-border text-muted-foreground",
          )}
        >
          {conto.attivo ? "automatico" : "fermo"}
        </span>
        {conto.ultimoCiclo && (
          <span className="numeric text-[10px] text-muted-foreground">
            ultimo ciclo {giorno(conto.ultimoCiclo)} {conto.ultimoCiclo.slice(11, 19)} UTC
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => salva.mutate(!conto.attivo)}
            disabled={!conto.collegato || salva.isPending}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-60",
              conto.attivo
                ? "border-bear/50 text-bear hover:bg-bear/10"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {conto.attivo ? "Ferma" : "Avvia automatico"}
          </button>
          <button
            onClick={() => {
              setEsito(null);
              ciclo.mutate();
            }}
            disabled={ciclo.isPending || !conto.collegato}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {ciclo.isPending ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
            Esegui ciclo ora
          </button>
        </div>
      </div>

      {!conto.collegato && (
        <p className="mt-2 text-[11px] text-warn">
          Chiavi {conto.ambiente} non collegate: aggiungile dal pannello qui sopra per far operare l'IA su
          questo conto.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5 text-[11px]">
          {STRATEGIE.map((s) => (
            <button
              key={s.id}
              onClick={() => setStrategia(s.id)}
              className={cn(
                "rounded-md px-2.5 py-1 font-semibold transition-colors",
                strategia === s.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.nome}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5 text-[11px]">
          {(
            [
              ["limite", "Mio limite"],
              ["conto", "Tutto il conto"],
            ] as const
          ).map(([id, testo]) => (
            <button
              key={id}
              onClick={() => setModalita(id)}
              className={cn(
                "rounded-md px-2.5 py-1 font-semibold transition-colors",
                modalita === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {testo}
            </button>
          ))}
        </div>
        {modalita === "limite" && (
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Capitale
            <input
              type="number"
              min={1}
              step="1"
              inputMode="decimal"
              value={capitaleT}
              onChange={(e) => setCapitaleT(e.target.value)}
              className="numeric w-24 rounded-md border border-border bg-background px-2 py-1 text-xs"
            />
            $
          </label>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2 p-2.5">
        <label className="text-[11px] font-semibold" htmlFor={`limite-${conto.piattaforma}-${conto.ambiente}`}>
          Perdita max giornaliera ($)
        </label>
        <input
          id={`limite-${conto.piattaforma}-${conto.ambiente}`}
          type="number"
          min={0}
          step="1"
          inputMode="decimal"
          value={limiteT}
          onChange={(e) => setLimiteT(e.target.value)}
          placeholder="nessun limite"
          className="numeric w-28 rounded-md border border-border bg-background px-2 py-1 text-xs"
        />
        <button
          onClick={() => salvaLimite.mutate()}
          disabled={salvaLimite.isPending}
          className="rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold hover:text-foreground disabled:opacity-60"
        >
          {salvaLimite.isPending ? "Salvo…" : "Salva"}
        </button>
        {conto.perditaMaxGiornaliera != null && (
          <span className="numeric text-[11px] text-muted-foreground">
            attivo: {conto.perditaMaxGiornaliera} $
          </span>
        )}
        {conto.piattaforma !== "alpaca" && (
          <span className="text-[10px] text-muted-foreground">(il limite automatico vale solo su Alpaca)</span>
        )}
      </div>

      {pausa && (
        <div role="alert" className="mt-3 rounded-lg border border-bear/50 bg-bear/10 p-3 text-[11px] text-bear">
          <p className="flex items-start gap-2 font-semibold">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" /> Trading automatico in pausa
          </p>
          <p className="mt-1">{pausa}</p>
          {conto.pausaIl && (
            <p className="numeric mt-1 opacity-80">
              dal {giorno(conto.pausaIl)} {conto.pausaIl.slice(11, 16)} UTC · premi "Avvia automatico" per
              riprendere
            </p>
          )}
        </div>
      )}

      <FondiConto conto={conto} />

      {esitoMostrato?.selezione && (
        <p className="mt-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px] text-muted-foreground">
          {esitoMostrato.selezione}
          {esitoMostrato.universo?.length ? (
            <span className="numeric mt-1 block text-foreground">{esitoMostrato.universo.join(" · ")}</span>
          ) : null}
        </p>
      )}

      {esitoMostrato && (
        <div
          className={cn(
            "mt-2 rounded-lg border p-3 text-[11px]",
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
        <ul className="mt-3 max-h-44 space-y-1.5 overflow-y-auto pr-1">
          {esitoMostrato.decisioni.map((d) => (
            <li key={d.ticker} className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px]">
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
                {d.eseguito && <span className="numeric ml-auto text-bull">ordine inviato</span>}
                {d.errore && <span className="numeric ml-auto text-bear">rifiutato</span>}
              </div>
              <p className="mt-1 text-muted-foreground">{d.errore ?? d.motivo}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function MotoreIA({ strategia, capitale }: { strategia: StrategyId; capitale: number }) {
  const { autenticato } = useSessione();
  const leggi = useServerFn(getAutomazioni);
  const impostazioni = useQuery({
    queryKey: ["automazioni-conti"],
    enabled: autenticato,
    queryFn: () => leggi(),
    refetchInterval: 30_000,
    retry: false,
  });

  const conti = impostazioni.data?.conti ?? [];
  const attivi = conti.filter((c) => c.attivo).length;

  return (
    <div className="panel p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Motore operativo</h3>
        <span
          className={cn(
            "numeric rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest",
            attivi > 0
              ? "border-bull/40 bg-bull/10 text-bull"
              : "border-border text-muted-foreground",
          )}
        >
          {attivi > 0
            ? `${attivi} ${attivi === 1 ? "conto attivo" : "conti attivi"} · ogni minuto, anche a sito chiuso`
            : "nessun conto attivo"}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Ogni conto collegato (paper o reale, di qualsiasi piattaforma) ha il suo motore: strategia, capitale e
        limite di perdita si impostano separatamente e l'IA opera su tutti i conti che avvii.
      </p>

      {!autenticato ? (
        <p className="mt-3 text-xs text-muted-foreground">Accedi per gestire i motori dell'IA.</p>
      ) : conti.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Nessun conto collegato: aggiungi le chiavi di un broker dal pannello qui sopra.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {conti.map((c) => (
            <CardConto
              key={`${c.piattaforma}-${c.ambiente}-${c.attivo ? 1 : 0}`}
              conto={c}
              defStrategia={strategia}
              defCapitale={capitale}
            />
          ))}
        </div>
      )}
    </div>
  );
}
