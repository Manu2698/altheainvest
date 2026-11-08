import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },

  // Scheduler Cloudflare: esegue esclusivamente il job protetto dal segreto cron.
  async scheduled(
    controller: { cron: string; scheduledTime: number },
    env: { ALTHEA_CRON_SECRET?: string },
    ctx: unknown,
  ) {
    if (!env.ALTHEA_CRON_SECRET) {
      throw new Error("ALTHEA_CRON_SECRET non configurato: ciclo automatico non avviato.");
    }
    const handler = await getServerEntry();
    const request = new Request("https://althea.internal/api/public/jobs/ciclo-ia", {
      method: "POST",
      headers: { authorization: `Bearer ${env.ALTHEA_CRON_SECRET}` },
    });
    const response = await handler.fetch(request, env, ctx);
    if (!response.ok) {
      throw new Error(`Scheduler Althea fallito: HTTP ${response.status}`);
    }
    const result = await response.text();
    console.log(JSON.stringify({
      event: "althea_scheduled_cycle",
      cron: controller.cron,
      scheduledTime: controller.scheduledTime,
      result,
    }));
  },
};
