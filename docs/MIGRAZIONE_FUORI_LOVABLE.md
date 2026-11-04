# Althea — migrazione fuori da Lovable

## Regole non negoziabili
- Lavorare solo su `migration/staging`; non fare merge o push su `main`.
- Nessun acquisto o servizio a pagamento; budget operativo richiesto: 0 €/mese.
- Nessun ordine reale durante sviluppo e collaudo. Le credenziali live non vanno usate nei test.
- Non caricare dump, credenziali broker, chiavi API o file `.env` nel repository.

## Stato verificato al 4 novembre 2026
- Branch `migration/staging` creato da `main`; tre commit iniziali isolano la configurazione locale: `.env` rimosso dal branch, `.env.example` presente, `.gitignore` aggiornato.
- Confronto GitHub: staging avanti di 3 commit e indietro di 0; solo `.env`, `.env.example` e `.gitignore` risultano modificati. `main` non è stato modificato.
- Backup `altheainvest_261104.backup` recuperato dalla Library, 2.155.959 byte, intestazione PostgreSQL Custom Archive (`PGDMP`). Non è stato ripristinato né verificato tramite restore.
- Nell'ambiente di lavoro non risultano disponibili `pg_restore`, `psql`, `postgres` o Docker. Non dichiarare il database migrato finché non viene eseguito un restore reale e controllato.

## Dipendenze Lovable individuate nel codice
1. AI: `src/lib/ai/assistente.server.ts` e `src/lib/agenti/comitato.server.ts` usano `https://ai.gateway.lovable.dev/v1`, modello `openai/gpt-6-astra` e `LOVABLE_API_KEY`. Il comitato usa anche il connettore gateway Financial Modeling Prep tramite credenziale Lovable.
2. Login Google: `src/integrations/lovable/index.ts` usa `@lovable.dev/cloud-auth-js`; la pagina `src/routes/auth.tsx` lo invoca. Login email/password passa invece da Supabase Auth.
3. Database: il codice usa Supabase URL, publishable key e service-role key; le query dipendono da Supabase Auth, ruoli `authenticated` / `service_role`, `auth.uid()`, RLS e funzioni SQL.
4. Scheduler: `src/integrations/supabase/cron-auth.ts` usa `LOVABLE_CRON_SECRET`; `/api/public/jobs/ciclo-ia` si aspetta un POST autenticato ogni minuto.
5. Build: `vite.config.ts` dipende da `@lovable.dev/vite-tanstack-config`.
6. Drizzle: `drizzle.config.ts` dipende da `LOVABLE_DB_MIGRATION_URL`, mentre `drizzle/schema.ts` è vuoto e le migrazioni effettive sono in `drizzle/migrations` e `supabase/migrations`. La storia delle migrazioni va riconciliata prima di applicare DDL.

## Ordine di lavoro sicuro
1. Ripristinare il dump in un PostgreSQL di staging isolato, senza connessione alla produzione; controllare TOC, schemi, tabelle, righe, indici, trigger, funzioni, RLS, ruoli e auth/storage.
2. Verificare se il dump contiene gli schemi Supabase gestiti (`auth`, `storage`, ecc.) e stabilire come migrare utenti, hash password, provider OAuth, sessioni e file. Non presumere che copiare le tabelle pubbliche basti.
3. Ricostruire una fonte di verità unica per schema e migrazioni; confrontare il risultato del dump con tutte le migrazioni SQL presenti.
4. Sostituire login Lovable con OAuth Supabase standard configurato autonomamente; testare login email, Google, callback, reset password e RLS.
5. Sostituire il gateway AI con un provider OpenAI-compatible configurabile e una modalità locale Ollama; rimuovere header, run-id e endpoint specifici Lovable. Non attivare chiamate o ordini reali.
6. Sostituire configurazione Vite Lovable con plugin standard compatibili e testare build SSR.
7. Spostare scheduler su cron controllato dall'host, mantenendo autenticazione forte, lease e idempotenza; tenerlo disattivato finché non si completa la verifica paper.
8. Eseguire test automatici e manuali in paper; solo dopo valutare una migrazione controllata dei dati e del dominio.

## Bloccanti e limiti
- Il dump è disponibile ma non è stato ripristinato: il prossimo requisito tecnico è un ambiente PostgreSQL compatibile con `pg_restore`. Non usare il database Lovable di produzione come destinazione di test.
- Non è possibile garantire hosting cloud, database, AI remota e uptime gratuiti per sempre senza dipendere da limiti o cambi di piano di terzi. Per rispettare davvero 0 €/mese senza carta, la prima prova deve essere locale; l'accessibilità pubblica continua richiederà una scelta separata e trasparente.
- Le credenziali live e gli ordini reali restano disabilitati durante la migrazione.
