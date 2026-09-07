import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

const CHIAVE = "althea:cookie-consenso";

export function BannerCookie() {
  const [visibile, setVisibile] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CHIAVE)) setVisibile(true);
    } catch {
      /* storage non disponibile */
    }
  }, []);

  const chiudi = (valore: "tecnici" | "tutti") => {
    try {
      localStorage.setItem(CHIAVE, valore);
    } catch {
      /* storage non disponibile */
    }
    setVisibile(false);
  };

  if (!visibile) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-4 text-xs leading-relaxed text-muted-foreground sm:flex-row sm:items-center">
        <p className="flex-1">
          Usiamo solo cookie e memoria locale <span className="text-foreground">tecnici</span>,
          necessari per l'accesso al tuo account e per ricordare le tue preferenze. Non usiamo
          cookie di profilazione o pubblicitari e non condividiamo dati con terze parti a scopo
          di marketing. Dettagli nella{" "}
          <Link to="/cookie" className="text-primary underline underline-offset-2">
            Cookie Policy
          </Link>{" "}
          e nella{" "}
          <Link to="/privacy" className="text-primary underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => chiudi("tecnici")}
            className="rounded-lg border border-border px-3 py-2 font-medium transition-colors hover:text-foreground"
          >
            Solo necessari
          </button>
          <button
            onClick={() => chiudi("tutti")}
            className="rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Ho capito
          </button>
        </div>
      </div>
    </div>
  );
}
