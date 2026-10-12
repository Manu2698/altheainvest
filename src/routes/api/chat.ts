import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { gestisciChat } = await import("@/lib/ai/assistente.server");
        return gestisciChat(request);
      },
    },
  },
});
