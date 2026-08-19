import { CheckCircle2, KeyRound, Link2, ShieldCheck } from "lucide-react";

const PASSI = [
  {
    icona: KeyRound,
    titolo: "1 · Crea le chiavi API",
    testo:
      "Dal pannello del tuo broker (es. Alpaca) genera una coppia di chiavi in modalità paper: servono solo per leggere il conto e inviare ordini simulati.",
  },
  {
    icona: Link2,
    titolo: "2 · Collega il conto",
    testo:
      "Incolli le chiavi una volta sola: vengono salvate cifrate lato server e non passano mai dal browser.",
  },
  {
    icona: ShieldCheck,
    titolo: "3 · Passa al reale quando vuoi",
    testo:
      "Le stesse strategie girano sul conto reale con un limite di capitale che decidi tu. Puoi fermare il motore in qualsiasi momento.",
  },
];

export function BrokerConnect() {
  return (
    <div className="panel p-6">
      <div className="flex items-center gap-2">
        <Link2 className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Collega il tuo broker</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Oggi l'IA opera su dati simulati. Per farla operare davvero servono le chiavi API
        del broker.
      </p>

      <ol className="mt-5 space-y-4">
        {PASSI.map((p) => (
          <li key={p.titolo} className="flex gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-primary">
              <p.icona className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium">{p.titolo}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {p.testo}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-bull" />
        <span>
          Scrivimi in chat quando vuoi procedere: ti chiedo le chiavi in un modulo sicuro
          e attivo il collegamento con il broker.
        </span>
      </div>
    </div>
  );
}
