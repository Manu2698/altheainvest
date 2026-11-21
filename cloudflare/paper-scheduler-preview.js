const TARGET = "https://fix-dashboard-data-integrity-2026-11-13-altheainvest.emajpietro26.workers.dev/api/public/jobs/ciclo-ia";

export default {
  async scheduled(_event, env) {
    if (!env.ALTHEA_CRON_SECRET) {
      console.error("ALTHEA_CRON_SECRET is not configured; request skipped.");
      return;
    }

    const response = await fetch(TARGET, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.ALTHEA_CRON_SECRET}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(25_000),
    });

    const detail = (await response.text()).slice(0, 500);
    console.log(JSON.stringify({ target: TARGET, status: response.status, detail }));

    if (!response.ok) {
      throw new Error(`Althea Preview cron returned HTTP ${response.status}`);
    }
  },

  async fetch() {
    return new Response("Preview scheduler: cron-only endpoint.", { status: 404 });
  },
};
