import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Copy, Link2, ShieldAlert } from "lucide-react";
import { creaLinkCondivisione, listaLinkCondivisione, revocaLinkCondivisione } from "@/lib/condivisione.functions";
import { DURATE_ORE, OPZIONI_PREDEFINITE, datiVisibili, type OpzioniCondivisione } from "@/lib/condivisione";
import { useSessione } from "@/hooks/useSessione";
import { fmtData } from "@/components/RiepilogoConti";
import { cn } from "@/lib/utils";

const ETICHETTE_DURATA: Record<number, string> = { 1: "1 ora", 24: "24 ore", 168: "7 giorni", 720: "30 giorni" };
const OPZIONI: { k: keyof OpzioniCondivisione; label: string }[] = [
  { k: "reale", label: "Includi i conti REALI" },
  { k: "importi", label: "Includi importi, capitali e curva del capitale" },
  { k: "posizioni", label: "Includi le posizioni aperte" },
  { k: "storico", label: "Includi lo storico dettagliato degli ordini" },
];

export function CondivisioneAnalisi() {
  const { autenticato } = useSessione();
  const qc = useQueryClient();
  const [nome, setNome] = useState("Analisi Althea");
  const [durata, setDurata] = useState<number>(24);
  const [opz, setOpz] = useState<OpzioniCondivisione>(OPZIONI_PREDEFINITE);
  const [creato, setCreato] = useState<string | null>(null);
  const [copiato, setCopiato] = useState(false);

  const lista = useServerFn(listaLinkCondivisione);
  const crea = useServerFn(creaLinkCondivisione);
  const revoca = useServerFn(revocaLinkCondivisione);
  const links = useQuery({ queryKey: ["link-condivisione"], enabled: autenticato, queryFn: () => lista(), retry: false });
  const creazione = useMutation({
    mutationFn: () => crea({ data: { nome, durataOre: durata, opzioni: opz } }),
    onSuccess: (r) => {
      // Il token sta dopo "#": il browser non lo invia a nessun server né come referrer.
      setCreato(`${window.location.origin}/condivisione#t=${r.token}`);
      setCopiato(false);
      void qc.invalidateQueries({ queryKey: ["link-condivisione"] });
    },
  });
  const revocazione = useMutation({
    mutationFn: (id: string) => revoca({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["link-condivisione"] }),
  });

  if (!autenticato) return null;
  const vis = datiVisibili(opz);

  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2">
        <Link2 className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Condivisione per analisi</h3>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Crea un link in sola lettura da dare a ChatGPT o a un'altra persona. Non dà accesso al tuo account e puoi revocarlo in ogni momento.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 text-xs">
          <label className="block">
            <span className="text-muted-foreground">Nome del link</span>
            <input value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2" />
          </label>
          <div>
            <span className="text-muted-foreground">Scadenza</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {DURATE_ORE.map((h) => (
                <button key={h} onClick={() => setDurata(h)} className={cn("rounded-full border px-3 py-1", durata === h ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                  {ETICHETTE_DURATA[h]}
                </button>
              ))}
            </div>
          </div>
          {OPZIONI.map((o) => (
            <label key={o.k} className="flex items-center gap-2">
              <input type="checkbox" checked={opz[o.k]} onChange={(e) => setOpz((p) => ({ ...p, [o.k]: e.target.checked }))} />
              {o.label}
            </label>
          ))}
          <button
            onClick={() => creazione.mutate()}
            disabled={creazione.isPending}
            className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {creazione.isPending ? "Creazione…" : "Crea link"}
          </button>
          {creazione.isError && <p className="text-bear">Impossibile creare il link. Riprova.</p>}
        </div>

        <div className="rounded-lg border border-border p-3 text-[11px]">
          <p className="font-semibold text-foreground">Chi apre il link vedrà</p>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            {vis.si.map((x) => (
              <li key={x} className="flex gap-1.5"><Check className="mt-0.5 size-3 shrink-0 text-bull" />{x}</li>
            ))}
          </ul>
          <p className="mt-3 font-semibold text-foreground">Non vedrà</p>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            {vis.no.map((x) => (
              <li key={x} className="flex gap-1.5"><ShieldAlert className="mt-0.5 size-3 shrink-0 text-bear" />{x}</li>
            ))}
          </ul>
        </div>
      </div>

      {creato && (
        <div className="mt-4 rounded-lg border border-primary/40 bg-primary/8 p-3 text-xs">
          <p className="font-semibold">Copia ora il link: per sicurezza non verrà più mostrato.</p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={creato} className="numeric flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-[11px]" onFocus={(e) => e.currentTarget.select()} />
            <button
              onClick={() => void navigator.clipboard.writeText(creato).then(() => setCopiato(true))}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3"
            >
              <Copy className="size-3.5" /> {copiato ? "Copiato" : "Copia"}
            </button>
          </div>
        </div>
      )}

      {!!links.data?.length && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold">Link creati</p>
          <div className="space-y-2">
            {links.data.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-[11px]">
                <span className="font-medium text-foreground">{l.nome}</span>
                <span className={cn("rounded-full px-2 py-0.5", l.stato === "attivo" ? "bg-bull/12 text-bull" : "bg-surface-2 text-muted-foreground")}>{l.stato}</span>
                <span className="text-muted-foreground">
                  scade {fmtData(l.scadeIl)} · aperto {l.accessi} volte{l.ultimoAccesso ? ` · ultima ${fmtData(l.ultimoAccesso)}` : ""}
                  {l.opzioni.reale ? " · include REALE" : ""}
                </span>
                {l.stato === "attivo" && (
                  <button onClick={() => revocazione.mutate(l.id)} disabled={revocazione.isPending} className="ml-auto rounded-lg border border-bear/50 px-3 py-1 text-bear disabled:opacity-50">
                    Revoca
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
