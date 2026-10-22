// Funzioni pure per i link «Condivisione per analisi» (usate dal server e dai test).

export type OpzioniCondivisione = {
  /** Includere i conti REALI (altrimenti solo paper). */
  reale: boolean;
  /** Mostrare importi, capitali e risultati in valuta. */
  importi: boolean;
  /** Mostrare le posizioni aperte. */
  posizioni: boolean;
  /** Mostrare lo storico dettagliato degli ordini. */
  storico: boolean;
};

export const OPZIONI_PREDEFINITE: OpzioniCondivisione = {
  reale: false,
  importi: false,
  posizioni: false,
  storico: true,
};

export const DURATE_ORE = [1, 24, 24 * 7, 24 * 30] as const;

export const normalizzaOpzioni = (o: Partial<OpzioniCondivisione> | null | undefined): OpzioniCondivisione => ({
  reale: o?.reale === true,
  importi: o?.importi === true,
  posizioni: o?.posizioni === true,
  storico: o?.storico === true,
});

/** Elenco leggibile di ciò che vedrà chi apre il link. */
export function datiVisibili(o: OpzioniCondivisione): { si: string[]; no: string[] } {
  const si = [
    "Stato dei collegamenti ai broker (collegato / errore / non collegato)",
    `Conti attivi, da confermare e archiviati ${o.reale ? "PAPER e REALE" : "solo PAPER"}`,
    "Strategie e impostazioni di ogni conto (sola lettura)",
    "Statistiche per strategia e per conto: ordini, vincite, perdite",
    "Ultimo ciclo del motore, errori, pause e lezioni apprese dall'IA",
  ];
  const no = [
    "Chiavi API, password, token, cookie e sessioni",
    "Email, nome e conversazioni con l'assistente",
    "Qualsiasi pulsante per fare ordini o cambiare impostazioni",
  ];
  (o.importi ? si : no).push("Importi, capitali, risultati in valuta e curva del capitale");
  (o.posizioni ? si : no).push("Posizioni aperte");
  (o.storico ? si : no).push("Storico dettagliato degli ordini con segnali e motivazioni");
  if (!o.reale) no.push("Conti REALI");
  return { si, no };
}

const base64url = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Token casuale da 32 byte (256 bit), codificato base64url: 43 caratteri. */
export function generaToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return base64url(b);
}

export const tokenBenFormato = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);

/** Impronta SHA-256 (hex): l'unica forma in cui il token viene salvato. */
export async function hashToken(token: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export type StatoLink = "attivo" | "scaduto" | "revocato";

export function statoLink(l: { scade_il: string; revocato_il: string | null }, ora = Date.now()): StatoLink {
  if (l.revocato_il) return "revocato";
  if (Date.parse(l.scade_il) <= ora) return "scaduto";
  return "attivo";
}

export const LIMITE_ACCESSI = { finestraMs: 10 * 60_000, massimo: 60 };

/** Limite di frequenza per link: restituisce il nuovo contatore o null se superato. */
export function controllaFrequenza(
  l: { finestra_inizio: string | null; accessi_finestra: number },
  ora = Date.now(),
): { finestra_inizio: string; accessi_finestra: number } | null {
  const inizio = l.finestra_inizio ? Date.parse(l.finestra_inizio) : 0;
  if (ora - inizio > LIMITE_ACCESSI.finestraMs) return { finestra_inizio: new Date(ora).toISOString(), accessi_finestra: 1 };
  if (l.accessi_finestra >= LIMITE_ACCESSI.massimo) return null;
  return { finestra_inizio: new Date(inizio).toISOString(), accessi_finestra: l.accessi_finestra + 1 };
}

/** Nasconde un importo se l'opzione "importi" è disattivata. */
export const importo = (o: OpzioniCondivisione, n: number | null | undefined) =>
  o.importi && n != null && Number.isFinite(n) ? n : null;

/** Le quantità permettono di ricostruire gli importi: nascoste insieme a loro. */
export const quantita = (o: OpzioniCondivisione, n: number | null | undefined) => importo(o, n);

/** Campi volutamente esclusi dal link, con il motivo (per i lettori automatici). */
export function campiNascosti(o: OpzioniCondivisione): { campo: string; motivo: string }[] {
  const r: { campo: string; motivo: string }[] = [];
  const m = "escluso da chi ha creato il link";
  if (!o.importi)
    r.push({ campo: "importi, capitali, quantità, prezzi medi, flussi, risultati in valuta, curva", motivo: `${m} (opzione importi disattivata)` });
  if (!o.posizioni) r.push({ campo: "posizioni", motivo: `${m} (opzione posizioni disattivata)` });
  if (!o.storico) r.push({ campo: "ordiniIA, ordiniBroker", motivo: `${m} (opzione storico disattivata)` });
  if (!o.reale) r.push({ campo: "tutti i dati dei conti REALI", motivo: `${m} (solo PAPER)` });
  return r;
}
