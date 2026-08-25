import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSessione } from "@/hooks/useSessione";

export function AuthBadge() {
  const { utente, autenticato, caricata } = useSessione();
  const navigate = useNavigate();
  const qc = useQueryClient();

  if (!caricata) return <span className="h-8 w-20" aria-hidden />;

  if (!autenticato) {
    return (
      <Link
        to="/auth"
        className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground"
      >
        Accedi
      </Link>
    );
  }

  const esci = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-40 truncate rounded-full border border-border px-3 py-1.5 text-[11px] text-muted-foreground sm:inline-flex sm:items-center sm:gap-1.5">
        <UserRound className="size-3" />
        {utente?.email}
      </span>
      <button
        onClick={() => void esci()}
        aria-label="Esci"
        className="rounded-full border border-border p-2 text-muted-foreground hover:text-bear"
      >
        <LogOut className="size-3.5" />
      </button>
    </div>
  );
}
