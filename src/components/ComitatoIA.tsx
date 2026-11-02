import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAnalisiComitato } from "@/lib/agenti/comitato.functions";
import { useSessione } from "@/hooks/useSessione";
import { cn } from "@/lib/utils";

const NOMI: Record<string, string> = { fondamentale: "Analista fondamentale", tecnico: "Analista tecnico", news: "Analista news e sentiment" };

export function ComitatoIA({ reale }: { reale: boolean }) {
  const { autenticato } = useSessione();
  const fn = useServerFn(getAnalisiComitato);
  const q = useQuery({ queryKey: ["comitato", reale], enabled: autenticato, queryFn: () => fn({ data: { reale } }), refetchInterval: 60_000, retry: false });
  const righe = q.data ?? [];

  return (
    <div className="panel p-5">
      <h3 className="text-sm font-semibold">Comitato IA · decisioni sugli acquisti</h3>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Ogni acquisto proposto passa da 3 analisti, dal dibattito Bull/Bear, dal Risk Manager (veto assoluto) e dal Coordinatore. Le vendite di protezione restano automatiche.
      </p>
      {q.isError && <p className="mt-3 text-xs text-bear">Analisi non disponibili.</p>}
      {!q.isLoading && !righe.length && <p className="mt-3 text-xs text-muted-foreground">Nessuna analisi ancora per il conto collegato.</p>}
      <div className="mt-3 space-y-2">
        {righe.map((r) => (
          <details key={r.id} className="rounded-lg border border-border p-3">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold">{r.ticker}</span>
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", r.decisione === "BUY" ? "border-bull text-bull" : "border-border text-muted-foreground")}>{r.decisione === "BUY" ? "ACQUISTA" : "NON INTERVENIRE"}</span>
              {r.veto && <span className="rounded-full border border-bear px-2 py-0.5 text-[10px] font-semibold text-bear">VETO RISCHIO</span>}
              <span className="text-muted-foreground">Dibattito: {r.esito_dibattito ?? "—"}</span>
              <span className="ml-auto text-muted-foreground">{new Date(r.created_at).toLocaleString("it-IT")}</span>
            </summary>
            <p className="mt-2 text-xs">{r.motivo}</p>
            {r.errore && <p className="mt-1 text-[11px] text-bear">{r.errore}</p>}
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {(["fondamentale", "tecnico", "news"] as const).map((k) => {
                const a = r.agenti[k];
                return (
                  <div key={k} className="rounded-md border border-border p-2 text-[11px]">
                    <p className="font-semibold">{NOMI[k]} · {a?.voto ?? "nessuna risposta"}</p>
                    <p className="mt-1 text-muted-foreground">{a?.sintesi}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 space-y-1 text-[11px]">
              <p className="font-semibold">Dual Risk Debate</p>
              {r.dibattito.map((t, i) => (
                <div key={i} className={cn("rounded-md border-l-2 pl-2", t.agente === "bull" ? "border-bull" : "border-bear")}>
                  <p className="font-medium">{t.agente === "bull" ? "Bull" : "Bear"} · turno {t.turno} · {t.posizione}</p>
                  <ul className="list-disc pl-4 text-muted-foreground">{[...t.argomenti, ...t.risposteObiezioni].slice(0, 6).map((x, j) => <li key={j}>{x}</li>)}</ul>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-2 text-[11px] md:grid-cols-2">
              <div className="rounded-md border border-border p-2">
                <p className="font-semibold">Risk Manager · {r.agenti["rischio"]?.veto ? "veto" : `rischio ${r.agenti["rischio"]?.livello ?? "—"}`}</p>
                <ul className="list-disc pl-4 text-muted-foreground">{(r.agenti["rischio"]?.motivi ?? []).map((x, j) => <li key={j}>{x}</li>)}</ul>
              </div>
              <div className="rounded-md border border-border p-2">
                <p className="font-semibold">Coordinatore</p>
                <p className="text-muted-foreground">{r.agenti["coordinatore"]?.motivazione ?? "Non consultato (veto o dati mancanti)."}</p>
                {(r.agenti["coordinatore"]?.contraddizioni ?? []).length > 0 && <p className="mt-1">Contraddizioni: {r.agenti["coordinatore"]?.contraddizioni?.join("; ")}</p>}
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
