import { createFileRoute } from "@tanstack/react-router";
import { PaginaLegale, Sezione } from "@/components/PaginaLegale";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Althea" },
      {
        name: "description",
        content:
          "Come Althea tratta i dati personali: account, chiavi API del broker, log tecnici, base giuridica, conservazione e diritti GDPR.",
      },
      { property: "og:title", content: "Privacy Policy — Althea" },
      {
        property: "og:description",
        content: "Informativa privacy GDPR di Althea: dati trattati, finalità e diritti.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <PaginaLegale titolo="Privacy Policy" aggiornata="7 settembre 2026">
      <p>
        Questa informativa descrive il trattamento dei dati personali degli utenti di Althea ai
        sensi del Regolamento (UE) 2016/679 (GDPR).
      </p>

      <Sezione titolo="1. Titolare del trattamento">
        <p>
          Il titolare del trattamento è <strong className="text-foreground">Emanuele Pietrobon</strong>,
          Italia. Per qualsiasi richiesta relativa ai dati personali puoi scrivere a{" "}
          <a href="mailto:emajpietro26@gmail.com" className="text-primary underline">
            emajpietro26@gmail.com
          </a>
          .
        </p>
      </Sezione>

      <Sezione titolo="2. Dati trattati">
        <p>
          <strong className="text-foreground">Dati di account:</strong> indirizzo email e
          identificativo utente, creati al momento della registrazione (anche tramite Google).
        </p>
        <p>
          <strong className="text-foreground">Chiavi API del broker:</strong> le credenziali che
          inserisci per collegare il tuo conto presso l'intermediario, conservate per consentire
          l'invio degli ordini che richiedi. Non le usiamo per altre finalità e puoi revocarle in
          qualsiasi momento dal tuo intermediario.
        </p>
        <p>
          <strong className="text-foreground">Dati di utilizzo e log tecnici:</strong>{" "}
          preferenze (strategia scelta, capitale impostato), ordini pianificati, esiti dei cicli
          automatici, errori applicativi con relativi dettagli tecnici, indirizzo IP e dati del
          browser generati dalle richieste al server.
        </p>
        <p>Non trattiamo consapevolmente dati di minori di 18 anni né categorie particolari di dati.</p>
      </Sezione>

      <Sezione titolo="3. Finalità e basi giuridiche">
        <p>
          Erogazione del Servizio, autenticazione e collegamento al tuo intermediario: esecuzione
          del contratto (art. 6.1.b GDPR). Sicurezza, prevenzione degli abusi, diagnostica degli
          errori e miglioramento tecnico: legittimo interesse (art. 6.1.f). Adempimenti di legge,
          incluse eventuali richieste delle autorità: obbligo legale (art. 6.1.c).
        </p>
      </Sezione>

      <Sezione titolo="4. Destinatari">
        <p>
          I dati possono essere trattati da fornitori tecnici che agiscono come responsabili del
          trattamento: il fornitore di hosting e infrastruttura applicativa, il fornitore del
          database e dell'autenticazione, e l'intermediario finanziario da te collegato, che
          riceve gli ordini e opera come titolare autonomo secondo la propria informativa. Non
          vendiamo dati personali e non li usiamo per profilazione pubblicitaria.
        </p>
      </Sezione>

      <Sezione titolo="5. Trasferimenti extra UE">
        <p>
          Alcuni fornitori possono trattare dati fuori dallo Spazio Economico Europeo. In tal caso
          il trasferimento avviene sulla base di decisioni di adeguatezza o di clausole
          contrattuali standard della Commissione europea.
        </p>
      </Sezione>

      <Sezione titolo="6. Conservazione">
        <p>
          I dati dell'account sono conservati finché l'account resta attivo e per il tempo
          necessario ad adempiere a obblighi di legge o a difendere un diritto in giudizio. I log
          tecnici ed errori sono conservati per un periodo limitato e poi cancellati o
          anonimizzati. Le chiavi API vengono eliminate quando le rimuovi o quando chiudi
          l'account.
        </p>
      </Sezione>

      <Sezione titolo="7. I tuoi diritti">
        <p>
          Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità dei dati e
          opporti al trattamento fondato sul legittimo interesse, scrivendo al contatto del
          titolare. Hai inoltre il diritto di proporre reclamo al Garante per la protezione dei
          dati personali.
        </p>
      </Sezione>

      <Sezione titolo="8. Cookie">
        <p>
          Il sito usa solo cookie e memoria locale tecnici. I dettagli sono nella Cookie Policy.
        </p>
      </Sezione>
    </PaginaLegale>
  );
}
