import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { AssistenteLayout, useNuovoThread } from "@/components/AssistenteLayout";
import { listaThread } from "@/lib/assistente.functions";
import { useSessione } from "@/hooks/useSessione";

export const Route = createFileRoute("/assistente/")({
  head: () => ({
    meta: [
      { title: "Assistente IA — Althea" },
      { name: "description", content: "Chiedi all'assistente Althea perché l'IA ha fatto i tuoi ordini automatici." },
      { property: "og:title", content: "Assistente IA — Althea" },
      { property: "og:description", content: "Spiegazioni chiare su ordini, strategia e conto Alpaca." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const { autenticato } = useSessione();
  const lista = useServerFn(listaThread);
  const navigate = useNavigate();
  const nuovo = useNuovoThread();
  const fatto = useRef(false);
  const threads = useQuery({ queryKey: ["chat-thread"], enabled: autenticato, queryFn: () => lista() });

  useEffect(() => {
    if (!threads.data || fatto.current) return;
    fatto.current = true;
    const primo = threads.data[0];
    if (primo) void navigate({ to: "/assistente/$threadId", params: { threadId: primo.id }, replace: true });
    else nuovo.mutate();
  }, [threads.data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AssistenteLayout>
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    </AssistenteLayout>
  );
}
