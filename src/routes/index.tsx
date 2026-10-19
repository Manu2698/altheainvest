import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BrainCircuit,
  Cpu,
  LineChart,
  Lock,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { AssetPicker } from "@/components/AssetPicker";
import { RuntimeErrorBoundary } from "@/components/RuntimeErrorBoundary";
import { BrokerConnect } from "@/components/BrokerConnect";
import { AuthBadge } from "@/components/AuthBadge";
import { MotoreIA } from "@/components/MotoreIA";
import { PiattaformeConnect } from "@/components/PiattaformeConnect";
import { PannelliPiattaforme } from "@/components/PannelliPiattaforme";
import { PannelloSegnali } from "@/components/PannelloSegnali";
import { StatisticheStrategie } from "@/components/StatisticheStrategie";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getContoBroker } from "@/lib/alpaca.functions";
import { useSessione } from "@/hooks/useSessione";


import { CapitalAllocator, type Allocazioni } from "@/components/CapitalAllocator";
import { EquityChart } from "@/components/EquityChart";
import { RiskMeter } from "@/components/RiskMeter";
import { TradeFeed } from "@/components/TradeFeed";
import { cn } from "@/lib/utils";
import {
  STRATEGIE,
  formatEuro,
  formatPct,
  generaEquity,
  generaOperazioni,
  getStrategia,
  type StrategyId,
} from "@/lib/strategies";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Althea — IA che investe in paper trading e conti reali" },
      {
        name: "description",
        content:
          "Un'intelligenza artificiale con tre correnti di pensiero — conservativo, medio e aggressivo — che opera in automatico su conto demo o reale.",
      },
      { property: "og:title", content: "Althea — IA di investimento automatico" },
      {
        property: "og:description",
        content:
          "Tre strategie IA (conservativo, medio, aggressivo), esecuzione automatica in paper trading o su conto reale.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const ICONE: Record<StrategyId, typeof ShieldCheck> = {
  conservativo: ShieldCheck,
  medio: LineChart,
  aggressivo: Zap,
};



const CHIAVE_STRATEGIA = "althea:strategia";

function Index() {
  const [attiva, setAttiva] = useState<StrategyId>("medio");
  const [capitale, setCapitale] = useState(1000);

  // Ripristina la strategia scelta l'ultima volta (dopo l'idratazione).
  useEffect(() => {
    const salvata = localStorage.getItem(CHIAVE_STRATEGIA);
    if (salvata === "conservativo" || salvata === "medio" || salvata === "aggressivo") {
      setAttiva(salvata);
    }
  }, []);

  const scegliStrategia = (id: StrategyId) => {
    setAttiva(id);
    try {
      localStorage.setItem(CHIAVE_STRATEGIA, id);
    } catch {
      /* storage non disponibile */
    }
  };

  const [allocazioni, setAllocazioni] = useState<Allocazioni>({
    conservativo: 40,
    medio: 40,
    aggressivo: 10,
  });
  const [reale, setReale] = useState(false);
  const [universi, setUniversi] = useState<Record<StrategyId, string[]>>(() =>
    Object.fromEntries(STRATEGIE.map((s) => [s.id, s.universo])) as Record<
      StrategyId,
      string[]
    >,
  );

  const { autenticato } = useSessione();
  const contoFn = useServerFn(getContoBroker);
  const conto = useQuery({
    queryKey: ["conto-broker", reale],
    enabled: autenticato,
    queryFn: () => contoFn({ data: { reale } }),
    refetchInterval: 60_000,
    retry: false,
  });
  const disponibile =
    conto.data && conto.data.stato === "collegato" ? conto.data.valorePortafoglio : 0;

  const strategia = getStrategia(attiva);
  const universo = universi[attiva];
  const capitaleStrategia = Math.round((capitale * allocazioni[attiva]) / 100);
  const equity = useMemo(
    () => generaEquity(strategia, Math.max(1, capitaleStrategia)),
    [strategia, capitaleStrategia],
  );
  const operazioni = useMemo(() => generaOperazioni(strategia, 8, universo), [strategia, universo]);

  const ultimo = equity[equity.length - 1]!;
  const rendimento =
    capitaleStrategia > 0 ? ((ultimo.valore - capitaleStrategia) / capitaleStrategia) * 100 : 0;
  const vsBenchmark = ((ultimo.valore - ultimo.benchmark) / ultimo.benchmark) * 100;
  const vincenti = operazioni.filter((o) => o.pnl > 0).length;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3.5">
          <BrainCircuit className="size-5 text-primary" />
          <span className="font-display text-base font-semibold tracking-tight">Althea</span>
          <span className="numeric hidden rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground sm:inline">
            autonomous trading
          </span>

          <div className="ml-auto flex items-center gap-1 rounded-full border border-border bg-surface p-1">
            {[
              { v: false, label: "Paper" },
              { v: true, label: "Reale" },
            ].map((m) => (
              <button
                key={m.label}
                onClick={() => setReale(m.v)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                  reale === m.v
                    ? m.v
                      ? "bg-accent text-accent-foreground"
                      : "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <Link
            to="/ordini"
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Ordini
          </Link>
          <Link
            to="/report"
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Report
          </Link>
          <Link
            to="/assistente"
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Assistente
          </Link>

          <AuthBadge />

        </div>
      </header>

      {/* Hero */}
      <section className="grid-lines border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
          <p className="numeric mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/8 px-3 py-1 text-[11px] uppercase tracking-widest text-primary">
            <Sparkles className="size-3" /> tre correnti di pensiero
          </p>
          <h1 className="max-w-3xl text-4xl leading-[1.05] font-semibold sm:text-6xl">
            Un'intelligenza artificiale che investe
            <span className="text-primary"> al posto tuo</span>, come vuoi tu.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            Scegli la mentalità con cui l'IA deve operare — prudente, equilibrata o
            aggressiva — e lasciala lavorare in automatico. Prima in paper trading, poi
            sul conto reale quando i risultati ti convincono.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Activity className="size-4" /> Apri la dashboard
            </a>
            <a
              href="#strategie"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 text-sm font-medium transition-colors hover:bg-surface-2"
            >
              Confronta le strategie
            </a>
          </div>

          <dl className="mt-14 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
            {[
              ["Operazioni/gg", "148"],
              ["Latenza segnale", "240 ms"],
              ["Mercati coperti", "12"],
              ["Uptime motore", "99,9%"],
            ].map(([k, v]) => (
              <div key={k} className="bg-surface px-4 py-4">
                <dt className="text-[11px] tracking-wide text-muted-foreground">{k}</dt>
                <dd className="numeric mt-1 text-lg font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Strategie */}
      <section id="strategie" className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-semibold sm:text-3xl">Le tre correnti di pensiero</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Lo stesso motore, tre modi opposti di leggere il mercato. Puoi attivarne una
          sola o dividere il capitale fra tutte.
        </p>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {STRATEGIE.map((s) => {
            const Icona = ICONE[s.id];
            const selezionata = s.id === attiva;
            return (
              <button
                key={s.id}
                onClick={() => scegliStrategia(s.id)}
                className={cn(
                  "panel group cursor-pointer p-6 text-left transition-all",
                  selezionata
                    ? "border-primary/60 shadow-[0_0_0_1px_var(--color-primary)]"
                    : "hover:border-border/80 hover:-translate-y-0.5",
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-xl",
                      s.id === "conservativo" && "bg-bull/12 text-bull",
                      s.id === "medio" && "bg-chart-2/15 text-chart-2",
                      s.id === "aggressivo" && "bg-warn/12 text-warn",
                    )}
                  >
                    <Icona className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold">{s.nome}</h3>
                    <p className="text-xs text-muted-foreground">{s.claim}</p>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  {s.descrizione}
                </p>

                <div className="mt-5 space-y-3">
                  <div>
                    <div className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
                      <span>Rischio</span>
                      <span className="numeric">{s.rischio}/10</span>
                    </div>
                    <RiskMeter livello={s.rischio} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Atteso</span>
                      <p className="numeric mt-0.5 font-semibold text-bull">
                        {s.rendimentoAtteso}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Drawdown max</span>
                      <p className="numeric mt-0.5 font-semibold text-bear">
                        {s.drawdownMax}
                      </p>
                    </div>
                  </div>
                </div>

                <ul className="mt-5 space-y-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
                  {s.regole.map((r) => (
                    <li key={r} className="flex gap-2">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                      {r}
                    </li>
                  ))}
                </ul>

                <span
                  className={cn(
                    "mt-5 block rounded-lg py-2 text-center text-xs font-semibold transition-colors",
                    selezionata
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  {selezionata ? "Strategia attiva" : "Attiva questa strategia"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Dashboard */}
      <section id="dashboard" className="border-t border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold sm:text-3xl">Dashboard operativa</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Profilo <span className="text-foreground">{strategia.nome}</span> ·{" "}
                <span className="numeric text-foreground">
                  {formatEuro(capitaleStrategia)}
                </span>{" "}
                allocati · conto{" "}
                <span className={reale ? "text-accent" : "text-primary"}>
                  {reale ? "reale" : "paper"}
                </span>{" "}
                · ultimi 180 giorni
              </p>
            </div>
            <span className="numeric inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground">
              <span className="size-2 animate-pulse rounded-full bg-bull" /> motore attivo
            </span>
          </div>

          {reale && (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/8 p-4 text-sm">
              <Lock className="mt-0.5 size-4 shrink-0 text-accent" />
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Modalità reale.</span> Per
                operare con capitale vero serve collegare un broker e completare la
                verifica dell'identità. Finché non lo fai, i dati mostrati restano
                simulati.
              </p>
            </div>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <CapitalAllocator
              disponibile={disponibile}
              capitale={capitale}
              setCapitale={setCapitale}
              allocazioni={allocazioni}
              setAllocazioni={setAllocazioni}
              attiva={attiva}
              onAttiva={scegliStrategia}
            />
            <RuntimeErrorBoundary area="broker">
              <BrokerConnect reale={reale} />
            </RuntimeErrorBoundary>
          </div>

          <div className="mt-4 grid gap-4">
            <RuntimeErrorBoundary area="statistiche">
              <StatisticheStrategie reale={reale} />
            </RuntimeErrorBoundary>
            <RuntimeErrorBoundary area="segnali">
              <PannelloSegnali reale={reale} universo={universo} />
            </RuntimeErrorBoundary>
            <RuntimeErrorBoundary area="piattaforme">
              <PiattaformeConnect reale={reale} />
            </RuntimeErrorBoundary>
            <RuntimeErrorBoundary area="pannelli piattaforme">
              <PannelliPiattaforme />
            </RuntimeErrorBoundary>
            <RuntimeErrorBoundary area="motore IA">
              <MotoreIA strategia={attiva} capitale={capitaleStrategia} />
            </RuntimeErrorBoundary>
          </div>




          <div className="mt-4 grid gap-4 lg:grid-cols-4">
            {[
              { k: "Valore portafoglio", v: formatEuro(ultimo.valore), c: "" },
              {
                k: "Rendimento periodo",
                v: formatPct(rendimento),
                c: rendimento >= 0 ? "text-bull" : "text-bear",
              },
              {
                k: "Vs S&P 500",
                v: formatPct(vsBenchmark),
                c: vsBenchmark >= 0 ? "text-bull" : "text-bear",
              },
              {
                k: "Operazioni vincenti",
                v: `${Math.round((vincenti / operazioni.length) * 100)}%`,
                c: "",
              },
            ].map((m) => (
              <div key={m.k} className="panel p-5">
                <p className="text-xs text-muted-foreground">{m.k}</p>
                <p className={cn("numeric mt-2 text-2xl font-semibold", m.c)}>{m.v}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <div className="panel p-5 lg:col-span-3">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Curva del capitale</h3>
                <span className="text-[11px] text-muted-foreground">
                  linea tratteggiata = benchmark
                </span>
              </div>
              <EquityChart dati={equity} />
            </div>

            <div className="panel p-5 lg:col-span-2">
              <div className="mb-1 flex items-center gap-2">
                <Cpu className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Log decisionale dell'IA</h3>
              </div>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Ogni operazione con la motivazione che l'ha generata.
              </p>
              <TradeFeed operazioni={operazioni} />
            </div>
          </div>

          <div className="mt-4">
            <RuntimeErrorBoundary area="universo investibile">
              <AssetPicker
                universo={universo}
                reale={reale}
                onChange={(u) => setUniversi((prev) => ({ ...prev, [attiva]: u }))}

              />
            </RuntimeErrorBoundary>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 py-10 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">Althea</p>
          <p className="mt-2 max-w-2xl">
            Althea è uno strumento software: non è un broker, una banca né un consulente
            finanziario e non detiene mai il tuo denaro, che resta sul conto del tuo
            intermediario. Alcuni dati mostrati sono simulati a scopo dimostrativo. Il
            trading comporta il rischio di perdita, anche totale, del capitale: i
            rendimenti passati o simulati non garantiscono risultati futuri. Nessun
            contenuto costituisce consulenza finanziaria. Non è prevista alcuna politica
            di rimborso.
          </p>
          <nav className="mt-5 flex flex-wrap gap-4">
            <Link to="/termini" className="hover:text-foreground">
              Termini e condizioni
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/cookie" className="hover:text-foreground">
              Cookie
            </Link>
            <Link to="/rischi" className="hover:text-foreground">
              Avvertenze sui rischi
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
