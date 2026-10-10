import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, FileDown } from "lucide-react";
import { StatisticheStrategie, useStatistiche } from "@/components/StatisticheStrategie";
import { PannelloSegnali } from "@/components/PannelloSegnali";
import { getStrategia, STRATEGIE } from "@/lib/strategies";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Report settimanale — Althea" },
      {
        name: "description",
        content:
          "Riepilogo di ordini, segnali e capitali investiti per strategia, con esportazione in PDF.",
      },
      { property: "og:title", content: "Report settimanale — Althea" },
      {
        property: "og:description",
        content: "Ordini, segnali e capitali per strategia conservativa, media e aggressiva.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaReport,
});

function PaginaReport() {
  const [reale, setReale] = useState(false);
  const stat = useStatistiche(reale);
  const settimanaFa = Date.now() - 7 * 86_400_000;
  const ultimi = (stat.data?.ultimi ?? []).filter((o) => new Date(o.createdAt).getTime() >= settimanaFa);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="print:hidden">
        <Link to="/" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Torna alla dashboard
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Report settimanale</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ordini, segnali e capitali per strategia — conto {reale ? "reale" : "paper"}.
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface p-1">
            {[{ v: false, l: "Paper" }, { v: true, l: "Reale" }].map((m) => (
              <button
                key={m.l}
                onClick={() => setReale(m.v)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-medium",
                  reale === m.v ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {m.l}
              </button>
            ))}
          </div>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            <FileDown className="size-3.5" /> Esporta PDF
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        <StatisticheStrategie reale={reale} />

        <div className="panel p-6">
          <h3 className="text-sm font-semibold">Capitali per strategia</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {STRATEGIE.map((s) => {
              const r = stat.data?.riepilogo.find((x) => x.strategia === s.id);
              return (
                <div key={s.id} className="rounded-lg border border-border bg-surface-2 p-3 text-xs">
                  <p className="font-medium">{s.nome}</p>
                  <p className="numeric mt-1 text-lg font-semibold">{(r?.capitaleInvestito ?? 0).toFixed(2)} $</p>
                  <p className="numeric text-[10px] text-muted-foreground">
                    {r?.acquisti ?? 0} acquisti · {r?.vendite ?? 0} vendite
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel overflow-x-auto p-6">
          <h3 className="text-sm font-semibold">Ordini degli ultimi 7 giorni</h3>
          {ultimi.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Nessun ordine dell'IA questa settimana.</p>
          ) : (
            <table className="mt-3 w-full min-w-[640px] text-[11px]">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-1.5 text-left">Data</th>
                  <th className="text-left">Strategia</th>
                  <th className="text-left">Strumento</th>
                  <th className="text-left">Lato</th>
                  <th className="text-right">Importo</th>
                  <th className="text-right">Esito</th>
                </tr>
              </thead>
              <tbody>
                {ultimi.map((o) => (
                  <tr key={o.id} className="numeric border-b border-border/60">
                    <td className="py-1.5">{o.createdAt.slice(0, 16).replace("T", " ")}</td>
                    <td>{o.strategia}</td>
                    <td className="font-semibold">{o.ticker}</td>
                    <td className={o.lato === "buy" ? "text-bull" : "text-bear"}>{o.lato === "buy" ? "Acquisto" : "Vendita"}</td>
                    <td className="text-right">{o.importo.toFixed(2)} $</td>
                    <td className="text-right">{o.pnlPct == null ? "—" : `${o.pnlPct.toFixed(1)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {STRATEGIE.map((s) => (
          <div key={s.id} className="break-inside-avoid">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Segnali — {s.nome}</p>
            <PannelloSegnali reale={reale} universo={getStrategia(s.id).universo} />
          </div>
        ))}

      </div>
    </div>
  );
}
