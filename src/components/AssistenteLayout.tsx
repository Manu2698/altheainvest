import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { creaThread, eliminaThread, listaThread } from "@/lib/assistente.functions";
import { useSessione } from "@/hooks/useSessione";
import { cn } from "@/lib/utils";

export function useNuovoThread() {
  const crea = useServerFn(creaThread);
  const navigate = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => crea(),
    onSuccess: ({ id }) => {
      void qc.invalidateQueries({ queryKey: ["chat-thread"] });
      void navigate({ to: "/assistente/$threadId", params: { threadId: id } });
    },
  });
}

export function AssistenteLayout({ attivo, children }: { attivo?: string; children: ReactNode }) {
  const { autenticato, caricata } = useSessione();
  const lista = useServerFn(listaThread);
  const elimina = useServerFn(eliminaThread);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const nuovo = useNuovoThread();
  const threads = useQuery({
    queryKey: ["chat-thread"],
    enabled: autenticato,
    queryFn: () => lista(),
  });
  const del = useMutation({
    mutationFn: (id: string) => elimina({ data: { id } }),
    onSuccess: (_r, id) => {
      void qc.invalidateQueries({ queryKey: ["chat-thread"] });
      if (id === attivo) void navigate({ to: "/assistente" });
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3">
          <Link to="/" className="text-sm font-semibold">Althea</Link>
          <span className="text-xs text-muted-foreground">/ Assistente</span>
        </div>
      </header>
      {caricata && !autenticato ? (
        <div className="mx-auto max-w-md px-5 py-16 text-center">
          <p className="text-sm">Accedi per chiedere all'assistente dei tuoi investimenti.</p>
          <Link to="/auth" className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
            Accedi
          </Link>
        </div>
      ) : (
        <div className="mx-auto grid h-[calc(100vh-49px)] max-w-6xl grid-cols-1 md:grid-cols-[240px_1fr]">
          <aside className="hidden min-h-0 flex-col border-r border-border md:flex">
            <button
              onClick={() => nuovo.mutate()}
              disabled={nuovo.isPending}
              className="m-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {nuovo.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
              Nuova conversazione
            </button>
            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
              {threads.data?.map((t) => (
                <li
                  key={t.id}
                  className={cn(
                    "group flex items-center rounded-md text-xs",
                    t.id === attivo ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:bg-surface-2",
                  )}
                >
                  <Link
                    to="/assistente/$threadId"
                    params={{ threadId: t.id }}
                    className="min-w-0 flex-1 truncate px-2 py-2"
                  >
                    {t.titolo}
                  </Link>
                  <button
                    onClick={() => del.mutate(t.id)}
                    aria-label="Elimina conversazione"
                    className="px-2 opacity-0 hover:text-bear group-hover:opacity-100"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <main className="flex min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b border-border p-2 md:hidden">
              <button
                onClick={() => nuovo.mutate()}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground"
              >
                <Plus className="size-3" /> Nuova
              </button>
              <select
                value={attivo ?? ""}
                onChange={(e) =>
                  e.target.value &&
                  void navigate({ to: "/assistente/$threadId", params: { threadId: e.target.value } })
                }
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
              >
                <option value="">Conversazioni…</option>
                {threads.data?.map((t) => (
                  <option key={t.id} value={t.id}>{t.titolo}</option>
                ))}
              </select>
            </div>
            {children}
          </main>
        </div>
      )}
    </div>
  );
}
