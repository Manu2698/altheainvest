/** Recupero e validazione delle barre storiche Alpaca, senza dipendenze dal runtime Worker. */
const isCripto = (t: string) => t.includes("/") || /^[A-Z]{2,6}USD$/.test(t);
const paioCripto = (t: string) => (t.includes("/") ? t : t.replace(/USD$/, "/USD"));

/** Ultimi prezzi giornalieri per ticker (azioni via IEX, cripto via endpoint dedicato). */
export async function serieStorica(
  tickers: string[],
  headers: Record<string, string>,
  /** Se fornito, riceve la data dell'ultima barra per ticker (controllo dati obsoleti). */
  ultimi?: Record<string, string>,
  logger: (origine: string, errore: unknown) => void = (origine, errore) => console.error(origine, errore),
): Promise<Record<string, number[]>> {
  const azioni = tickers.filter((t) => !isCripto(t));
  const cripto = tickers.filter(isCripto);
  const out: Record<string, number[]> = {};

  const barre: Record<string, {c:number;t:string}[]> = {};
  const invalida = () => { for (const t of tickers) { delete out[t]; delete out[t.replace("/", "")]; if (ultimi) {delete ultimi[t];delete ultimi[t.replace("/", "")];} } };
  let fallito = false;
  const raccogli = (payload: unknown, mappa: (s: string) => string) => {
    const bars = (payload as {bars?:Record<string,{c:number;t?:string}[]>})?.bars;
    if (!bars || typeof bars !== "object") throw new Error("Storico incompleto.");
    for (const [sym,righe] of Object.entries(bars)) {
      const key=mappa(sym);
      for (const r of righe) {
        const prev=barre[key]?.at(-1);
        if (!r.t || !Number.isFinite(Date.parse(r.t)) || Date.parse(r.t)>Date.now() || !Number.isFinite(Number(r.c)) || Number(r.c)<=0 || (prev && Date.parse(r.t)<=Date.parse(prev.t))) throw new Error("Barre duplicate, future o non confrontabili.");
        (barre[key] ??= []).push({c:Number(r.c),t:r.t});
      }
      out[key]=(barre[key] ?? []).map(r=>r.c);
      const t=barre[key]?.at(-1)?.t;
      if (ultimi && t) ultimi[key]=t;
    }
  };

  const richieste: Promise<void>[] = [];
  // Alpaca restituisce un elenco vuoto se non si specifica una finestra temporale.
  const inizio = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const controlla = async (r: Response, origine: string) => {
    if (r.ok) return r.json();
    logger(origine, new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`));
    return null;
  };
  const pagine = async (url: string, origine: string, mappa: (s: string) => string) => {
    let token: string | null = null;
    for (let pagina = 0; pagina < 30; pagina++) {
      const r = await fetch(`${url}${token ? `&page_token=${encodeURIComponent(token)}` : ""}`, { headers, signal: AbortSignal.timeout(15000) });
      const j = await controlla(r, origine) as { bars?: Record<string, { c: number; t?: string }[]>; next_page_token?: string | null } | null;
      if (!j) { fallito=true; invalida(); return; }
      raccogli(j, mappa);
      token = j.next_page_token ?? null;
      if (!token) return;
    }
    // Serie troncata: non presentarla al motore come completa.
    fallito=true; invalida();
  };

  if (azioni.length) {
    const url = `https://data.alpaca.markets/v2/stocks/bars?symbols=${encodeURIComponent(
      azioni.join(","),
    )}&timeframe=1Day&limit=1000&start=${inizio}&feed=iex&adjustment=split&sort=asc`;
    richieste.push(
      pagine(url, "trading.serieStorica.azioni", (s) => s)
        .catch((e) => { fallito=true; invalida(); logger("trading.serieStorica.azioni", e); }),
    );
  }

  if (cripto.length) {
    const url = `https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=${encodeURIComponent(
      cripto.map(paioCripto).join(","),
    )}&timeframe=1Day&limit=1000&start=${inizio}&sort=asc`;
    richieste.push(
      pagine(url, "trading.serieStorica.cripto", (s) => s.replace("/", ""))
        .catch((e) => { fallito=true; invalida(); logger("trading.serieStorica.cripto", e); }),
    );
  }


  await Promise.all(richieste);
  if (fallito) invalida();
  return out;
}

