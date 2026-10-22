import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, HelpCircle, Scale, ShieldCheck } from "lucide-react";
import { archiviaConto, getRiepilogoConti } from "@/lib/piattaforme.functions";
import type { VistaCondivisa } from "@/lib/condivisione.types";
import { useSessione } from "@/hooks/useSessione";
import { cn } from "@/lib/utils";

type Attivo = VistaCondivisa["confronto"]["attivi"][number];
type Storico = VistaCondivisa["confronto"]["storici"][number] & { id?: string };
type NonDet = VistaCondivisa["confronto"]["nonDeterminati"][number];

// Formattazione deterministica (niente Intl: l'ICU del server può differire dal browser).
export const fmt = (n: number | null | undefined, valuta = "", dec = 2) => {
  if (n == null) return "nascosto";
  const [intero, decimali] = Math.abs(n).toFixed(dec).split(".");
  const seg = intero!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${seg},${decimali}${valuta ? ` ${valuta}` : ""}`;
};
export const fmtData = (iso: string | null) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)} UTC` : "—";
const fmtGiorno = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const segno = (n: number | null) => (n != null && n > 0 ? "+" : "");

export function BadgeAmbiente({ ambiente }: { ambiente: "paper" | "reale" }) {
  return (
    <span
      className={cn(
        "numeric rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest",
        ambiente === "reale" ? "bg-accent/15 text-accent" : "bg-primary/12 text-primary",
      )}
    >
      {ambiente}
    </span>
  );
}

function GraficoSettimana({ settimana, valuta }: { settimana: Attivo["settimana"]; valuta: string }) {
  if (settimana.some((g) => g.pnl == null))
    return <p className="text-[11px] text-muted-foreground">Grafico in valuta non condiviso.</p>;
  const vals = settimana.map((g) => g.pnl ?? 0);
  const max = Math.max(1, ...vals.map(Math.abs));
  return (
    <div>
      <p className="mb-2 text-[11px] text-muted-foreground">Risultato dell'IA al giorno (7 gg)</p>
      <div className="flex h-20 items-stretch gap-1">
        {settimana.map((g) => {
          const p = g.pnl ?? 0;
          return (
            <div key={g.data} className="flex flex-1 flex-col" title={`${fmtGiorno(g.data)}: ${fmt(p, valuta)}`}>
              <div className="flex flex-1 items-end">
                <div className={cn("w-full rounded-t-sm", p > 0 ? "bg-bull/70" : "bg-surface-2")} style={{ height: `${p > 0 ? Math.max(4, (p / max) * 100) : p === 0 ? 3 : 0}%` }} />
              </div>
              <div className="h-px bg-border" />
              <div className="flex flex-1 items-start">
                <div className={cn("w-full rounded-b-sm", p < 0 ? "bg-bear/70" : "bg-surface-2")} style={{ height: `${p < 0 ? Math.max(4, (-p / max) * 100) : p === 0 ? 3 : 0}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{fmtGiorno(settimana[0]!.data)}</span>
        <span>{fmtGiorno(settimana[settimana.length - 1]!.data)}</span>
      </div>
    </div>
  );
}

function Cella({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className={cn("numeric text-sm font-semibold", c)}>{v}</p>
    </div>
  );
}

export function QuadroConto({ c }: { c: Attivo & { contoId?: string | null } }) {
  const chiusure = c.vincite + c.perdite;
  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Scale className="size-4 text-primary" />
        <h4 className="text-sm font-semibold">{c.nome}</h4>
        <BadgeAmbiente ambiente={c.ambiente} />
        {c.etichetta && <span className="numeric text-[11px] text-muted-foreground">conto {c.etichetta}</span>}
        <span className={cn("inline-flex items-center gap-1 text-[10px]", c.verificato ? "text-bull" : "text-muted-foreground")}>
          {c.verificato ? <ShieldCheck className="size-3" /> : <HelpCircle className="size-3" />}
          {c.verificato ? "identità verificata dal broker" : "riconosciuto dalle chiavi (non verificato)"}
        </span>
        {c.stato === "collegato" ? (
          <span className="numeric ml-auto text-xs text-muted-foreground">
            Capitale <span className="font-semibold text-foreground">{fmt(c.capitale, c.valuta)}</span>
          </span>
        ) : (
          <span className="ml-auto text-[11px] text-warn">dati non disponibili</span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cella k="Ordini IA (30 gg)" v={String(c.ordini)} />
        <Cella k="Vincite" v={String(c.vincite)} c="text-bull" />
        <Cella k="Perdite" v={String(c.perdite)} c="text-bear" />
        <Cella k="Chiuse (realizzato)" v={`${segno(c.pnlRealizzato)}${fmt(c.pnlRealizzato, c.valuta)}`} c={(c.pnlRealizzato ?? 0) >= 0 ? "text-bull" : "text-bear"} />
        <Cella k="Aperte (non realizzato)" v={`${segno(c.pnlNonRealizzato)}${fmt(c.pnlNonRealizzato, c.valuta)}`} c={(c.pnlNonRealizzato ?? 0) >= 0 ? "text-bull" : "text-bear"} />
        <Cella k="Rendimento netto" v={c.rendimentoNettoPct == null ? "non disponibile" : `${segno(c.rendimentoNettoPct)}${fmt(c.rendimentoNettoPct)}%`} />
        <Cella k="Versamenti / prelievi" v={c.flussi ? `${fmt(c.flussi.versamenti, "", 0)} / ${fmt(c.flussi.prelievi, "", 0)}` : "non disponibile"} />
        <Cella k="Costi" v={c.flussi ? fmt(c.flussi.costi, c.valuta) : "non disponibile"} />
      </div>

      <div className="mt-4">
        <GraficoSettimana settimana={c.settimana} valuta={c.valuta} />
      </div>

      {c.contoId === null && c.stato === "collegato" && (
        <p className="mt-3 text-[11px] text-warn">Identità del conto non ancora registrata: i risultati compariranno dopo la prima lettura.</p>
      )}
      {chiusure === 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Nessuna posizione chiusa da questo conto negli ultimi 30 giorni.
        </p>
      )}
    </div>
  );
}

export function StoriciEIndeterminati({
  storici,
  nonDeterminati,
  onArchivia,
  inCorso,
}: {
  storici: Storico[];
  nonDeterminati: NonDet[];
  onArchivia?: (id: string) => void;
  inCorso?: boolean;
}) {
  if (!storici.length && !nonDeterminati.length) return null;
  return (
    <details className="panel mt-4 p-5">
      <summary className="cursor-pointer text-sm font-semibold">
        Conti da confermare, archiviati e storico non attribuito ({storici.length + nonDeterminati.length})
      </summary>
      <p className="mt-2 text-[11px] text-muted-foreground">Esclusi dal confronto e dai totali qui sopra. PAPER e REALE restano sempre separati.</p>
      <div className="mt-4 space-y-3">
        {storici.map((s, i) => (
          <div key={s.id ?? i} className="rounded-lg border border-border p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Archive className="size-3.5 text-muted-foreground" />
              <span className="font-semibold">{s.nome}</span>
              <BadgeAmbiente ambiente={s.ambiente} />
              {s.etichetta && <span className="numeric text-muted-foreground">conto {s.etichetta}</span>}
              <span className={cn("rounded-full px-2 py-0.5 text-[10px]", s.stato === "archiviato" ? "bg-surface-2 text-muted-foreground" : "bg-warn/12 text-warn")}>
                {s.stato === "archiviato" ? "archiviato" : "da confermare"}
              </span>
              <span className="ml-auto numeric text-muted-foreground">
                {s.ordini} ordini · {s.vincite} vinte · {s.perdite} perse · {fmt(s.pnlRealizzato)}
              </span>
            </div>
            <p className="mt-1.5 text-muted-foreground">
              {s.motivo} Ultima verifica: {fmtData(s.ultimoVisto)}
              {s.archiviatoIl ? ` · archiviato il ${fmtData(s.archiviatoIl)}` : ""}
            </p>
            {onArchivia && s.stato === "da_confermare" && s.id && (
              <button
                disabled={inCorso}
                onClick={() => {
                  if (confirm("Confermi che questo conto è chiuso o non più in uso? Verrà archiviato; il suo storico resta consultabile.")) onArchivia(s.id!);
                }}
                className="mt-2 rounded-lg border border-border px-3 py-1.5 text-[11px] hover:bg-surface-2 disabled:opacity-50"
              >
                Sì, archivia questo conto
              </button>
            )}
          </div>
        ))}
        {nonDeterminati.map((n) => (
          <div key={`${n.piattaforma}-${n.ambiente}`} className="rounded-lg border border-dashed border-border p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <HelpCircle className="size-3.5 text-muted-foreground" />
              <span className="font-semibold">{n.nome} · conto non determinato</span>
              <BadgeAmbiente ambiente={n.ambiente} />
              <span className="ml-auto numeric text-muted-foreground">
                {n.ordini} ordini · {n.vincite} vinte · {n.perdite} perse · {fmt(n.pnlRealizzato)}
              </span>
            </div>
            <p className="mt-1.5 text-muted-foreground">
              Ordini registrati {n.dal ? `dal ${fmtData(n.dal)} al ${fmtData(n.al)}` : ""} prima che venisse salvato il conto, e non
              ritrovati nello storico del conto attualmente collegato: probabilmente appartengono a conti di prova chiusi.
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

export function RiepilogoConti() {
  const { autenticato } = useSessione();
  const qc = useQueryClient();
  const leggi = useServerFn(getRiepilogoConti);
  const archivia = useServerFn(archiviaConto);
  const riepilogo = useQuery({
    queryKey: ["riepilogo-conti"],
    enabled: autenticato,
    queryFn: () => leggi(),
    refetchInterval: 60_000,
    retry: false,
  });
  const azione = useMutation({
    mutationFn: (id: string) => archivia({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["riepilogo-conti"] }),
  });

  const d = riepilogo.data;
  if (!autenticato || !d) return null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold">Confronto conti attivi</h3>
        <span className="text-[11px] text-muted-foreground">aggiornato {fmtData(d.aggiornatoIl)}</span>
      </div>
      {d.attivi.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {d.attivi.map((c) => (
            <QuadroConto key={`${c.piattaforma}-${c.ambiente}`} c={c} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nessun conto attivo collegato.</p>
      )}
      <StoriciEIndeterminati storici={d.storici} nonDeterminati={d.nonDeterminati} onArchivia={(id) => azione.mutate(id)} inCorso={azione.isPending} />
    </div>
  );
}
