/**
 * Monitoraggio errori runtime lato client.
 * Cattura errori non gestiti, promise rifiutate e errori dei boundary React,
 * li stampa in console con stack trace completo e li conserva in un buffer
 * ispezionabile da `window.__altheaErrors`.
 */
import { reportLovableError } from "./lovable-error-reporting";

export type ErroreRuntime = {
  at: string;
  tipo: string;
  messaggio: string;
  origine: string;
  stack: string | undefined;
  contesto?: Record<string, unknown>;
  suggerimento?: string;
};

const MAX = 50;
const buffer: ErroreRuntime[] = [];

export const getErroriRuntime = () => [...buffer];

/** Riconosce classi di errore ricorrenti e suggerisce la causa probabile. */
function diagnostica(messaggio: string): string | undefined {
  const nonDefinito = /^(\w+) is not defined$/.exec(messaggio);
  if (nonDefinito) {
    const nome = nonDefinito[1]!;
    return /^[A-Z]/.test(nome)
      ? `Componente o simbolo "${nome}" non definito: import mancante, export errato, oppure il modulo è stato escluso dal bundle client (es. codice server importato da un componente).`
      : `Variabile "${nome}" non definita in questo scope.`;
  }
  if (/is not a function|is not a constructor/.test(messaggio)) {
    return "Import errato (default vs named) o modulo non caricato correttamente.";
  }
  if (/Cannot read (properties|property)/.test(messaggio)) {
    return "Accesso a una proprietà di un valore null/undefined: dato non ancora caricato?";
  }
  if (/Hydration|hydrating/i.test(messaggio)) {
    return "Mismatch fra HTML server e client: evita valori non deterministici in fase di render.";
  }
  return undefined;
}

export function logErroreRuntime(
  error: unknown,
  origine: string,
  contesto?: Record<string, unknown>,
): ErroreRuntime {
  const err = error instanceof Error ? error : new Error(String(error));
  const voce: ErroreRuntime = {
    at: new Date().toISOString(),
    tipo: err.name || "Error",
    messaggio: err.message,
    origine,
    stack: err.stack,
    ...(contesto ? { contesto } : {}),
    ...(diagnostica(err.message) ? { suggerimento: diagnostica(err.message)! } : {}),
  };

  buffer.push(voce);
  if (buffer.length > MAX) buffer.shift();

  console.error(
    `[runtime:${origine}] ${voce.tipo}: ${voce.messaggio}` +
      (voce.suggerimento ? `\n→ ${voce.suggerimento}` : ""),
    { stack: voce.stack, contesto },
  );

  try {
    reportLovableError(err, { origine, ...contesto });
  } catch {
    /* il reporting non deve mai far fallire l'app */
  }

  return voce;
}

let installato = false;

export function installRuntimeMonitor() {
  if (installato || typeof window === "undefined") return;
  installato = true;

  window.addEventListener("error", (e) => {
    logErroreRuntime(e.error ?? e.message, "window.onerror", {
      file: e.filename,
      riga: e.lineno,
      colonna: e.colno,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    logErroreRuntime(e.reason, "unhandledrejection");
  });

  (window as unknown as Record<string, unknown>)["__altheaErrors"] = getErroriRuntime;
}
