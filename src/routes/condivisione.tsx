import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AlertTriangle, BrainCircuit, Eye } from "lucide-react";
import { vistaCondivisa } from "@/lib/condivisione.functions";
import type { VistaCondivisa } from "@/lib/condivisione.types";
import { BadgeAmbiente, QuadroConto, StoriciEIndeterminati, fmt, fmtData } from "@/components/RiepilogoConti";
import { EquityChart } from "@/components/EquityChart";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/condivisione")({
  head: () => ({
    meta: [
      { title: "Althea — vista condivisa in sola lettura" },
      { name: "description", content: "Vista in sola lettura di conti, strategie e prestazioni dell'IA di Althea, condivisa dal proprietario." },
      { property: "og:title", content: "Althea — vista condivisa per analisi" },
      { property: "og:description", content: "Conti, strategie e prestazioni dell'IA in sola lettura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: PaginaCondivisa,
});

const MOTIVI: Record<string, string> = {
  non_valido: "Link non valido.",
  scaduto: "Questo link è scaduto.",
  revocato: "Questo link è stato revocato dal proprietario.",
  troppe_richieste: "Troppe aperture in poco tempo: riprova tra qualche minuto.",
};

function Sezione({ titolo, children, nota }: { titolo: string; children: React.ReactNode; nota?: string }) {
  return (
    <section className="panel p-5">
      <h2 className="text-sm font-semibold">{titolo}</h2>
      {nota && <p className="mt-0.5 text-[11px] text-muted-foreground">{nota}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function PaginaCondivisa() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get("t");
    setToken(t ?? "");
  }, []);
  const leggi = useServerFn(vistaCondivisa);
  const q = useQuery({
    queryKey: ["vista-condivisa", token],
    enabled: token != null,
    queryFn: () => leggi({ data: { token: token! } }),
    refetchInterval: 60_000,
    retry: false,
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3.5">
          <BrainCircuit className="size-5 text-primary" />
          <span className="font-display text-base font-semibold">Althea</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            <Eye className="size-3" /> sola lettura
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-5 py-8">
        {token == null || q.isLoading ? (
          <p className="text-sm text-muted-foreground">Verifica del link in corso…</p>
        ) : q.isError ? (
          <p className="text-sm text-bear">Vista non disponibile al momento. Riprova più tardi.</p>
        ) : q.data && !q.data.ok ? (
          <div className="panel p-6 text-sm">
            <p className="font-semibold">{MOTIVI[q.data.motivo]}</p>
            <p className="mt-1 text-muted-foreground">Chiedi al proprietario un nuovo link.</p>
          </div>
        ) : q.data?.ok ? (
          <Vista v={q.data.vista} />
        ) : null}
      </main>
    </div>
  );
}

function Vista({ v }: { v: VistaCondivisa }) {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">{v.link.nome}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Dati reali letti ora dai broker e dal registro dell'IA · generata {fmtData(v.generataIl)} · si aggiorna ogni minuto · link valido fino al {fmtData(v.link.scadeIl)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Motore {v.motore.versione} (ultima modifica {v.motore.data}) · conti condivisi: {v.opzioni.reale ? "PAPER e REALE (mai sommati)" : "solo PAPER"}
          {!v.opzioni.importi && " · importi nascosti dal proprietario"}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          PAPER = conto di prova con denaro simulato dal broker; REALE = denaro vero. Nessun dato in questa pagina è dimostrativo.
        </p>
      </div>

      {v.avvisi.length > 0 && (
        <div className="rounded-xl border border-warn/40 bg-warn/8 p-4 text-xs">
          {v.avvisi.map((a) => (
            <p key={a} className="flex gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" />{a}</p>
          ))}
        </div>
      )}

      <Sezione titolo="Collegamenti ai broker">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {v.collegamenti.map((c) => (
            <div key={`${c.piattaforma}-${c.ambiente}`} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
              <span className="font-medium">{c.nome}</span>
              <BadgeAmbiente ambiente={c.ambiente} />
              <span className={cn("ml-auto", c.stato === "collegato" ? "text-bull" : c.stato === "errore" ? "text-bear" : "text-muted-foreground")}>{c.stato}</span>
            </div>
          ))}
        </div>
      </Sezione>

      <Sezione titolo="Confronto conti attivi" nota={`Aggiornato ${fmtData(v.confronto.aggiornatoIl)}. Solo ordini attribuiti con certezza a ciascun conto.`}>
        {v.confronto.attivi.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {v.confronto.attivi.map((c) => (
              <QuadroConto key={`${c.piattaforma}-${c.ambiente}`} c={{ ...c }} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Nessun conto attivo raggiungibile.</p>
        )}
        <StoriciEIndeterminati storici={v.confronto.storici} nonDeterminati={v.confronto.nonDeterminati} />
      </Sezione>

      <Sezione titolo="Motore e strategie per conto">
        <div className="space-y-3">
          {v.automazioni.length === 0 && <p className="text-xs text-muted-foreground">Nessuna impostazione salvata.</p>}
          {v.automazioni.map((a) => (
            <div key={`${a.piattaforma}-${a.ambiente}`} className="rounded-lg border border-border p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{a.nome}</span>
                <BadgeAmbiente ambiente={a.ambiente} />
                <span className={a.attivo ? "text-bull" : "text-muted-foreground"}>{a.attivo ? "automatico attivo" : "fermo"}</span>
                <span className="ml-auto text-muted-foreground">
                  strategia {a.strategia} · {a.modalita === "conto" ? "usa tutto il conto" : `limite ${fmt(a.capitale)}`} · perdita max/giorno {a.perditaMaxGiornaliera == null ? (v.opzioni.importi ? "nessuna" : "nascosta") : fmt(a.perditaMaxGiornaliera)}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">Ultimo ciclo: {fmtData(a.ultimoCiclo)} · impostazioni modificate {fmtData(a.modificatoIl)}</p>
              {a.pausaMotivo && <p className="mt-1 text-bear">In pausa dal {fmtData(a.pausaIl)}: {a.pausaMotivo}</p>}
              <p className="mt-1 text-muted-foreground">Apprendimento: {a.lezioni}</p>
              {a.ultimoEsito && (
                <details className="mt-2">
                  <summary className="cursor-pointer">Esito ultimo ciclo: {a.ultimoEsito.messaggio}</summary>
                  <ul className="mt-2 space-y-1">
                    {a.ultimoEsito.decisioni.map((d, i) => (
                      <li key={i} className="text-muted-foreground">
                        <span className="numeric text-foreground">{d.ticker}</span> · {d.azione}
                        {d.eseguito ? " · inviato" : ""} — {d.motivo}
                        {d.errore && <span className="text-bear"> · errore: {d.errore}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
      </Sezione>

      <Sezione titolo="Statistiche per strategia" nota="Tutti gli ordini registrati dall'IA, separati per PAPER e REALE.">
        <div className="grid gap-4 lg:grid-cols-2">
          {(v.opzioni.reale ? (["paper", "reale"] as const) : (["paper"] as const)).map((amb) => (
            <div key={amb}>
              <BadgeAmbiente ambiente={amb} />
              <table className="mt-2 w-full text-xs">
                <thead className="text-muted-foreground"><tr><th className="text-left">Strategia</th><th>Ordini</th><th>Acq.</th><th>Vend.</th><th>Vinte</th><th>Perse</th><th>Investito</th></tr></thead>
                <tbody className="numeric">
                  {v.strategie[amb].map((s) => (
                    <tr key={s.strategia} className="text-center"><td className="text-left">{s.strategia}</td><td>{s.ordini}</td><td>{s.acquisti}</td><td>{s.vendite}</td><td className="text-bull">{s.vincite}</td><td className="text-bear">{s.perdite}</td><td>{fmt(s.capitaleInvestito)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </Sezione>

      {v.curva && (
        <Sezione titolo="Curva del capitale (broker, 3 mesi)">
          {(v.opzioni.reale ? (["paper", "reale"] as const) : (["paper"] as const)).map((amb) => (
            <div key={amb} className="mb-4">
              <BadgeAmbiente ambiente={amb} />
              <EquityChart dati={v.curva![amb]} />
            </div>
          ))}
        </Sezione>
      )}

      {v.posizioni && (
        <Sezione titolo="Posizioni aperte">
          {v.posizioni.length === 0 ? <p className="text-xs text-muted-foreground">Nessuna posizione aperta.</p> : (
            <table className="w-full text-xs">
              <thead className="text-muted-foreground"><tr><th className="text-left">Conto</th><th className="text-left">Titolo</th><th>Quantità</th><th>Valore</th><th>P&L</th></tr></thead>
              <tbody className="numeric">
                {v.posizioni.map((p, i) => (
                  <tr key={i} className="text-center"><td className="text-left">{p.nome} {p.ambiente.toUpperCase()}</td><td className="text-left">{p.ticker}</td><td>{p.quantita == null ? "—" : fmt(p.quantita, "", 4)}</td><td>{fmt(p.valore)}</td><td className={p.pnlPct >= 0 ? "text-bull" : "text-bear"}>{fmt(p.pnlPct)}%</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Sezione>
      )}

      {v.ordiniIA && (
        <Sezione titolo="Registro decisioni dell'IA" nota="Ordini inviati dall'IA con segnale e motivazione (ultimi 300).">
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-surface text-muted-foreground"><tr><th className="text-left">Data</th><th className="text-left">Conto</th><th>Strategia</th><th>Titolo</th><th>Lato</th><th>Importo</th><th>P&L</th><th className="text-left">Segnale / motivo</th></tr></thead>
              <tbody>
                {v.ordiniIA.map((o, i) => (
                  <tr key={i} className="border-t border-border/50 align-top">
                    <td className="numeric whitespace-nowrap">{fmtData(o.createdAt)}</td>
                    <td>{o.piattaforma} {o.ambiente.toUpperCase()} · {o.conto}</td>
                    <td className="text-center">{o.strategia}</td>
                    <td className="numeric text-center">{o.ticker}</td>
                    <td className="text-center">{o.lato === "sell" ? "vendita" : "acquisto"}</td>
                    <td className="numeric text-center">{fmt(o.importo)}</td>
                    <td className={cn("numeric text-center", (o.pnlPct ?? 0) >= 0 ? "text-bull" : "text-bear")}>{o.pnlPct == null ? "—" : `${fmt(o.pnlPct)}%`}</td>
                    <td className="text-muted-foreground">{o.segnale ? <b className="text-foreground">{o.segnale}: </b> : null}{o.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sezione>
      )}

      {v.ordiniBroker && (
        <Sezione titolo="Ordini sul conto broker Alpaca" nota="Stato reale dal broker: eseguiti, rifiutati, annullati (ultimi 100 per conto).">
          {v.ordiniBroker.length === 0 ? <p className="text-xs text-muted-foreground">Nessun ordine disponibile.</p> : (
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-[11px]">
                <thead className="text-muted-foreground"><tr><th className="text-left">Data</th><th>Conto</th><th>Titolo</th><th>Lato</th><th>Stato</th><th>Quantità</th><th>Prezzo medio</th></tr></thead>
                <tbody className="numeric">
                  {v.ordiniBroker.map((o, i) => (
                    <tr key={i} className="border-t border-border/50 text-center"><td className="text-left">{fmtData(o.creatoIl)}</td><td>{o.ambiente.toUpperCase()}</td><td>{o.ticker}</td><td>{o.lato}</td><td>{o.stato}</td><td>{o.quantita == null ? "—" : fmt(o.quantita, "", 4)}</td><td>{o.prezzoMedio == null ? "—" : fmt(o.prezzoMedio)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Sezione>
      )}
    </>
  );
}
