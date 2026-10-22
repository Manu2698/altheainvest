# Conti paper archiviati + «Condivisione per analisi»

## Situazione attuale (verificata)
- Il «Confronto conti» raggruppa gli ordini solo per piattaforma + ambiente (es. "Alpaca paper"). Non sa *quale* conto paper li ha generati: gli ordini dei vecchi conti paper chiusi finiscono nel conto paper attuale, falsando vincite, perdite e risultato.
- Il registro ordini dell'IA non salva l'identificativo del conto del broker.
- Non esiste alcuna vista pubblica: ogni dato passa dall'accesso personale.

## Parte 1 — Conti attivi e archiviati
- Ogni ordine dell'IA registrerà anche il numero del conto del broker (Alpaca lo fornisce; per le altre piattaforme un'impronta delle chiavi, mai le chiavi).
- Nuovo elenco "conti conosciuti", identificati dal numero di conto restituito dal broker (non dalle chiavi). Cambiare chiavi non archivia nulla: se il broker conferma lo stesso numero di conto, resta lo stesso conto; se è un conto diverso, si aggiunge accanto (più conti possono essere attivi insieme).
- Un conto viene segnato **archiviato** solo se il broker conferma che è chiuso o inesistente. Se l'identità o lo stato non si possono verificare, il conto appare come "da confermare" e ti viene chiesto se archiviarlo.
- Gli ordini vecchi senza numero di conto vengono attribuiti al conto attivo solo se successivi al suo collegamento; quelli precedenti vanno in "Storico conti archiviati".
- «Confronto conti»: mostra solo i conti attivi; sotto, una sezione chiusa per default "Conti archiviati" con i loro risultati storici, chiaramente etichettata, esclusa dai totali.
- La logica d'investimento non cambia: si aggiunge solo un campo in scrittura.

## Parte 2 — Condivisione per analisi
**Creazione (solo tu, dalla dashboard)**
- Pannello «Condivisione per analisi»: elenco esplicito dei dati visibili (vedi sotto), scelta scadenza (1 ora, 24 ore, 7 giorni, 30 giorni), nome del link.
- Il link viene mostrato una sola volta, con pulsante Copia. Elenco dei link creati con stato (attivo / scaduto / revocato), ultima apertura e pulsante **Revoca** immediato.

**Cosa vede chi apre il link** (pagina in sola lettura, senza accesso)
- Stato dei collegamenti ai broker (collegato / errore / non collegato — mai le chiavi).
- Conti attivi e archiviati con badge PAPER / REALE, capitale, liquidità, posizioni.
- Storico operazioni dell'IA con motivo, segnale, esito.
- Strategie e impostazioni per conto (strategia, modalità capitale, limite di perdita, pausa) in sola lettura.
- Segnali, statistiche per strategia, grafici settimanali, curva del capitale, lezioni apprese dall'IA.
- Ogni blocco indica l'orario di lettura; se una piattaforma non risponde compare "dato non disponibile" o "non aggiornato da …".

**Cosa NON vede / non può fare**
- Nessun pulsante di ordine, avvio/ferma, modifica, collegamento o scollegamento.
- Nessuna email, nome, chiave, token, cookie o sessione; le chat dell'assistente sono escluse.

## Sicurezza
- Token casuale da 32 byte generato sul server; nel database si salva solo la sua impronta (hash SHA-256), mai il token.
- Ogni apertura viene verificata sul server: impronta, scadenza, revoca. Se non valido → pagina "Link scaduto o revocato".
- La vista usa una funzione server dedicata che restituisce solo un insieme fisso di campi già filtrati; non riusa la sessione del proprietario e non abilita alcuna funzione di scrittura.
- Limite di frequenza sulle aperture; la pagina non viene indicizzata (noindex) e non viene inviato il link come referrer.
- Registro eventi: "link creato" / "link revocato" / "link aperto" con id del link, scadenza e orario — mai il token.

## Dettagli tecnici
- Migrazione: colonna `conto_id` su `ordini_ia`; tabella `conti_broker` (user_id, piattaforma, ambiente, conto_id, stato attivo|archiviato, collegato_il, archiviato_il); tabella `link_condivisione` (id, user_id, nome, token_hash unico, scade_il, revocato_il, ultimo_accesso, creato_il) con RLS sul proprietario, nessun accesso anon.
- `salvaCredenziali`/collegamento Alpaca: registra conto e archivia il precedente. `eseguiCiclo`/`eseguiCicloEsterno`: scrivono `conto_id` (sola aggiunta).
- `riepilogoConti` separa `attivi` / `archiviati`.
- Server fn autenticate: `creaLink`, `listaLink`, `revocaLink`. Server fn pubblica `vistaCondivisa({token})`: hash → lookup con client admin → se valido compone un DTO in sola lettura riusando le letture esistenti.
- Route pubblica `/condivisione/$token` con head noindex; componenti di sola visualizzazione.
- Test: token scaduto/revocato rifiutato; DTO senza campi segreti; attribuzione ordini a conti archiviati.
- Durante lo sviluppo nessun ciclo IA o ordine verrà avviato.
