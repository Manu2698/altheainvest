import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Scale } from "lucide-react";
import { getRiepilogoConti } from "@/lib/piattaforme.functions";
import type { RiepilogoConto } from "@/lib/piattaforme.types";
import { useSessione } from "@/hooks/useSessione";
import { cn } from "@/lib/utils";

// Formattazione deterministica (niente Intl: l'ICU del server può differire dal browser).
const fmt = (n: number, valuta: string, dec = 2) => {
  const [intero, decimali] = Math.abs(n).toFixed(dec).split(".");
  const seg = intero!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${seg},${decimali} ${valuta}`;
};

const fmtGiorno = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function GraficoSettimana({ settimana, valuta }: { settimana: RiepilogoConto["settimana"]; valuta: string }) {
  const max = Math.max(1, ...settimana.map((g) => Math.abs(g.pnl)));
  return (
    <div>
      <p className="mb-2 text-[11px] text-muted-foreground">Risultato dell'IA al giorno (7 gg)</p>
      <div className="flex h-20 items-stretch gap-1">
        {settimana.map((g) => (
          <div key={g.data} className="flex flex-1 flex-col" title={`${fmtGiorno(g.data)}: ${fmt(g.pnl, valuta)}`}>
            <div className="flex flex-1 items-end">
              <div
                className={cn("w-full rounded-t-sm", g.pnl > 0 ? "bg-bull/70" : "bg-surface-2")}
                style={{ height: `${g.pnl > 0 ? Math.max(4, (g.pnl / max) * 100) : g.pnl === 0 ? 3 : 0}%` }}
              />
            </div>
            <div className="h-px bg-border" />
            <div className="flex flex-1 items-start">
              <div
                className={cn("w-full rounded-b-sm", g.pnl < 0 ? "bg-bear/70" : "bg-surface-2")}
                style={{ height: `${g.pnl < 0 ? Math.max(4, (-g.pnl / max) * 100) : g.pnl === 0 ? 3 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{fmtGiorno(settimana[0]!.data)}</span>
        <span>{fmtGiorno(settimana[settimana.length - 1]!.data)}</span>
      </div>
    </div>
  );
}

function Quadro({ c }: { c: RiepilogoConto }) {
  const chiusure = c.vincite + c.perdite;
  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Scale className="size-4 text-primary" />
        <h4 className="text-sm font-semibold">{c.nome}</h4>
        <span
          className={cn(
            "numeric rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest",
            c.ambiente === "reale" ? "bg-accent/15 text-accent" : "bg-primary/12 text-primary",
          )}
        >
          {c.ambiente}
        </span>
        {c.stato === "collegato" ? (
          <span className="numeric ml-auto text-xs text-muted-foreground">
            Capitale <span className="font-semibold text-foreground">{fmt(c.capitale, c.valuta)}</span>
          </span>
        ) : (
          <span className="ml-auto text-[11px] text-warn">non raggiungibile</span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ordini IA</p>
          <p className="numeric text-sm font-semibold">{c.ordini}</p>
        </div>
        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vincite</p>
          <p className="numeric text-sm font-semibold text-bull">{c.vincite}</p>
        </div>
        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Perdite</p>
          <p className="numeric text-sm font-semibold text-bear">{c.perdite}</p>
        </div>
        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Risultato</p>
          <p className={cn("numeric text-sm font-semibold", c.pnlRealizzato >= 0 ? "text-bull" : "text-bear")}>
            {c.pnlRealizzato >= 0 ? "+" : ""}
            {fmt(c.pnlRealizzato, c.valuta)}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <GraficoSettimana settimana={c.settimana} valuta={c.valuta} />
      </div>

      {chiusure === 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Nessuna posizione ancora chiusa negli ultimi 30 giorni: vincite e perdite compariranno alla prima vendita.
        </p>
      )}
    </div>
  );
}

export function RiepilogoConti() {
  const { autenticato } = useSessione();
  const leggi = useServerFn(getRiepilogoConti);
  const riepilogo = useQuery({
    queryKey: ["riepilogo-conti"],
    enabled: autenticato,
    queryFn: () => leggi(),
    refetchInterval: 60_000,
    retry: false,
  });

  if (!autenticato || !riepilogo.data?.length) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold">Confronto conti</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        {riepilogo.data.map((c) => (
          <Quadro key={`${c.piattaforma}-${c.ambiente}`} c={c} />
        ))}
      </div>
    </div>
  );
}
