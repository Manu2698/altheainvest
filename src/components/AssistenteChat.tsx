import { useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import logo from "@/assets/althea-assistente.png";

const SUGGERIMENTI = [
  "Perché l'IA ha comprato o venduto oggi?",
  "Quali sono le mie impostazioni attuali?",
  "Perché il trading automatico si è fermato?",
  "Riassumi l'attività del mio conto Alpaca",
];

export function AssistenteChat({
  threadId,
  iniziali,
  onAggiornato,
}: {
  threadId: string;
  iniziali: UIMessage[];
  onAggiornato: () => void;
}) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { threadId },
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          const t = data.session?.access_token;
          return t ? { Authorization: `Bearer ${t}` } : {};
        },
      }),
    [threadId],
  );
  const { messages, sendMessage, status, stop } = useChat({
    id: threadId,
    messages: iniziali,
    transport,
    onError: (e) => toast.error(leggiErrore(e)),
    onFinish: () => onAggiornato(),
  });
  const [testo, setTesto] = useState("");
  const occupato = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!occupato) document.querySelector<HTMLTextAreaElement>("#assistente-input")?.focus();
  }, [occupato, threadId]);

  const invia = (t: string) => {
    const pulito = t.trim();
    if (!pulito || occupato) return;
    void sendMessage({ text: pulito });
    setTesto("");
  };

  const ultimo = messages[messages.length - 1];
  const attesa = status === "submitted" || (status === "streaming" && ultimo?.role === "user");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState>
              <img src={logo} alt="" className="size-16" />
              <h2 className="mt-3 text-sm font-semibold">Chiedi all'assistente Althea</h2>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Ti spiego gli ordini automatici, la strategia attiva e l'attività del conto Alpaca.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGERIMENTI.map((s) => (
                  <button
                    key={s}
                    onClick={() => invia(s)}
                    className="rounded-full border border-border px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((m) => (
              <Message from={m.role} key={m.id}>
                <MessageContent
                  className={
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-transparent text-foreground"
                  }
                >
                  {m.parts.map((p, i) =>
                    p.type === "text" ? (
                      m.role === "assistant" ? (
                        <MessageResponse key={i}>{p.text}</MessageResponse>
                      ) : (
                        <p key={i} className="whitespace-pre-wrap">{p.text}</p>
                      )
                    ) : p.type === "reasoning" && p.text ? (
                      <details key={i} className="text-[11px] text-muted-foreground">
                        <summary className="cursor-pointer">Ragionamento</summary>
                        <p className="mt-1 whitespace-pre-wrap">{p.text}</p>
                      </details>
                    ) : null,
                  )}
                </MessageContent>
              </Message>
            ))
          )}
          {attesa && (
            <Message from="assistant">
              <MessageContent className="bg-transparent">
                <Shimmer>Analizzo i tuoi dati…</Shimmer>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border p-3">
        <PromptInput onSubmit={(msg) => invia(msg.text)}>
          <PromptInputTextarea
            id="assistente-input"
            autoFocus
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            placeholder="Chiedi dei tuoi ordini, della strategia o del conto…"
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} disabled={!occupato && !testo.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

function leggiErrore(e: Error) {
  try {
    const j = JSON.parse(e.message) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* testo semplice */
  }
  return e.message || "Errore di rete, riprova.";
}
