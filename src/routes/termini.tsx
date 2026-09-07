import { createFileRoute } from "@tanstack/react-router";
import { PaginaLegale, Sezione } from "@/components/PaginaLegale";

export const Route = createFileRoute("/termini")({
  head: () => ({
    meta: [
      { title: "Termini e condizioni — Althea" },
      {
        name: "description",
        content:
          "Termini e condizioni d'uso di Althea: nessuna consulenza finanziaria, nessuna garanzia di risultato, nessuna responsabilità per perdite di capitale e nessuna politica di rimborso.",
      },
      { property: "og:title", content: "Termini e condizioni — Althea" },
      {
        property: "og:description",
        content: "Condizioni d'uso, limitazione di responsabilità e assenza di rimborsi.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Termini,
});

function Termini() {
  return (
    <PaginaLegale titolo="Termini e condizioni" aggiornata="7 settembre 2026">
      <p>
        Questi Termini regolano l'uso del sito e del software Althea (di seguito "il Servizio").
        Usando il Servizio dichiari di averli letti, compresi e accettati integralmente. Se non li
        accetti, non usare il Servizio.
      </p>

      <Sezione titolo="1. Natura del Servizio">
        <p>
          Althea è uno strumento software che consente all'utente di collegare, tramite chiavi API
          fornite dall'utente stesso, un proprio conto presso un intermediario terzo (ad esempio
          Alpaca) e di automatizzare l'invio di ordini secondo regole tecniche predefinite.
        </p>
        <p>
          Althea <strong className="text-foreground">non è</strong> una banca, un intermediario
          finanziario, un broker, un gestore patrimoniale, un consulente finanziario né un
          soggetto autorizzato alla prestazione di servizi di investimento. Althea non detiene,
          non riceve e non trasferisce mai denaro o strumenti finanziari degli utenti: il capitale
          resta sempre sul conto dell'utente presso l'intermediario, soggetto ai termini di
          quest'ultimo.
        </p>
      </Sezione>

      <Sezione titolo="2. Nessuna consulenza finanziaria">
        <p>
          Nessun contenuto, segnale, punteggio, grafico, selezione automatica di strumenti,
          statistica o messaggio generato dal Servizio costituisce consulenza in materia di
          investimenti, raccomandazione personalizzata, sollecitazione al pubblico risparmio,
          ricerca in materia di investimenti o offerta di acquisto o vendita di strumenti
          finanziari. Ogni decisione di investimento è assunta esclusivamente dall'utente, sotto
          la sua unica ed esclusiva responsabilità.
        </p>
      </Sezione>

      <Sezione titolo="3. Rischio di perdita e assenza di garanzie">
        <p>
          Il trading di azioni, ETF, criptovalute e altri strumenti comporta un{" "}
          <strong className="text-foreground">rischio elevato di perdita, anche totale, del
          capitale investito</strong>. I risultati passati, storici, simulati o ipotetici non
          costituiscono in alcun modo indicazione o garanzia di risultati futuri.
        </p>
        <p>
          Il Servizio è fornito "così com'è" e "come disponibile", senza garanzie di alcun tipo,
          espresse o implicite, incluse a titolo esemplificativo le garanzie di commerciabilità,
          idoneità a uno scopo specifico, continuità, accuratezza dei dati di mercato, assenza di
          errori o di interruzioni.
        </p>
      </Sezione>

      <Sezione titolo="4. Limitazione di responsabilità">
        <p>
          Nella misura massima consentita dalla legge applicabile, il titolare del Servizio non
          risponde in alcun caso di perdite di capitale, mancati guadagni, perdite di opportunità,
          danni diretti, indiretti, incidentali, speciali, punitivi o consequenziali derivanti da
          o connessi a: l'uso o l'impossibilità di uso del Servizio; ordini inviati, non inviati,
          duplicati, eseguiti a prezzi diversi da quelli attesi o eseguiti in ritardo; errori,
          ritardi, indisponibilità o inesattezze dei dati di mercato o delle API di terzi;
          malfunzionamenti, bug, interruzioni, manutenzioni o cessazione del Servizio; decisioni
          di trading assunte dall'utente sulla base delle informazioni mostrate; comportamenti,
          restrizioni, commissioni o insolvenze dell'intermediario collegato.
        </p>
        <p>
          Ove una limitazione di responsabilità non fosse ammessa dalla legge, la responsabilità
          complessiva del titolare è comunque limitata all'importo eventualmente pagato
          dall'utente per il Servizio nei dodici mesi precedenti l'evento. Nulla in questi Termini
          esclude la responsabilità per dolo o colpa grave, né i diritti inderogabili riconosciuti
          ai consumatori dalla legge.
        </p>
      </Sezione>

      <Sezione titolo="5. Nessun rimborso">
        <p>
          Salvo quanto imposto da norme inderogabili a tutela dei consumatori, tutti gli eventuali
          pagamenti effettuati per il Servizio sono definitivi e{" "}
          <strong className="text-foreground">non rimborsabili</strong>: non è prevista alcuna
          refund policy. In nessun caso il titolare rimborsa, compensa o ripiana perdite di
          trading, commissioni, spread, slippage o imposte sostenute dall'utente.
        </p>
        <p>
          Per i contenuti digitali forniti immediatamente, l'utente consumatore che attiva il
          Servizio riconosce e accetta espressamente la perdita del diritto di recesso ai sensi
          della normativa applicabile.
        </p>
      </Sezione>

      <Sezione titolo="6. Requisiti dell'utente">
        <p>
          Per usare il Servizio devi avere almeno 18 anni, agire in nome proprio e avere piena
          capacità di agire. Devi usare il Servizio solo dove è lecito farlo e nel rispetto delle
          leggi applicabili, incluse quelle fiscali, antiriciclaggio e sugli abusi di mercato. Il
          Servizio non è rivolto a soggetti residenti in giurisdizioni in cui la sua fruizione
          sarebbe contraria alla legge.
        </p>
      </Sezione>

      <Sezione titolo="7. Account, chiavi API e sicurezza">
        <p>
          Sei responsabile della riservatezza delle tue credenziali di accesso e delle chiavi API
          del tuo intermediario. Ti consigliamo di usare chiavi con i permessi minimi necessari e
          di iniziare in modalità paper trading. Puoi revocare le chiavi in qualsiasi momento dal
          tuo intermediario: da quel momento il Servizio non potrà più inviare ordini.
        </p>
      </Sezione>

      <Sezione titolo="8. Uso consentito">
        <p>
          È vietato: usare il Servizio per manipolare il mercato o per operazioni illecite;
          tentare di accedere ad account o dati altrui; eseguire reverse engineering, scraping
          massivo o attacchi al Servizio; rivendere o ridistribuire il Servizio senza
          autorizzazione scritta.
        </p>
      </Sezione>

      <Sezione titolo="9. Sospensione e modifiche">
        <p>
          Il titolare può modificare, sospendere o cessare il Servizio, in tutto o in parte, anche
          senza preavviso, e può sospendere account che violino questi Termini. I Termini possono
          essere aggiornati: la versione pubblicata su questa pagina è quella vigente e l'uso
          continuato del Servizio ne comporta accettazione.
        </p>
      </Sezione>

      <Sezione titolo="10. Proprietà intellettuale">
        <p>
          Software, interfaccia, marchi e contenuti del Servizio sono di titolarità del gestore o
          dei rispettivi licenzianti. All'utente è concessa una licenza personale, non esclusiva,
          non trasferibile e revocabile d'uso del Servizio.
        </p>
      </Sezione>

      <Sezione titolo="11. Legge applicabile e foro">
        <p>
          Questi Termini sono regolati dalla legge italiana. Per le controversie è competente il
          foro del luogo di residenza o domicilio del consumatore, se applicabile; negli altri
          casi il foro della sede del titolare. Restano fermi i diritti inderogabili del
          consumatore e la possibilità di ricorrere alla piattaforma europea ODR.
        </p>
      </Sezione>

      <Sezione titolo="12. Contatti">
        <p>
          Per qualsiasi comunicazione relativa a questi Termini puoi scriverci all'indirizzo di
          contatto indicato nella Privacy Policy. Ti invitiamo a inserire il tuo indirizzo email e
          i dati identificativi del titolare prima della pubblicazione definitiva.
        </p>
      </Sezione>
    </PaginaLegale>
  );
}
