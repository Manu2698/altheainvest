import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ExternalLink, Layers, Loader2 } from "lucide-react";
import {
  collegaPiattaforma,
  getStatoPiattaforme,
  scollegaPiattaforma,
} from "@/lib/piattaforme.functions";
import {
  INFO_PIATTAFORME,
  PIATTAFORME_ESTERNE,
  type PiattaformaEsterna,
} from "@/lib/piattaforme.types";
import { useSessione } from "@/hooks/useSessione";
import { cn } from "@/lib/utils";

export function PiattaformeConnect({ reale }: { reale: boolean }) {
  const { autenticato } = useSessione();
  const qc = useQueryClient();
  const leggiStato = useServerFn(getStatoPiattaforme);
  const collega = useServerFn(collegaPiattaforma);
  const scollega = useServerFn(scollegaPiattaforma);

  const stato = useQuery({ queryKey: ["piattaforme"], enabled: autenticato, queryFn: () => leggiStato(), retry: false });

  const [aperta, setAperta] = useState<PiattaformaEsterna | null>(null);
  const [chiave, setChiave] = useState("");
  const [segreto, setSegreto] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; testo: string } | null>(null);

  const salva = useMutation({
    mutationFn: (p: PiattaformaEsterna) => collega({ data: { piattaforma: p, reale, chiave, segreto } }),
    onSuccess: (r) => {
      setMsg({ ok: r.ok, testo: r.messaggio });
      if (r.ok) {
        setChiave("");
        setSegreto("");
        void qc.invalidateQueries({ queryKey: ["piattaforme"] });
        void qc.invalidateQueries({ queryKey: ["panoramica-piattaforme"] });
        void qc.invalidateQueries({ queryKey: ["automazioni-conti"] });
      }
    },
    onError: (e) => setMsg({ ok: false, testo: e instanceof Error ? e.message : "Errore." }),
  });
  const rimuovi = useMutation({
    mutationFn: (p: PiattaformaEsterna) => scollega({ data: { piattaforma: p, reale } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["piattaforme"] });
      void qc.invalidateQueries({ queryKey: ["panoramica-piattaforme"] });
      void qc.invalidateQueries({ queryKey: ["automazioni-conti"] });
    },
  });

  const ambiente = reale ? "reale" : "paper";

  return (
    <div className="panel p-6">
      <div className="flex items-center gap-2">
        <Layers className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Piattaforme collegabili</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Collega i tuoi conti: per ogni piattaforma puoi aggiungere sia le chiavi paper sia quelle reali
        (l'interruttore in alto sceglie quale ambiente stai configurando). L'IA opera su ogni conto che
        avvii nel Motore operativo.
      </p>
      {!autenticato && <p className="mt-3 text-xs text-muted-foreground">Accedi per collegare le piattaforme.</p>}

      <ul className="mt-4 space-y-2">
        {PIATTAFORME_ESTERNE.map((p) => {
          const info = INFO_PIATTAFORME[p];
          const collegata = stato.data?.[p]?.[ambiente];
          return (
            <li key={p} className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold">{info.nome}</span>
                <span className="text-[10px] text-muted-foreground">{info.mercati}</span>
                {collegata && (
                  <span className="numeric inline-flex items-center gap-1 text-[10px] text-bull">
                    <CheckCircle2 className="size-3" /> {collegata}
                  </span>
                )}
                <button
                  onClick={() => {
                    setMsg(null);
                    setAperta(aperta === p ? null : p);
                  }}
                  disabled={!autenticato}
                  className="ml-auto rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-60"
                >
                  {collegata ? "Chiavi" : "Collega"}
                </button>
              </div>

              {aperta === p && (
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
      <p className="mt-3 text-[11px] text-muted-foreground">
        Il limite di perdita giornaliera automatico e l'elenco ordini sul conto valgono solo per Alpaca; gli
        ordini dell'IA sulle altre piattaforme compaiono nei pannelli qui sotto e nel Report.
      </p>
    </div>
  );
}
