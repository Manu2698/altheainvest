<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- The trade assistant streams through the `/api/chat` server route (Bearer-verified, thread ownership checked) and injects the user's settings, IA order log, broker orders and account summary into the model instructions — keeps answers grounded in real data without tool loops.
- The daily loss limit is enforced inside `eseguiCiclo` (Alpaca `last_equity - equity`) and every caller pauses the automation row on `bloccoPerdita` — one check covers cron and manual cycles.
- Non-Alpaca brokers (Trading 212, Binance, Kraken, Coinbase, eToro) live behind one adapter interface in `src/lib/piattaforme.server.ts`; `eseguiCiclo` delegates to it when the account's platform is not alpaca. Automation settings are per account (piattaforma + ambiente) in `automazioni_conti`; `automazioni_ia` is deprecated.
- I pannelli "Dove sta investendo l'IA" leggono i conti live dagli adattatori in `src/lib/piattaforme.server.ts` (`panoramicaPiattaforme`) e gli ordini da `ordini_ia.piattaforma` — ogni nuova piattaforma deve scrivere la colonna `piattaforma` in `ordini_ia` e rientrare nella panoramica.
- L'IA impara da vincite/perdite (`src/lib/apprendimento.ts`): lezioni da `ordini_ia` vendite degli ultimi 60 giorni per conto+strategia, applicate dopo `decide` in entrambi i motori — un solo punto di correzione.
