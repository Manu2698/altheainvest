# Rotazione automatica verso opportunità migliori

## Risultato richiesto
Una capacità interna dell'IA, senza pulsanti: quando manca liquidità per un acquisto ammissibile, valutare la vendita di una posizione in guadagno per finanziare un'opportunità migliore. Nessuna promessa di rendimento e nessun aumento del capitale o dei limiti.

## Verifica iniziale
- `decide` in `src/lib/trading.server.ts` gestisce già stop, uscite di trend e prese di profitto, ma non la rotazione per finanziare un altro strumento.
- `selezionaUniverso` in `src/lib/selezione.server.ts` ordina gli strumenti usando prezzi passati, momentum e volatilità. Questi punteggi non sono previsioni di profitto e non bastano a giustificare una nuova vendita.
- `confrontaFattore` in `src/lib/valutazione.ts` mantiene separata la valutazione offline: mancano ancora osservazioni pre-ingresso, costi allocati e confronti validati sufficienti per dichiarare un vantaggio.
- La vendita esistente chiude l'intera posizione: non va riutilizzata senza modifiche per una rotazione parziale.

## Primo intervento: proposta e test isolati
L'approvazione di questo piano autorizza soltanto un valutatore offline con test, non vendite o integrazione nel motore attivo.

1. Confrontare una posizione posseduta e un candidato con la stessa valuta e lo stesso orizzonte, usando stime tracciabili del rendimento netto e della loro incertezza. Non trasformare la distanza dalla media mobile in un guadagno atteso.
2. Considerare soltanto posizioni long con costo medio ed esecuzioni riconciliati e profitto stimato dopo i costi di uscita positivo. Il prezzo effettivo resta incerto fino all'esecuzione.
3. Valutare la rotazione soltanto se l'acquisto supera già segnali, controlli sui dati, negoziabilità, accumulo e limiti, e il solo impedimento è la liquidità. Non vendere per aggirare un limite personale, un blocco di rischio o un problema contabile.
4. Escludere confronti con costi, dati o validazione mancanti; conservare un motivo esplicito del mancato intervento. Confrontare anche la scelta di mantenere la posizione.
5. Testare il confronto netto e l'esclusione di perdite, dati incompleti, ordini pendenti, conti diversi, candidati non negoziabili e vantaggi annullati dai costi.

## Successiva integrazione, separata
Prima dell'attivazione presentare la regola quantitativa di vantaggio/affidabilità e ogni eventuale limite di rotazione, con risultati su dati cronologicamente separati. Nessuna nuova soglia viene scelta o applicata autonomamente.

- Verificare la pausa autorizzata e la conclusione dei cicli prima di cambiare il motore operativo; non dedurre lo stato attuale da vecchie osservazioni.
- Conservare la versione di riferimento e rendere la nuova politica disattivabile per rollback.
- Valutare la vendita della sola quantità necessaria, rispettando precisione e minimi del broker; le uscite ordinarie di rischio mantengono priorità.
- Usare il registro persistente, l'intento atomico e lo stesso identificativo stabile. Nessuna seconda vendita dopo timeout o stato incerto.
- Non considerare la vendita accettata come liquidità disponibile: attendere esecuzione e riconciliazione, poi verificare cash, buying power, posizioni, ordini pendenti e opportunità prima dell'acquisto. Non forzare l'acquisto se il segnale è cambiato.
- Azioni, ETF e crypto sono candidabili soltanto se il broker collegato supporta tutte le verifiche; gli adattatori esterni attualmente bloccati restano bloccati.

## Dettagli tecnici e verifiche
| File | Problema | Intervento minimo | Verifica |
| --- | --- | --- | --- |
| Nuovi `src/lib/rotazione.proposta.ts` e `.test.ts` | Confronto netto assente | Valutatore puro offline, non importato dal runtime | Casi ammessi e blocchi concreti, nessuna chiamata al broker |
| `src/lib/valutazione.ts` | Evidenza non ancora sufficiente | Riutilizzare la valutazione esistente senza duplicarla | Costi e periodi comparabili, holdout cronologico |
| `src/lib/trading.server.ts`, solo nella fase successiva | Nessun flusso vendita → riconciliazione → nuovo acquisto | Integrazione dopo autorizzazione e prove | Simulazioni di fill parziali, rifiuti, timeout, ripartenze e concorrenza |
| `src/lib/riconciliazione.server.ts`, solo se necessario nella fase successiva | Collegamento persistente fra le due operazioni | Proposta mirata separata prima di eventuali migrazioni | Recupero senza duplicazioni, acquisto solo con fondi effettivi |

## Non compreso nell'approvazione iniziale
Nessun ordine PAPER o reale, pubblicazione, modifica dei limiti, attivazione automatica o garanzia di profitto. I dati attuali non dimostrano ancora che la rotazione migliorerebbe i risultati.