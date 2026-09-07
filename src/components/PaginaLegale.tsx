import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function PaginaLegale({
  titolo,
  aggiornata,
  children,
}: {
  titolo: string;
  aggiornata: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-3.5">
          <Link to="/" className="font-display text-base font-semibold tracking-tight">
            Althea
          </Link>
          <Link
            to="/"
            className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Torna al sito
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="text-3xl font-semibold sm:text-4xl">{titolo}</h1>
        <p className="mt-2 text-xs text-muted-foreground">Ultimo aggiornamento: {aggiornata}</p>
        <div className="legale mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl flex-wrap gap-4 px-5 py-8 text-xs text-muted-foreground">
          <Link to="/termini" className="hover:text-foreground">
            Termini e condizioni
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link to="/cookie" className="hover:text-foreground">
            Cookie
          </Link>
          <Link to="/rischi" className="hover:text-foreground">
            Avvertenze sui rischi
          </Link>
        </div>
      </footer>
    </div>
  );
}

export function Sezione({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-foreground">{titolo}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
