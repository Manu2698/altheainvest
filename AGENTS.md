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
- L'IA impara da vincite/perdite (`src/lib/apprendimento.ts`): lezioni da `ordini_ia` vendite degli ultimi 60 giorni per conto+strategia, applicate dopo `decide` in entrambi i motori — un solo punto di correzione. Ogni aumento di importo passa da `validaFuoriCampione` (`src/lib/metriche.ts`); le riduzioni di rischio no.
- Accounts are identified by the broker's stable account id (`conti_broker`, `ordini_ia.conto_id` + `conto_attribuzione`), never by platform+environment alone; accounts are never auto-archived — mismatches become `da_confermare` until the user confirms — and unattributed orders stay "non determinato", excluded from per-account comparisons.
- «Condivisione per analisi» links store only a SHA-256 of a 256-bit token (`link_condivisione`); the token travels in the URL fragment and is verified on every call by the public `vistaCondivisa` server fn, which builds a fixed read-only DTO (`src/lib/condivisione.server.ts`) — no session or write endpoint is ever reachable through it.

- Portfolio success metrics are computed by the pure `calcolaMetriche` in `src/lib/metriche.ts` (time-weighted, flow-adjusted, fees already in equity) — one tested source for net return, drawdown, volatility, benchmark and trade quality.
- Buy-side safety guards live in pure `src/lib/protezioni.ts` and run in `eseguiCiclo` after `decide`/`applicaLezioni`: unreadable account/positions/open orders/daily loss, stale (>4 days) or incoherent prices, or an open order on the ticker block new orders — they never change signals. The scheduled cycle runs only via `/api/public/jobs/ciclo-ia`, authenticated with `authenticateCronRequest`.
