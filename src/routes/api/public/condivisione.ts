import { createFileRoute } from "@tanstack/react-router";

// Porta di lettura per strumenti esterni (es. ChatGPT) che non eseguono
// JavaScript: la pagina /condivisione tiene il token nel frammento (#t=…),
// che i fetcher automatici non vedono. Qui il token arriva come ?t=… e la
// stessa verifica lato server (impronta, scadenza, revoca, limite di
// frequenza) restituisce il DTO in sola lettura come JSON.
// Il token non viene mai registrato nei log né restituito nella risposta.
export const Route = createFileRoute("/api/public/condivisione")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("t");
        const { apriVista, logCondivisione } = await import("@/lib/condivisione.server");
        try {
          const esito = await apriVista(token);
          const stato = esito.ok ? 200 : esito.motivo === "troppe_richieste" ? 429 : esito.motivo === "non_valido" ? 404 : 410;
          return Response.json(esito, {
            status: stato,
            headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" },
          });
        } catch (e) {
          logCondivisione(e);
          return Response.json({ ok: false, motivo: "errore" }, { status: 500, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
