import { logServer } from "./alpaca.server";
import type { StrategyId } from "./strategies";
import type { DecisioneIA, EsitoCiclo } from "./trading.types";
import {
  INFO_PIATTAFORME,
  PIATTAFORME_ESTERNE,
  type PannelloPiattaforma,
  type PiattaformaEsterna,
  type StatoPiattaforme,
} from "./piattaforme.types";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const c of u) s += String.fromCharCode(c);
  return btoa(s);
};
const b64url = (b: ArrayBuffer | Uint8Array) => b64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const daB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const arrotondaGiu = (v: number, dec: number) => Math.floor(v * 10 ** dec) / 10 ** dec;

async function hmac(algo: "SHA-256" | "SHA-512", chiave: Uint8Array, dati: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", chiave as BufferSource, { name: "HMAC", hash: algo }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, dati as BufferSource);
}

async function verifica(r: Response, origine: string) {
  if (r.ok) return r.json();
  const t = (await r.text()).slice(0, 220);
  logServer(origine, new Error(`HTTP ${r.status}: ${t}`));
  throw new Error(`${origine} HTTP ${r.status}: ${t}`);
}

// ---------------------------------------------------------------- universo

const CRIPTO = ["BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT", "LTC", "SHIB", "PEPE"];
const AZIONI = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM", "V", "KO", "PG", "XOM"];
const ETF = ["SPY", "QQQ", "VOO", "GLD"];

function universoDi(p: PiattaformaEsterna): string[] {
  if (p === "trading212") return AZIONI;
  if (p === "etoro") return [...ETF, ...AZIONI, ...CRIPTO.slice(0, 8)];
  return CRIPTO;
}
const isCripto = (t: string) => CRIPTO.includes(t);

/** Chiusure giornaliere: cripto dal mirror pubblico di Binance, azioni da Yahoo Finance. */
async function storico(tickers: string[]): Promise<Record<string, number[]>> {
  const out: Record<string, number[]> = {};
  await Promise.all(
    tickers.map(async (t) => {
      try {
        if (isCripto(t)) {
          const r = await fetch(
            `https://data-api.binance.vision/api/v3/klines?symbol=${t}USDT&interval=1d&limit=60`,
          );
          if (r.ok) out[t] = ((await r.json()) as unknown[][]).map((k) => num(k[4]));
        } else {
          const r = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=6mo&interval=1d`,
            { headers: { "user-agent": "Mozilla/5.0 Althea" } },
          );
          if (r.ok) {
            const j = (await r.json()) as {
              chart?: { result?: { indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
            };
            const c = j.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
            out[t] = c.filter((x): x is number => typeof x === "number");
          }
        }
      } catch (e) {
        logServer("piattaforme.storico", e, { t });
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------- adattatori

type Posizione = { ticker: string; valore: number; pnlPct: number; quantita: number; rif?: string[] };
type Conto = { valore: number; liquidita: number; valuta: string; posizioni: Posizione[] };
type Prezzi = Record<string, number>;
type Adattatore = {
  conto(prezzi: Prezzi): Promise<Conto>;
  compra(ticker: string, importo: number, prezzo: number): Promise<void>;
  vendi(pos: Posizione): Promise<void>;
};

function binance(key: string, secret: string, reale: boolean): Adattatore {
  const base = reale ? "https://api.binance.com" : "https://testnet.binance.vision";
  const firmata = async (metodo: string, path: string, params: Record<string, string>) => {
    const q = new URLSearchParams({ ...params, recvWindow: "10000", timestamp: String(Date.now()) }).toString();
    const firma = hex(await hmac("SHA-256", enc.encode(secret), enc.encode(q)));
    const r = await fetch(`${base}${path}?${q}&signature=${firma}`, {
      method: metodo,
      headers: { "X-MBX-APIKEY": key },
    });
    return verifica(r, `binance${path}`);
  };
  return {
    async conto(prezzi) {
      const a = (await firmata("GET", "/api/v3/account", {})) as {
        balances: { asset: string; free: string }[];
      };
      let liquidita = 0;
      const posizioni: Posizione[] = [];
      for (const b of a.balances) {
        const q = num(b.free);
        if (b.asset === "USDT") liquidita = q;
        else if (q > 0 && prezzi[b.asset]) {
          posizioni.push({ ticker: b.asset, quantita: q, valore: q * prezzi[b.asset]!, pnlPct: 0 });
        }
      }
      const pos = posizioni.filter((p) => p.valore >= 1);
      return { liquidita, valuta: "USDT", posizioni: pos, valore: liquidita + pos.reduce((s, p) => s + p.valore, 0) };
    },
    async compra(t, importo) {
      await firmata("POST", "/api/v3/order", {
        symbol: `${t}USDT`,
        side: "BUY",
        type: "MARKET",
        quoteOrderQty: importo.toFixed(2),
      });
    },
    async vendi(p) {
      const info = (await verifica(
        await fetch(`${base}/api/v3/exchangeInfo?symbol=${p.ticker}USDT`),
        "binance.exchangeInfo",
      )) as { symbols: { filters: { filterType: string; stepSize?: string }[] }[] };
      const step = num(info.symbols[0]?.filters.find((f) => f.filterType === "LOT_SIZE")?.stepSize) || 1e-8;
      const dec = Math.max(0, Math.round(-Math.log10(step)));
      const qty = arrotondaGiu(Math.floor(p.quantita / step) * step, dec);
      await firmata("POST", "/api/v3/order", {
        symbol: `${p.ticker}USDT`,
        side: "SELL",
        type: "MARKET",
        quantity: qty.toFixed(dec),
      });
    },
  };
}

const KRAKEN_ASSET: Record<string, string> = { XXBT: "BTC", XBT: "BTC", XETH: "ETH", XXRP: "XRP", XXDG: "DOGE", XDG: "DOGE", XLTC: "LTC", ZUSD: "USD" };
const KRAKEN_PAIR: Record<string, string> = { BTC: "XBTUSD", DOGE: "XDGUSD" };

function kraken(key: string, secret: string, reale: boolean): Adattatore {
  const privata = async (metodo: string, params: Record<string, string>) => {
    const path = `/0/private/${metodo}`;
    const nonce = String(Date.now() * 1000);
    const body = new URLSearchParams({ nonce, ...params }).toString();
    const sha = await crypto.subtle.digest("SHA-256", enc.encode(nonce + body));
    const msg = new Uint8Array([...enc.encode(path), ...new Uint8Array(sha)]);
    const firma = b64(await hmac("SHA-512", daB64(secret), msg));
    const r = await fetch(`https://api.kraken.com${path}`, {
      method: "POST",
      headers: { "API-Key": key, "API-Sign": firma, "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const j = (await verifica(r, `kraken.${metodo}`)) as { error?: string[]; result?: unknown };
    if (j.error?.length) throw new Error(`Kraken: ${j.error.join(", ")}`);
    return j.result;
  };
  return {
    async conto(prezzi) {
      const bal = ((await privata("Balance", {})) ?? {}) as Record<string, string>;
      let liquidita = 0;
      const somme: Record<string, number> = {};
      for (const [k, v] of Object.entries(bal)) {
        const pulito = k.replace(/\.F$/, "");
        const asset = KRAKEN_ASSET[pulito] ?? pulito;
        somme[asset] = (somme[asset] ?? 0) + num(v);
      }
      liquidita = somme["USD"] ?? 0;
      const posizioni = Object.entries(somme)
        .filter(([a, q]) => a !== "USD" && q > 0 && prezzi[a])
        .map(([a, q]) => ({ ticker: a, quantita: q, valore: q * prezzi[a]!, pnlPct: 0 }))
        .filter((p) => p.valore >= 1);
      return { liquidita, valuta: "USD", posizioni, valore: liquidita + posizioni.reduce((s, p) => s + p.valore, 0) };
    },
    async compra(t, importo, prezzo) {
      await privata("AddOrder", {
        pair: KRAKEN_PAIR[t] ?? `${t}USD`,
        type: "buy",
        ordertype: "market",
        volume: arrotondaGiu(importo / prezzo, 8).toFixed(8),
        ...(reale ? {} : { validate: "true" }),
      });
    },
    async vendi(p) {
      await privata("AddOrder", {
        pair: KRAKEN_PAIR[p.ticker] ?? `${p.ticker}USD`,
        type: "sell",
        ordertype: "market",
        volume: arrotondaGiu(p.quantita, 8).toFixed(8),
        ...(reale ? {} : { validate: "true" }),
      });
    },
  };
}

/** Converte una chiave EC P-256 in formato SEC1 (BEGIN EC PRIVATE KEY) in PKCS8. */
function pemInPkcs8(pem: string): Uint8Array {
  const corpo = pem.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = daB64(corpo);
  if (!/BEGIN EC PRIVATE KEY/.test(pem)) return der;
  const algo = [0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07];
  const lung = (n: number) => (n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 0xff]);
  const ottetti = [0x04, ...lung(der.length), ...der];
  const interno = [0x02, 0x01, 0x00, ...algo, ...ottetti];
  return new Uint8Array([0x30, ...lung(interno.length), ...interno]);
}

function coinbase(nomeChiave: string, pem: string, reale: boolean): Adattatore {
  let chiave: Promise<CryptoKey> | null = null;
  const jwt = async (metodo: string, path: string) => {
    chiave ??= crypto.subtle.importKey("pkcs8", pemInPkcs8(pem) as BufferSource, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const ora = Math.floor(Date.now() / 1000);
    const testa = b64url(enc.encode(JSON.stringify({ alg: "ES256", kid: nomeChiave, nonce: crypto.randomUUID(), typ: "JWT" })));
    const corpo = b64url(
      enc.encode(JSON.stringify({ sub: nomeChiave, iss: "cdp", nbf: ora, exp: ora + 120, uri: `${metodo} api.coinbase.com${path}` })),
    );
    const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await chiave, enc.encode(`${testa}.${corpo}`));
    return `${testa}.${corpo}.${b64url(firma)}`;
  };
  const chiama = async (metodo: string, path: string, body?: unknown) => {
    const r = await fetch(`https://api.coinbase.com${path}`, {
      method: metodo,
      headers: { authorization: `Bearer ${await jwt(metodo, path.split("?")[0]!)}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : null,
    });
    const j = (await verifica(r, `coinbase${path.split("?")[0]}`)) as {
      success?: boolean;
      error_response?: { message?: string; error?: string };
      errs?: unknown[];
    };
    if (j.success === false) throw new Error(`Coinbase: ${j.error_response?.message ?? j.error_response?.error ?? "ordine rifiutato"}`);
    return j;
  };
  const ordine = async (product_id: string, side: "BUY" | "SELL", conf: Record<string, string>) => {
    const body = { product_id, side, order_configuration: { market_market_ioc: conf } };
    if (reale) await chiama("POST", "/api/v3/brokerage/orders", { client_order_id: crypto.randomUUID(), ...body });
    else await chiama("POST", "/api/v3/brokerage/orders/preview", body);
  };
  return {
    async conto(prezzi) {
      const j = (await chiama("GET", "/api/v3/brokerage/accounts?limit=250")) as unknown as {
        accounts: { currency: string; available_balance?: { value: string } }[];
      };
      let liquidita = 0;
      const posizioni: Posizione[] = [];
      for (const a of j.accounts ?? []) {
        const q = num(a.available_balance?.value);
        if (a.currency === "USD" || a.currency === "USDC") liquidita += q;
        else if (q > 0 && prezzi[a.currency]) posizioni.push({ ticker: a.currency, quantita: q, valore: q * prezzi[a.currency]!, pnlPct: 0 });
      }
      const pos = posizioni.filter((p) => p.valore >= 1);
      return { liquidita, valuta: "USD", posizioni: pos, valore: liquidita + pos.reduce((s, p) => s + p.valore, 0) };
    },
    async compra(t, importo) {
      await ordine(`${t}-USD`, "BUY", { quote_size: importo.toFixed(2) });
    },
    async vendi(p) {
      await ordine(`${p.ticker}-USD`, "SELL", { base_size: String(arrotondaGiu(p.quantita, 8)) });
    },
  };
}

function trading212(key: string, secret: string, reale: boolean): Adattatore {
  const base = reale ? "https://live.trading212.com/api/v0" : "https://demo.trading212.com/api/v0";
  const auth = `Basic ${btoa(`${key}:${secret}`)}`;
  const chiama = async (metodo: string, path: string, body?: unknown) =>
    verifica(
      await fetch(`${base}${path}`, {
        method: metodo,
        headers: { authorization: auth, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : null,
      }),
      `trading212${path}`,
    );
  return {
    async conto() {
      const cassa = (await chiama("GET", "/equity/account/cash")) as Record<string, unknown>;
      const port = (await chiama("GET", "/equity/portfolio")) as Record<string, unknown>[];
      let valuta = "EUR";
      try {
        valuta = String(((await chiama("GET", "/equity/account/info")) as Record<string, unknown>)["currencyCode"] ?? "EUR");
      } catch {
        /* facoltativo */
      }
      const posizioni = port.map((p) => {
        const q = num(p["quantity"]);
        const medio = num(p["averagePrice"]);
        const att = num(p["currentPrice"]);
        return {
          ticker: String(p["ticker"] ?? "").replace(/_US_EQ$|_EQ$/, ""),
          rif: [String(p["ticker"] ?? "")],
          quantita: q,
          valore: q * att,
          pnlPct: medio > 0 ? (att / medio - 1) * 100 : 0,
        };
      });
      return { valore: num(cassa["total"]), liquidita: num(cassa["free"]), valuta, posizioni };
    },
    async compra(t, importo, prezzo) {
      const quantita = arrotondaGiu(importo / prezzo, 3);
      if (quantita <= 0) throw new Error("Importo troppo piccolo per Trading 212.");
      await chiama("POST", "/equity/orders/market", { ticker: `${t}_US_EQ`, quantity: quantita });
    },
    async vendi(p) {
      await chiama("POST", "/equity/orders/market", { ticker: p.rif?.[0] ?? `${p.ticker}_US_EQ`, quantity: -p.quantita });
    },
  };
}

const idEtoro = new Map<string, number>();
function etoro(apiKey: string, userKey: string, reale: boolean): Adattatore {
  const base = "https://public-api.etoro.com/api/v1";
  const demo = reale ? "" : "/demo";
  const chiama = async (metodo: string, path: string, body?: unknown) =>
    verifica(
      await fetch(`${base}${path}`, {
        method: metodo,
        headers: {
          "x-api-key": apiKey,
          "x-user-key": userKey,
          "x-request-id": crypto.randomUUID(),
          "content-type": "application/json",
        },
        body: body ? JSON.stringify(body) : null,
      }),
      `etoro${path.replace(/\d+/g, ":id")}`,
    );
  const strumento = async (t: string) => {
    if (idEtoro.has(t)) return idEtoro.get(t)!;
    const j = (await chiama("GET", `/market-data/search?internalSymbolFull=${encodeURIComponent(t)}`)) as {
      items?: Record<string, unknown>[];
    };
    const it = j.items?.find((i) => String(i["internalSymbolFull"] ?? i["symbolFull"] ?? "").toUpperCase() === t) ?? j.items?.[0];
    const id = num(it?.["instrumentId"] ?? it?.["InstrumentID"] ?? it?.["instrumentID"]);
    if (!id) throw new Error(`eToro: strumento ${t} non trovato.`);
    idEtoro.set(t, id);
    return id;
  };
  return {
    async conto(prezzi) {
      const j = (await chiama("GET", `/trading/info${demo}/portfolio`)) as {
        clientPortfolio?: { credit?: number; positions?: Record<string, unknown>[] };
      };
      const cp = j.clientPortfolio ?? {};
      // Risolve gli strumenti dell'universo per riconoscere le posizioni aperte.
      const perId = new Map<number, string>();
      await Promise.all(
        Object.keys(prezzi).map(async (t) => {
          try {
            perId.set(await strumento(t), t);
          } catch {
            /* strumento non disponibile su eToro */
          }
        }),
      );
      const gruppi = new Map<string, Posizione>();
      for (const p of cp.positions ?? []) {
        const t = perId.get(num(p["instrumentID"]));
        if (!t) continue;
        const unita = num(p["units"]);
        const apertura = num(p["openRate"]);
        const prezzo = prezzi[t] ?? apertura;
        const g = gruppi.get(t) ?? { ticker: t, quantita: 0, valore: 0, pnlPct: 0, rif: [] };
        g.quantita += unita;
        g.valore += unita * prezzo;
        g.pnlPct = apertura > 0 ? (prezzo / apertura - 1) * 100 : 0;
        g.rif!.push(`${num(p["positionID"])}:${num(p["instrumentID"])}`);
        gruppi.set(t, g);
      }
      const posizioni = [...gruppi.values()];
      const liquidita = num(cp.credit);
      return { liquidita, valuta: "USD", posizioni, valore: liquidita + posizioni.reduce((s, p) => s + p.valore, 0) };
    },
    async compra(t, importo) {
      await chiama("POST", `/trading/execution${demo}/market-open-orders/by-amount`, {
        InstrumentID: await strumento(t),
        IsBuy: true,
        Leverage: 1,
        Amount: Math.round(importo * 100) / 100,
        IsNoStopLoss: true,
        IsNoTakeProfit: true,
      });
    },
    async vendi(p) {
      for (const r of p.rif ?? []) {
        const [posId, instr] = r.split(":");
        await chiama("POST", `/trading/execution${demo}/market-close-orders/positions/${posId}`, {
          InstrumentId: Number(instr),
          UnitsToDeduct: null,
        });
      }
    },
  };
}

function adattatore(p: PiattaformaEsterna, key: string, secret: string, reale: boolean): Adattatore {
  switch (p) {
    case "binance":
      return binance(key, secret, reale);
    case "kraken":
      return kraken(key, secret, reale);
    case "coinbase":
      return coinbase(key, secret, reale);
    case "trading212":
      return trading212(key, secret, reale);
    case "etoro":
      return etoro(key, secret, reale);
  }
}

// ---------------------------------------------------------------- credenziali

async function credenziali(userId: string, p: PiattaformaEsterna, reale: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("piattaforme_credenziali")
    .select("key_id, api_secret")
    .eq("user_id", userId)
    .eq("piattaforma", p)
    .eq("ambiente", reale ? "reale" : "paper")
    .maybeSingle();
  return data;
}

export async function salvaCredenziali(
  userId: string,
  p: PiattaformaEsterna,
  reale: boolean,
  key: string,
  secret: string,
): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const prezzi = await prezziUltimi(universoDi(p));
    const c = await adattatore(p, key, secret, reale).conto(prezzi);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("piattaforme_credenziali").upsert(
      { user_id: userId, piattaforma: p, ambiente: reale ? "reale" : "paper", key_id: key, api_secret: secret, updated_at: new Date().toISOString() },
      { onConflict: "user_id,piattaforma,ambiente" },
    );
    if (error) throw error;
    return { ok: true, messaggio: `${INFO_PIATTAFORME[p].nome} collegato: valore conto ${c.valore.toFixed(2)} ${c.valuta}.` };
  } catch (e) {
    logServer("piattaforme.salva", e, { p, reale });
    return { ok: false, messaggio: `Chiavi rifiutate da ${INFO_PIATTAFORME[p].nome}: ${e instanceof Error ? e.message.slice(0, 160) : "errore"}` };
  }
}

export async function scollegaCredenziali(userId: string, p: PiattaformaEsterna, reale: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("piattaforme_credenziali").delete().eq("user_id", userId).eq("piattaforma", p).eq("ambiente", reale ? "reale" : "paper");
  return { ok: true };
}

export async function statoPiattaforme(userId: string): Promise<StatoPiattaforme> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("piattaforme_credenziali").select("piattaforma, ambiente, key_id").eq("user_id", userId);
  const out = {} as StatoPiattaforme;
  for (const p of ["trading212", "binance", "kraken", "coinbase", "etoro"] as PiattaformaEsterna[]) out[p] = { paper: null, reale: null };
  for (const r of data ?? []) {
    const k = r.key_id.length > 10 ? `${r.key_id.slice(0, 4)}••••${r.key_id.slice(-4)}` : "••••";
    const slot = out[r.piattaforma as PiattaformaEsterna];
    if (slot) slot[r.ambiente === "reale" ? "reale" : "paper"] = k;
  }
  return out;
}

async function prezziUltimi(t: string[]) {
  const s = await storico(t);
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v.length).map(([k, v]) => [k, v[v.length - 1]!]));
}

// ---------------------------------------------------------------- ciclo

const borsaAperta = () => {
  const d = new Date();
  const g = d.getUTCDay();
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return g >= 1 && g <= 5 && m >= 13 * 60 + 30 && m < 20 * 60;
};

export async function eseguiCicloEsterno(
  userId: string,
  p: PiattaformaEsterna,
  input: { reale: boolean; strategia: StrategyId; capitale: number; modalita?: "limite" | "conto" },
  decide: (s: StrategyId, t: string, c: number[], pos: { ticker: string; valore: number; pnlPct: number } | undefined, quota: number) => {
    azione: "compra" | "vendi" | "attendi";
    importo: number;
    motivo: string;
  },
): Promise<EsitoCiclo> {
  const nome = INFO_PIATTAFORME[p].nome;
  const vuoto = (messaggio: string): EsitoCiclo => ({ ok: false, messaggio, mercatoAperto: false, decisioni: [], eseguiti: 0 });
  const cred = await credenziali(userId, p, input.reale);
  if (!cred) return vuoto(`Collega le chiavi ${nome} (${input.reale ? "reale" : INFO_PIATTAFORME[p].paper}) per far operare l'IA.`);
  const ad = adattatore(p, cred.key_id, cred.api_secret, input.reale);

  try {
    const universo = universoDi(p);
    const serie = await storico(universo);
    const prezzi = Object.fromEntries(Object.entries(serie).filter(([, v]) => v.length).map(([k, v]) => [k, v[v.length - 1]!]));
    const conto = await ad.conto(prezzi);
    const capitale = input.modalita === "conto" ? conto.valore : input.capitale;
    if (capitale <= 0) return vuoto("Imposta il capitale prima di avviare il motore.");

    const posizioni = new Map(conto.posizioni.map((x) => [x.ticker, x]));
    const elenco = [...new Set([...universo, ...posizioni.keys()])];
    const investito = conto.posizioni.reduce((s, x) => s + x.valore, 0);
    let residuo = Math.max(0, Math.min(capitale - investito, conto.liquidita));
    const quota = capitale / Math.max(1, universo.length);
    const aperta = borsaAperta();
    const decisioni: DecisioneIA[] = [];

    for (const t of elenco) {
      const pos = posizioni.get(t);
      const s = decide(input.strategia, t, serie[t] ?? [], pos, quota);
      if (!isCripto(t) && !aperta && s.azione !== "attendi") {
        s.azione = "attendi";
        s.motivo = "Borsa chiusa: l'IA attende l'apertura per operare.";
      }
      if (s.azione === "compra") {
        s.importo = Math.min(s.importo, residuo);
        if (s.importo < 1 || !prezzi[t]) {
          s.azione = "attendi";
          s.motivo = prezzi[t] ? `Capitale impostato (${capitale.toFixed(2)} ${conto.valuta}) già interamente investito.` : "Prezzo non disponibile.";
        }
      }
      const d: DecisioneIA = { ticker: t, azione: s.azione, importo: Math.round(s.importo * 100) / 100, motivo: s.motivo, eseguito: false };
      try {
        if (s.azione === "vendi" && pos) {
          await ad.vendi(pos);
          d.eseguito = true;
        } else if (s.azione === "compra") {
          residuo -= d.importo;
          await ad.compra(t, d.importo, prezzi[t]!);
          d.eseguito = true;
        }
      } catch (e) {
        d.errore = (e instanceof Error ? e.message : String(e)).slice(0, 180);
      }
      decisioni.push(d);
    }

    const eseguiti = decisioni.filter((d) => d.eseguito).length;
    if (eseguiti) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("ordini_ia").insert(
          decisioni.filter((d) => d.eseguito).map((d) => ({
            user_id: userId,
            strategia: input.strategia,
            ambiente: input.reale ? "reale" : "paper",
            piattaforma: p,
            ticker: d.ticker,
            lato: d.azione === "vendi" ? "sell" : "buy",
            importo: d.importo,
            pnl_pct: d.azione === "vendi" ? (posizioni.get(d.ticker)?.pnlPct ?? null) : null,
            motivo: d.motivo,
          })),
        );
      } catch (e) {
        logServer("piattaforme.registro", e);
      }
    }
    return {
      ok: true,
      mercatoAperto: aperta || elenco.some(isCripto),
      decisioni,
      eseguiti,
      universo: elenco,
      selezione: `L'IA analizza ${universo.length} strumenti disponibili su ${nome} (${INFO_PIATTAFORME[p].mercati}) secondo la strategia ${input.strategia}.`,
      messaggio: eseguiti
        ? `${eseguiti} ordini inviati a ${nome} (${input.reale ? "conto reale" : INFO_PIATTAFORME[p].paper}).`
        : `Nessun segnale operativo su ${nome} in questo ciclo: l'IA resta in attesa.`,
    };
  } catch (e) {
    logServer("piattaforme.ciclo", e, { p });
    return vuoto(`Errore con ${nome}: ${e instanceof Error ? e.message.slice(0, 180) : "non raggiungibile"}`);
  }
}
