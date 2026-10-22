// Logica pura (testabile) per identificare i conti e attribuire gli ordini dell'IA.

export type OrdineRegistrato = {
  id: string;
  ticker: string;
  lato: string;
  created_at: string;
};

export type OrdineDelBroker = { ticker: string; lato: string; creatoIl: string };

const norm = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Abbina gli ordini registrati dall'IA (senza conto) a ordini realmente presenti nello storico del
 * conto broker attuale: stesso titolo, stesso lato, orario entro la tolleranza. Ogni ordine del
 * broker si usa una sola volta. Gli ordini senza corrispondenza restano "non determinati".
 */
export function abbinaOrdini(
  registrati: OrdineRegistrato[],
  broker: OrdineDelBroker[],
  tolleranzaMs = 5 * 60_000,
): string[] {
  const usati = new Set<number>();
  const abbinati: string[] = [];
  for (const r of registrati) {
    const t = Date.parse(r.created_at);
    let migliore = -1;
    let distanza = Infinity;
    broker.forEach((b, i) => {
      if (usati.has(i) || norm(b.ticker) !== norm(r.ticker) || b.lato !== r.lato) return;
      const d = Math.abs(Date.parse(b.creatoIl) - t);
      if (d <= tolleranzaMs && d < distanza) {
        distanza = d;
        migliore = i;
      }
    });
    if (migliore >= 0) {
      usati.add(migliore);
      abbinati.push(r.id);
    }
  }
  return abbinati;
}

export type RigaRisultato = { lato: string; importo: number | string; pnl_pct: number | string | null; created_at: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Vincite, perdite e risultato realizzato (solo operazioni chiuse = vendite). */
export function risultatiChiusi(righe: RigaRisultato[], giorniGrafico = 7, ora = Date.now()) {
  const vendite = righe.filter((r) => r.lato === "sell" && r.pnl_pct != null);
  const pnlDi = (r: RigaRisultato) => (Number(r.importo) * Number(r.pnl_pct ?? 0)) / 100;
  const settimana: { data: string; pnl: number }[] = [];
  for (let i = giorniGrafico - 1; i >= 0; i--) {
    settimana.push({ data: new Date(ora - i * 86_400_000).toISOString().slice(0, 10), pnl: 0 });
  }
  for (const v of vendite) {
    const g = settimana.find((x) => x.data === v.created_at.slice(0, 10));
    if (g) g.pnl = r2(g.pnl + pnlDi(v));
  }
  return {
    ordini: righe.length,
    vincite: vendite.filter((r) => Number(r.pnl_pct) > 0).length,
    perdite: vendite.filter((r) => Number(r.pnl_pct) < 0).length,
    pnlRealizzato: r2(vendite.reduce((a, r) => a + pnlDi(r), 0)),
    settimana,
  };
}

/** Guadagno/perdita non realizzato delle posizioni aperte (valore attuale e P&L % per posizione). */
export function pnlNonRealizzato(posizioni: { valore: number; pnlPct: number }[]) {
  return r2(
    posizioni.reduce((a, p) => (p.pnlPct <= -100 ? a : a + p.valore - p.valore / (1 + p.pnlPct / 100)), 0),
  );
}

/**
 * Rendimento netto: variazione del capitale al netto di versamenti e prelievi, rispetto al capitale
 * iniziale più i versamenti. I costi sono già inclusi nel valore del conto. Null se manca l'iniziale.
 */
export function rendimentoNetto(input: {
  iniziale: number | null;
  attuale: number;
  versamenti: number;
  prelievi: number;
}) {
  if (!input.iniziale || input.iniziale <= 0) return null;
  const guadagno = input.attuale - input.iniziale - input.versamenti + input.prelievi;
  return r2((guadagno / (input.iniziale + input.versamenti)) * 100);
}
