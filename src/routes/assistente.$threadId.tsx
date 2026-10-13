import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { UIMessage } from "ai";
import { Loader2 } from "lucide-react";
import { AssistenteLayout } from "@/components/AssistenteLayout";
import { AssistenteChat } from "@/components/AssistenteChat";
import { messaggiThread } from "@/lib/assistente.functions";
import { useSessione } from "@/hooks/useSessione";

export const Route = createFileRoute("/assistente/$threadId")({
  head: () => ({
    meta: [
      { title: "Conversazione — Assistente Althea" },
      { name: "description", content: "Conversazione con l'assistente IA sui tuoi investimenti automatici." },
      { property: "og:title", content: "Conversazione — Assistente Althea" },
      { property: "og:description", content: "Domande e risposte su ordini, strategia e conto Alpaca." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const { threadId } = Route.useParams();
  const { autenticato } = useSessione();
  const leggi = useServerFn(messaggiThread);
  const qc = useQueryClient();
  const msg = useQuery({
    queryKey: ["chat-messaggi", threadId],
    enabled: autenticato,
    queryFn: () => leggi({ data: { id: threadId } }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return (
    <AssistenteLayout attivo={threadId}>
      {!msg.data ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          {msg.isError ? "Impossibile caricare la conversazione." : <Loader2 className="size-4 animate-spin" />}
        </div>
      ) : !msg.data.trovato ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          Conversazione non trovata.
          <Link to="/assistente" className="text-primary underline">Torna all'assistente</Link>
        </div>
      ) : (
        <AssistenteChat
          key={threadId}
          threadId={threadId}
          iniziali={JSON.parse(msg.data.messaggiJson) as UIMessage[]}
          onAggiornato={() => void qc.invalidateQueries({ queryKey: ["chat-thread"] })}
        />
      )}
    </AssistenteLayout>
  );
}
