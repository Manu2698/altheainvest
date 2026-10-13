import { createServerFn } from "@tanstack/react-start";
import type { UIMessage } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ThreadChat = { id: string; titolo: string; updatedAt: string };

export const listaThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ThreadChat[]> => {
    const { data, error } = await context.supabase
      .from("chat_thread")
      .select("id, titolo, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Impossibile caricare le conversazioni.");
    return (data ?? []).map((t) => ({ id: t.id, titolo: t.titolo, updatedAt: t.updated_at }));
  });

export const creaThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ id: string }> => {
    const { data, error } = await context.supabase
      .from("chat_thread")
      .insert({ user_id: context.userId })
      .select("id")
      .single();
    if (error || !data) throw new Error("Impossibile creare la conversazione.");
    return { id: data.id };
  });

export const eliminaThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("chat_thread")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Impossibile eliminare la conversazione.");
    return { ok: true };
  });

export const messaggiThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .handler(async ({ data, context }): Promise<{ trovato: boolean; messaggiJson: string }> => {
    const { data: t } = await context.supabase
      .from("chat_thread")
      .select("id")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!t) return { trovato: false, messaggiJson: "[]" };
    const { data: righe, error } = await context.supabase
      .from("chat_messaggi")
      .select("messaggio")
      .eq("thread_id", data.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error("Impossibile caricare i messaggi.");
    return {
      trovato: true,
      messaggiJson: JSON.stringify((righe ?? []).map((r) => r.messaggio as unknown as UIMessage)),
    };
  });
