// Metriche di successo del portafoglio (logica pura, testabile).
// Indicatore principale: rendimento netto nel periodo, corretto per versamenti e prelievi.

export type PuntoValore = { giorno: string; valore: number };
export type Flusso = { giorno: string; tipo: "deposito" | "prelievo" | "costo"; importo: number };
export type OperazioneChiusa = { giorno: string; importo: number; pnlPct: number; strategia: string };
export type PuntoPrezzo = { giorno: string; prezzo: number };

export type Qualita = "insufficiente" | "limitata" | "sufficiente";

export type MetricheOperazioni = {
  operazioni: number;
  vincite: number;
  perdite: number;
  percentualeVincite: number | null;
  profitFactor: number | null; // null = non calcolabile (nessuna perdita o nessuna operazione)
  rapportoVinciPerdi: number | null;
  pnlRealizzato: number;
  qualita: Qualita;
};

export type Metriche = {
  dal: string | null;
  al: string | null;
  giorniConDati: number;
  capitaleIniziale: number | null;
  capitaleFinale: number | null;
  versamenti: number;
  prelievi: number;
  costiRegistrati: number;
  pnlNetto: number | null; // valuta
  rendimentoPct: number | null; // percentuale, ponderato nel tempo
  drawdownMassimoPct: number | null;
  volatilitaAnnuaPct: number | null; // null se meno di MIN_GIORNI_VOLATILITA rendimenti
  benchmarkPct: number | null;
  differenzaBenchmarkPct: number | null;
  operazioni: MetricheOperazioni;
  perStrategia: Record<string, MetricheOperazioni>;
  avvisi: string[];
};

export const MIN_GIORNI_VOLATILITA = 20;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function qualitaCampione(n: number): Qualita {
  if (n >= 30) return "sufficiente";
  if (n >= 10) return "limitata";
  return "insufficiente";
}

export function metricheOperazioni(ops: OperazioneChiusa[]): MetricheOperazioni {
  const pnl = ops.map((o) => (o.importo * o.pnlPct) / 100);
  const gains = pnl.filter((x) => x > 0);
  const losses = pnl.filter((x) => x < 0);
  const sg = gains.reduce((a, b) => a + b, 0);
  const sl = Math.abs(losses.reduce((a, b) => a + b, 0));
  return {
    operazioni: ops.length,
    vincite: gains.length,
    perdite: losses.length,
    percentualeVincite: ops.length ? r2((gains.length / ops.length) * 100) : null,
    profitFactor: sl > 0 ? r2(sg / sl) : null,
    rapportoVinciPerdi: gains.length && losses.length ? r2(sg / gains.length / (sl / losses.length)) : null,
    pnlRealizzato: r2(pnl.reduce((a, b) => a + b, 0)),
    qualita: qualitaCampione(ops.length),
  };
}

/**
 * Calcola le metriche nel periodo [dal, al] dello storico valori. I flussi del giorno t si
 * considerano avvenuti a fine giornata: r_t = (V_t − flusso netto_t) / V_{t−1} − 1.
 * I costi registrati sono già dentro il valore del conto: si riportano, non si sottraggono due volte.
 */
export function calcolaMetriche(input: {
  storico: PuntoValore[];
  flussi: Flusso[];
  chiuse: OperazioneChiusa[];
  benchmark: PuntoPrezzo[];
  flussiCompleti?: boolean;
}): Metriche {
  const avvisi: string[] = [];
  const storico = [...input.storico]
    .filter((p) => Number.isFinite(p.valore) && p.valore > 0)
    .sort((a, b) => a.giorno.localeCompare(b.giorno));
  const dal = storico[0]?.giorno ?? null;
  const al = storico.at(-1)?.giorno ?? null;
  const nelPeriodo = (g: string) => dal != null && al != null && g > dal && g <= al;
  const flussi = input.flussi.filter((f) => nelPeriodo(f.giorno));
  const somma = (t: Flusso["tipo"]) => r2(flussi.filter((f) => f.tipo === t).reduce((a, f) => a + Math.abs(f.importo), 0));
  const versamenti = somma("deposito");
  const prelievi = somma("prelievo");
  const costiRegistrati = somma("costo");
  if (input.flussiCompleti === false) avvisi.push("Elenco versamenti/prelievi forse incompleto: il rendimento potrebbe essere impreciso.");

  const chiuse = input.chiuse.filter((o) => dal == null || (o.giorno >= dal && o.giorno <= (al ?? o.giorno)));
  const perStrategia: Record<string, MetricheOperazioni> = {};
  for (const s of new Set(chiuse.map((o) => o.strategia)))
    perStrategia[s] = metricheOperazioni(chiuse.filter((o) => o.strategia === s));
  const operazioni = metricheOperazioni(chiuse);
  if (operazioni.operazioni === 0) avvisi.push("Nessuna operazione chiusa nel periodo.");
  else if (operazioni.qualita !== "sufficiente")
    avvisi.push(`Solo ${operazioni.operazioni} operazioni chiuse: statistiche sulle operazioni non affidabili (servono almeno 30).`);

  const vuoto: Metriche = {
    dal, al, giorniConDati: storico.length,
    capitaleIniziale: storico[0]?.valore ?? null,
    capitaleFinale: storico.at(-1)?.valore ?? null,
    versamenti, prelievi, costiRegistrati,
    pnlNetto: null, rendimentoPct: null, drawdownMassimoPct: null, volatilitaAnnuaPct: null,
    benchmarkPct: null, differenzaBenchmarkPct: null,
    operazioni, perStrategia, avvisi,
  };
  if (storico.length < 2) {
    avvisi.unshift("Storico del valore del conto insufficiente: rendimento non calcolabile.");
    return vuoto;
  }

  const netto = new Map<string, number>();
  for (const f of flussi) {
    if (f.tipo === "costo") continue;
    const v = f.tipo === "deposito" ? Math.abs(f.importo) : -Math.abs(f.importo);
    netto.set(f.giorno, (netto.get(f.giorno) ?? 0) + v);
  }
  const rend: number[] = [];
  let indice = 1;
  let picco = 1;
  let dd = 0;
  for (let i = 1; i < storico.length; i++) {
    const r = (storico[i].valore - (netto.get(storico[i].giorno) ?? 0)) / storico[i - 1].valore - 1;
    rend.push(r);
    indice *= 1 + r;
    picco = Math.max(picco, indice);
    dd = Math.min(dd, indice / picco - 1);
  }
  let volatilita: number | null = null;
  if (rend.length >= MIN_GIORNI_VOLATILITA) {
    const m = rend.reduce((a, b) => a + b, 0) / rend.length;
    const v = rend.reduce((a, b) => a + (b - m) ** 2, 0) / (rend.length - 1);
    volatilita = r2(Math.sqrt(v) * Math.sqrt(252) * 100);
  } else avvisi.push(`Volatilità non mostrata: servono almeno ${MIN_GIORNI_VOLATILITA} giorni di dati (presenti ${rend.length}).`);

  const iniziale = storico[0].valore;
  const finale = storico.at(-1)!.valore;
  const rendimentoPct = r2((indice - 1) * 100);

  const b = [...input.benchmark].sort((x, y) => x.giorno.localeCompare(y.giorno));
  const bInizio = b.filter((p) => p.giorno <= dal!).at(-1) ?? b.find((p) => p.giorno >= dal!);
  const bFine = b.filter((p) => p.giorno <= al!).at(-1);
  let benchmarkPct: number | null = null;
  if (bInizio && bFine && bFine.giorno > bInizio.giorno && bInizio.prezzo > 0)
    benchmarkPct = r2((bFine.prezzo / bInizio.prezzo - 1) * 100);
  else avvisi.push("Benchmark non disponibile per il periodo.");

  return {
    ...vuoto,
    capitaleIniziale: iniziale,
    capitaleFinale: finale,
    pnlNetto: r2(finale - iniziale - versamenti + prelievi),
    rendimentoPct,
    drawdownMassimoPct: r2(dd * 100),
    volatilitaAnnuaPct: volatilita,
    benchmarkPct,
    differenzaBenchmarkPct: benchmarkPct == null ? null : r2(rendimentoPct - benchmarkPct),
  };
}

/**
 * Validazione fuori campione per qualunque aumento automatico dell'esposizione: esiti in ordine
 * cronologico, campione minimo, 70% in-campione e 30% fuori campione entrambi in utile con
 * profit factor ≥ 1,2. Se non è superata si resta alla configurazione base.
 */
export const MIN_CAMPIONE_AUMENTO = 20;
export function validaFuoriCampione(pnlCronologici: number[]): boolean {
  if (pnlCronologici.length < MIN_CAMPIONE_AUMENTO) return false;
  const taglio = Math.floor(pnlCronologici.length * 0.7);
  const pf = (xs: number[]) => {
    const g = xs.filter((x) => x > 0).reduce((a, b) => a + b, 0);
    const l = Math.abs(xs.filter((x) => x < 0).reduce((a, b) => a + b, 0));
    return l === 0 ? (g > 0 ? Infinity : 0) : g / l;
  };
  const dentro = pnlCronologici.slice(0, taglio);
  const fuori = pnlCronologici.slice(taglio);
  return pf(dentro) >= 1.2 && pf(fuori) >= 1.2;
}
