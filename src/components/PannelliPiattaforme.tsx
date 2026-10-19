import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { getPanoramicaPiattaforme } from "@/lib/piattaforme.functions";
import type { PannelloPiattaforma } from "@/lib/piattaforme.types";
import { useSessione } from "@/hooks/useSessione";
import { cn } from "@/lib/utils";

// Formattazione deterministica (niente Intl: l'ICU del server può differire dal browser).
const fmt = (n: number, valuta: string, dec = 2) => {
  const [intero, decimali] = Math.abs(n).toFixed(dec).split(".");
  const seg = intero!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${seg},${decimali} ${valuta}`;
};

const fmtData = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`;
const fmtGiorno = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function GraficoGiorni({ giorni, valuta }: { giorni: PannelloPiattaforma["giorni"]; valuta: string }) {
  const max = Math.max(1, ...giorni.map((g) => g.totale));
  return (
    <div>
      <p className="mb-2 text-[11px] text-muted-foreground">Capitale investito dall'IA al giorno (14 gg)</p>
      <div className="flex h-20 items-end gap-1">
        {giorni.map((g) => (
          <div
            key={g.data}
            title={`${fmtGiorno(g.data)}: ${fmt(g.totale, valuta)}`}
            className={cn(
              "flex-1 rounded-sm transition-colors",
              g.totale > 0 ? "bg-primary/70 hover:bg-primary" : "bg-surface-2",
            )}
            style={{ height: `${Math.max(4, (g.totale / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{fmtGiorno(giorni[0]!.data)}</span>
        <span>{fmtGiorno(giorni[giorni.length - 1]!.data)}</span>
      </div>
    </div>
  );
}

function Pannello({ p }: { p: PannelloPiattaforma }) {
  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Wallet className="size-4 text-primary" />
        <h4 className="text-sm font-semibold">{p.nome}</h4>
        <span
          className={cn(
            "numeric rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest",
            p.ambiente === "reale" ? "bg-accent/15 text-accent" : "bg-primary/12 text-primary",
          )}
        >
          {p.ambiente}
        </span>
        {p.stato === "collegato" ? (
          <span className="numeric ml-auto text-xs text-muted-foreground">
            Valore <span className="font-semibold text-foreground">{fmt(p.valore, p.valuta)}</span>
            {" · "}liquidità {fmt(p.liquidita, p.valuta)}
          </span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-warn">
            <AlertTriangle className="size-3" /> non raggiungibile
          </span>
        )}
      </div>
      {p.messaggio && <p className="mt-1 text-[11px] text-muted-foreground">{p.messaggio}</p>}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Posizioni aperte ({p.posizioni.length})
          </p>
          {p.posizioni.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
              Nessuna posizione aperta
            </p>
          ) : (
            <ul className="space-y-1.5">
              {p.posizioni.slice(0, 6).map((x) => (
                <li key={x.ticker} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs">
                  <span className="font-semibold">{x.ticker}</span>
                  <span className="numeric text-muted-foreground">×{x.quantita}</span>
                  <span className="numeric ml-auto">{fmt(x.valore, p.valuta)}</span>
                  <span className={cn("numeric w-16 text-right", x.pnlPct >= 0 ? "text-bull" : "text-bear")}>
                    {x.pnlPct >= 0 ? "+" : ""}
                    {x.pnlPct.toFixed(2)}%
                  </span>
                </li>
              ))}
              {p.posizioni.length > 6 && (
                <li className="text-center text-[10px] text-muted-foreground">
                  + altre {p.posizioni.length - 6} posizioni
                </li>
              )}
            </ul>
          )}
        </div>
        <GraficoGiorni giorni={p.giorni} valuta={p.valuta} />
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[11px] text-muted-foreground">Ultimi ordini dell'IA ({p.ordini.length})</p>
        {p.ordini.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-[11px] text-muted-foreground">
            Nessun ordine negli ultimi 30 giorni
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {p.ordini.map((o) => (
              <li key={o.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                    o.lato === "buy" ? "bg-bull/12 text-bull" : "bg-bear/12 text-bear",
                  )}
                >
                  {o.lato === "buy" ? <ArrowUpRight className="size-3" /> : <ArrowDownLeft className="size-3" />}
                  {o.lato === "buy" ? "Acquisto" : "Vendita"}
                </span>
                <span className="font-semibold">{o.ticker}</span>
                <span className="numeric ml-auto">{fmt(o.importo, p.valuta)}</span>
                <span className="numeric w-20 text-right text-[10px] text-muted-foreground">
                  {fmtData(o.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function PannelliPiattaforme() {
  const { autenticato } = useSessione();
  const leggi = useServerFn(getPanoramicaPiattaforme);
  const panoramica = useQuery({
    queryKey: ["panoramica-piattaforme"],
    enabled: autenticato,
    queryFn: () => leggi(),
    refetchInterval: 60_000,
    retry: false,
  });

  if (!autenticato || !panoramica.data?.length) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold">Dove sta investendo l'IA</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        {panoramica.data.map((p) => (
          <Pannello key={`${p.piattaforma}-${p.ambiente}`} p={p} />
        ))}
      </div>
    </div>
  );
}
