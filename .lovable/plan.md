# Althea: audit verificabilità e interventi minimi

## Esito attuale
Non è possibile confermare tutti i requisiti richiesti. Verifica in sola lettura e **102 test isolati superati su 12 file**; nessun ordine inviato, nessun conto o limite modificato, nessuna pubblicazione. I test software non dimostrano un vantaggio economico.

### Dati persistiti verificati il 22 ottobre 2026, circa 20:28–20:29 UTC
- Conto PAPER: **46 ordini** (45 `filled`, 1 `accepted`), tutti con ID broker e data di sincronizzazione. Lo stato sincronizzato non significa che l'ordine sia concluso o la contabilità completa.
- Nessun gruppo duplicato di client ID o ID di esecuzione nei dati letti. Questo non prova assenza di concorrenza in ogni scenario.
- Ultima istantanea esaminata: **incompleta**, equity 49,91 USD, liquidità 12,26 USD, 8 posizioni con valore complessivo 37,655134 USD; differenza −0,005134 USD, che non si riconcilia al centesimo secondo il controllo attuale. La contabilità salvata è `{}`: costo medio/P&L storico non certificabili. Il motivo persistito è generico e non identifica quale lettura sia mancata.
- Automazione PAPER salvata: attiva; capitale configurato 500 USD, perdita giornaliera **20 USD**, circa 40,1% di 49,91 USD. Non coincide con i 50 USD citati nel brief. Nessuna soglia modificata. Il capitale configurato è un tetto/impostazione, non denaro creato; il budget operativo dipende anche dalla modalità e dai fondi effettivi.
- Le funzioni di lock presenti nel database confermano la granularità per utente/broker/ambiente. Non esistono colonne di versione/parametri nel registro ordini esaminato.

## Già implementato: conservare, non duplicare
- Cron e ciclo manuale convergono su `eseguiCiclo`: lease condiviso, intento persistito prima del POST, client ID per acquisti e vendite, verifica proprietario e recupero senza reinvio automatico di esiti incerti.
- ID univoci per ordini/fill, controllo quantità/prezzo ponderato, ricostruzione costo medio, blocco del ciclo con istantanea incompleta o ordini pendenti.
- Budget con posizioni e impegni pendenti, cash, buying power e limiti personali; controllo pre-invio e limiti successivi all'apprendimento.
- Prezzi obsoleti/futuri/incoerenti, pagine fallite, split, negoziabilità/frazionabilità controllati. Non modificare le formule dei segnali.
- Rendimento TWR corretto per flussi, fee già nell'equity non sottratte due volte; risultati incompleti nascosti. Nel nuovo report l'aspettativa netta rimane assente se le fee non sono allocate.
- Aumenti non cumulabili, riduzioni di rischio preservate; confronti offline non collegati all'invio ordini.

## Difetti e interventi, in ordine
L'approvazione avvia **solo il primo intervento**. Le fasi successive restano separate, con nuova descrizione prima di modifiche ampie o operative.

### 1. Minimo: impedire lezioni da osservazioni incomplete
**Problema:** `leggiLezioni` controlla soltanto l'età, non `stato`, errore della lettura istantanea o data futura/non valida. Può accettare vendite presenti in un'osservazione globalmente incompleta. Il blocco iniziale del ciclo limita oggi la raggiungibilità, ma la funzione di apprendimento non impone autonomamente il requisito.

**File:** `src/lib/apprendimento.ts`, nuovo test mirato accanto a `apprendimento.test.ts`.

**Soluzione minima:** richiedere lettura riuscita, istantanea `riconciliato`, data valida/non futura, freschezza già esistente e query ordini non troncata. In caso contrario restituire lezioni neutre. Nessuna modifica a moltiplicatori, formule di acquisto/vendita, capitale o soglie.

**Test:** istantanea fresca ma incompleta con vendite apparentemente valide → nessuna lezione; query fallita, data futura/illeggibile o dati troncati → nessuna lezione; istantanea valida → comportamento esistente. Tutto con dati sintetici e richieste simulate, nessun broker.

### 2. Riconciliazione e concorrenza: correggere solo con prove isolate
**Problemi:** lock separati fra utenti sullo stesso conto fisico; esiti `non_inviato`/`rifiutato_http` saltati dalla sincronizzazione ma ancora bloccati dal predicato SQL quando `riconciliato_il` è nullo; diagnosi contabile generica; limite giornaliero riletto durante analisi ma pre-invio usa il valore iniziale.

**File:** `riconciliazione.server.ts`, `riconciliazione.ts`, `trading.server.ts`, nuova migrazione additiva per lock fisico e funzione di intenti; test `lease.test.ts`, `riconciliazione.test.ts`, test offline di orchestrazione.

**Minimo proposto:** diagnosticare separatamente cause mancanti; lock su ID broker verificato mantenendo proprietà utente; distinguere prova certa di mancato invio da esito incerto senza dedurre uno sblocco da 404/timeout; applicare l'ultimo limite salvato prima di ogni invio senza cambiarne il valore. Non allentare il controllo al centesimo e non inventare base di costo.

**Test:** due utenti stesso conto → un solo intento; conti diversi e PAPER/REALE indipendenti; riavvio dopo timeout → recupero stesso ID senza nuovo POST; rifiuto definitivo versus esito incerto; lease scaduto; riduzione salvata del limite durante analisi; dati mancanti → zero invii. Concorrenza verificata in ambiente isolato, non sui conti dell'utente.

### 3. Provenienza e apprendimento: prima versioni, poi proposte
**Problemi:** vendite terminali non equivalgono a intere posizioni chiuse; attribuzione alla strategia della vendita anche con acquisti precedenti diversi; aumento possibile con P&L percentuale lordo, senza confronto netto controllato; mancano versione immutabile e rollback riproducibile.

**File:** `contabilita.ts`, `esecuzioni.ts`, `apprendimento.ts`, `riconciliazione.server.ts`, nuova migrazione additiva per versioni/configurazioni e provenienza; test contabili e apprendimento.

**Minimo proposto:** distinguere esiti delle singole vendite da round-trip; conservare versione/configurazione effettiva all'intento e associazione degli ingressi; mantenere storico legacy senza attribuzioni inventate; configurazione di riferimento immutabile e ripristino esplicito. Gli aumenti richiedono prove nette comparabili, separate dai dati che hanno generato la modifica.

**Non applicato:** disattivare o cambiare gli aumenti attuali, vietare ricariche su posizioni perdenti, cambiare stop o permettere uscite durante un blocco globale. Questi sono cambi operativi: verranno proposti separatamente. Oggi `decide` può ricomprare un titolo in perdita sopra lo stop; non è una regola validata di averaging-down.

**Test:** acquisto sotto versione A/vendita sotto B, lotti misti, vendita parziale con posizione ancora aperta, duplicati/confitti, costi sconosciuti → nessuna promozione, ripristino esatto della configurazione autorizzata, limiti successivi a qualunque lezione.

### 4. Esposizione: iniziare in sola lettura
**Problema:** esposizione totale/impegni sono già usati per i fondi, ma settori, emittenti condivisi e fattori comuni/correlazioni non sono misurati. Limiti indipendenti di concentrazione/settore/posizioni non attivi.

**File:** `valutazione.functions.ts`, `ValutazioneStrategie.tsx`, piccolo modulo puro per esposizione e test; riutilizzare le osservazioni persistite.

**Minimo proposto:** mostrare valore e quota per titolo, totale e capitale pendente; aggregazioni per settore/fattore soltanto con fonti datate verificabili. Dati sconosciuti restano sconosciuti, non “diversificati”. Nessuna nuova pagina o limite automatico. Proporre limiti coerenti con equity e minimo d'ordine e richiedere conferma prima di applicarli.

**Test:** stesso emittente/titoli diversi, esposizione assoluta, pendenti e parziali senza doppio conteggio, classificazioni mancanti, conto piccolo, nessuna modifica dei limiti.

### 5. Validazione e backtest realistico, non una simulazione rinominata
**Problemi:** `report.server.ts:simula` è buy-and-hold ipotetico sulle posizioni attuali, non replay di `decide`; date approssimate e dati mancanti rappresentati come capitale fermo, fee finali non riflesse nella curva. Nel confronto offline il candidato viene risuddiviso dopo il filtro; le curve sono confrontate solo per date/valori, senza provenienza.

**Primo minimo — file:** `valutazione.ts`, `valutazione.test.ts`: unico confine cronologico per base/candidato, niente nuova divisione del campione filtrato, provenance obbligatoria per curve/conti/versioni/capitale/flussi/costi e legame al holdout. Nessuna promozione con date nulle o prove incomplete.

**Test:** fattore raro non sposta il holdout; esiti training che attraversano il confine esclusi/bloccati; capitali/flussi/versioni/costi diversi → confronto non valido; campione insufficiente e fee mancanti → nessun miglioramento.

**Replay più ampio — dopo i prerequisiti:** modulo offline con regole reali, serie datate e universo point-in-time, costi verificabili o stime etichettate, esecuzione dalla barra successiva, vincoli fondi/frazioni/pendenti, gap/parziali/calendario e versioni congelate di dati, costi e configurazione.

**Test:** nessun dato futuro, ingressi ritardati, titoli delistati e split, costi una sola volta, curve e totale coincidenti, liquidità insufficiente, benchmark sul medesimo periodo, più regimi quando disponibili. Risultati con numero di operazioni, dipendenza fra esiti e incertezza; mai promozione dal solo tasso di vincita.

**Bloccanti attuali:** osservazioni pre-ingresso e universo storico non archiviati, costi per trade incompleti, nessuna curva candidata riproducibile. Un backtest positivo non autorizza trading reale e non garantisce profitti futuri.

## Criteri di completamento del primo intervento
- Test mirati e suite esistente superati; nessuna modifica alle regole operative né allo schema.
- Consegna di file, difetto risolto e test.
- Rimangono espliciti i blocchi delle fasi successive: nessuna affermazione che ogni ordine/account sia definitivamente riconciliato o che la strategia sia profittevole.
- Nessun ordine reale/PAPER, nessuna pubblicazione; cambi piccoli e separati per poter tornare alla versione precedente.