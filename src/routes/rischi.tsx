import { createFileRoute } from "@tanstack/react-router";
import { PaginaLegale, Sezione } from "@/components/PaginaLegale";

export const Route = createFileRoute("/rischi")({
  head: () => ({
    meta: [
      { title: "Avvertenze sui rischi — Althea" },
      {
        name: "description",
        content:
          "Avvertenze sui rischi del trading automatico: possibile perdita totale del capitale, rischi tecnici, criptovalute e assenza di garanzie di rendimento.",
      },
      { property: "og:title", content: "Avvertenze sui rischi — Althea" },
      {
        property: "og:description",
        content: "Rischi del trading automatico e limiti del servizio Althea.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Rischi,
});

function Rischi() {
  return (
    <PaginaLegale titolo="Avvertenze sui rischi" aggiornata="7 settembre 2026">
      <p className="rounded-xl border border-warn/40 bg-warn/8 p-4 text-foreground">
        Il trading comporta un rischio elevato: puoi perdere l'intero capitale investito. Investi
        solo somme che puoi permetterti di perdere.
      </p>

      <Sezione titolo="Rischio di mercato">
        <p>
          Prezzi di azioni, ETF e criptovalute possono oscillare violentemente, anche per eventi
          imprevedibili. Un'operazione automatica può chiudersi in perdita e una serie di perdite
          può erodere rapidamente il capitale.
        </p>
      </Sezione>

      <Sezione titolo="Rischio delle strategie automatiche">
        <p>
          Le strategie si basano su regole tecniche applicate a dati storici e correnti. Non
          prevedono il futuro, non si adattano a ogni condizione di mercato e possono generare
          ordini frequenti, aumentando commissioni e slippage. Le simulazioni e i risultati
          storici non garantiscono risultati futuri.
        </p>
      </Sezione>

      <Sezione titolo="Rischio tecnico">
        <p>
          Interruzioni di rete, indisponibilità delle API del broker, ritardi nei dati di mercato,
          errori software o manutenzioni possono impedire l'invio, la modifica o la chiusura di un
          ordine nel momento voluto.
        </p>
      </Sezione>

      <Sezione titolo="Criptovalute">
        <p>
          Le cripto-attività sono altamente volatili, negoziate 24 ore su 24 e, in molti casi, non
          coperte dai sistemi di tutela previsti per gli strumenti finanziari tradizionali. Il
          rischio di perdita totale è concreto.
        </p>
      </Sezione>

      <Sezione titolo="Fiscalità e conformità">
        <p>
          Sei l'unico responsabile degli obblighi dichiarativi e fiscali derivanti dalla tua
          attività di investimento e del rispetto delle norme applicabili nel tuo Paese.
        </p>
      </Sezione>

      <Sezione titolo="Nessuna consulenza">
        <p>
          Althea è uno strumento software: non fornisce consulenza finanziaria e non gestisce il
          tuo denaro. Se hai dubbi, rivolgiti a un professionista autorizzato prima di investire.
        </p>
      </Sezione>
    </PaginaLegale>
  );
}
