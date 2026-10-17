import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ExternalLink, Layers, Loader2 } from "lucide-react";
import { getAutomazione, salvaPiattaforma } from "@/lib/automazione.functions";
import {
  collegaPiattaforma,
  getStatoPiattaforme,
  scollegaPiattaforma,
} from "@/lib/piattaforme.functions";
import {
  INFO_PIATTAFORME,
  PIATTAFORME_ESTERNE,
  type Piattaforma,
  type PiattaformaEsterna,
} from "@/lib/piattaforme.types";
import { useSessione } from "@/hooks/useSessione";
import { cn } from "@/lib/utils";

export function PiattaformeConnect({ reale }: { reale: boolean }) {
  const { autenticato } = useSessione();
  const qc = useQueryClient();
  const leggiStato = useServerFn(getStatoPiattaforme);
  const leggiAuto = useServerFn(getAutomazione);
  const salvaP = useServerFn(salvaPiattaforma);
  const collega = useServerFn(collegaPiattaforma);
  const scollega = useServerFn(scollegaPiattaforma);

  const stato = useQuery({ queryKey: ["piattaforme"], enabled: autenticato, queryFn: () => leggiStato(), retry: false });
  const auto = useQuery({ queryKey: ["automazione-ia"], enabled: autenticato, queryFn: () => leggiAuto(), retry: false });
  const attiva: Piattaforma = auto.data?.piattaforma ?? "alpaca";

  const [aperta, setAperta] = useState<PiattaformaEsterna | null>(null);
  const [chiave, setChiave] = useState("");
  const [segreto, setSegreto] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; testo: string } | null>(null);

  const scegli = useMutation({
    mutationFn: (p: Piattaforma) => salvaP({ data: { piattaforma: p } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["automazione-ia"] }),
  });
  const salva = useMutation({
    mutationFn: (p: PiattaformaEsterna) => collega({ data: { piattaforma: p, reale, chiave, segreto } }),
    onSuccess: (r) => {
      setMsg({ ok: r.ok, testo: r.messaggio });
      if (r.ok) {
        setChiave("");
        setSegreto("");
        void qc.invalidateQueries({ queryKey: ["piattaforme"] });
      }
    },
    onError: (e) => setMsg({ ok: false, testo: e instanceof Error ? e.message : "Errore." }),
  });
  const rimuovi = useMutation({
    mutationFn: (p: PiattaformaEsterna) => scollega({ data: { piattaforma: p, reale } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["piattaforme"] }),
  });

  const ambiente = reale ? "reale" : "paper";

  return (
    <div className="panel p-6">
      <div className="flex items-center gap-2">
        <Layers className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Piattaforma su cui investe l'IA</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Scegli dove l'IA deve operare. Una piattaforma alla volta; il conto {reale ? "reale" : "paper"} segue
        l'interruttore in alto.
      </p>
      {!autenticato && <p className="mt-3 text-xs text-muted-foreground">Accedi per collegare le piattaforme.</p>}

      <ul className="mt-4 space-y-2">
        {(["alpaca", ...PIATTAFORME_ESTERNE] as Piattaforma[]).map((p) => {
          const info = INFO_PIATTAFORME[p];
          const collegata = p === "alpaca" ? null : stato.data?.[p]?.[ambiente];
          const selezionata = attiva === p;
          return (
            <li key={p} className={cn("rounded-lg border bg-surface-2 p-3", selezionata ? "border-primary" : "border-border")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold">{info.nome}</span>
                <span className="text-[10px] text-muted-foreground">{info.mercati}</span>
                {p !== "alpaca" && collegata && (
                  <span className="numeric inline-flex items-center gap-1 text-[10px] text-bull">
                    <CheckCircle2 className="size-3" /> {collegata}
                  </span>
                )}
                <div className="ml-auto flex gap-2">
                  {p !== "alpaca" && (
                    <button
                      onClick={() => {
                        setMsg(null);
                        setAperta(aperta === p ? null : p);
                      }}
                      disabled={!autenticato}
                      className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-60"
                    >
                      {collegata ? "Chiavi" : "Collega"}
                    </button>
                  )}
                  <button
                    onClick={() => scegli.mutate(p)}
                    disabled={!autenticato || selezionata || scegli.isPending}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-semibold disabled:opacity-80",
                      selezionata ? "bg-primary text-primary-foreground" : "border border-border hover:text-foreground",
                    )}
                  >
                    {selezionata ? "In uso" : "Usa questa"}
                  </button>
                </div>
              </div>

              {aperta === p && p !== "alpaca" && (
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    {info.guida} Modalità paper: {info.paper}.{" "}
                    <a href={info.sito} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary">
                      Apri {info.nome} <ExternalLink className="size-3" />
                    </a>
                  </p>
                  <input
                    value={chiave}
                    onChange={(e) => setChiave(e.target.value)}
                    placeholder={info.campoChiave}
                    autoComplete="off"
                    className="numeric w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                  />
                  <textarea
                    value={segreto}
                    onChange={(e) => setSegreto(e.target.value)}
                    placeholder={info.campoSegreto}
                    rows={p === "coinbase" ? 4 : 1}
                    autoComplete="off"
                    className="numeric w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => salva.mutate(p)}
                      disabled={salva.isPending || !chiave || !segreto}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {salva.isPending && <Loader2 className="size-3 animate-spin" />}
                      Verifica e collega ({reale ? "reale" : "paper"})
                    </button>
                    {collegata && (
                      <button
                        onClick={() => rimuovi.mutate(p)}
                        className="rounded-md border border-bear/50 px-3 py-1 text-[11px] text-bear"
                      >
                        Scollega
                      </button>
                    )}
                  </div>
                  {msg && <p className={cn("text-[11px]", msg.ok ? "text-bull" : "text-bear")}>{msg.testo}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {attiva !== "alpaca" && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Su {INFO_PIATTAFORME[attiva].nome} il limite di perdita giornaliera e l'elenco ordini qui sotto valgono solo per
          Alpaca; gli ordini dell'IA compaiono comunque nel Report.
        </p>
      )}
    </div>
  );
}
