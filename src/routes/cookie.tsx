import { createFileRoute } from "@tanstack/react-router";
import { PaginaLegale, Sezione } from "@/components/PaginaLegale";

export const Route = createFileRoute("/cookie")({
  head: () => ({
    meta: [
      { title: "Cookie Policy — Althea" },
      {
        name: "description",
        content:
          "Althea usa solo cookie e memoria locale tecnici, necessari per l'accesso e le preferenze. Nessun cookie di profilazione o pubblicitario.",
      },
      { property: "og:title", content: "Cookie Policy — Althea" },
      {
        property: "og:description",
        content: "Elenco dei cookie tecnici usati da Althea e come gestirli.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Cookie,
});

function Cookie() {
  return (
    <PaginaLegale titolo="Cookie Policy" aggiornata="7 settembre 2026">
      <p>
        Althea utilizza esclusivamente cookie e tecnologie equivalenti (memoria locale del
        browser) di natura <strong className="text-foreground">tecnica e necessaria</strong>. Per
        questi strumenti la normativa non richiede il consenso preventivo: è sufficiente
        l'informativa che leggi in questa pagina. Non utilizziamo cookie di profilazione,
        pubblicitari, di social network o di analisi di terze parti.
      </p>

      <Sezione titolo="Strumenti utilizzati">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="text-foreground">Sessione di accesso</span> — memorizza il token che
            ti mantiene autenticato. Necessario: senza, non puoi accedere all'area riservata.
            Durata: fino al logout o alla scadenza della sessione.
          </li>
          <li>
            <span className="text-foreground">althea:strategia</span> — ricorda l'ultima strategia
            che hai scelto (conservativa, media, aggressiva). Durata: fino a cancellazione.
          </li>
          <li>
            <span className="text-foreground">althea:cookie-consenso</span> — ricorda che hai
            preso visione di questa informativa, così l'avviso non ricompare. Durata: fino a
            cancellazione.
          </li>
          <li>
            <span className="text-foreground">Sicurezza delle richieste</span> — cookie tecnici
            usati per proteggere il sito da richieste fraudolente. Durata: sessione.
          </li>
        </ul>
      </Sezione>

      <Sezione titolo="Come disattivarli">
        <p>
          Puoi cancellare o bloccare cookie e memoria locale dalle impostazioni del tuo browser.
          Tieni presente che, trattandosi di strumenti tecnici, la loro disattivazione può
          impedire l'accesso all'account e il corretto funzionamento del sito.
        </p>
      </Sezione>

      <Sezione titolo="Modifiche">
        <p>
          Se in futuro introdurremo strumenti di analisi o di marketing, questa pagina sarà
          aggiornata e ti verrà richiesto un consenso preventivo, libero e revocabile.
        </p>
      </Sezione>
    </PaginaLegale>
  );
}
