import { decryptCredential, encryptCredential } from './credentiali-crypto.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type UserSupabase = SupabaseClient<Database>;

import type {
  AssetInvestibile,
  AssetTipo,
  ContoBroker,
  StatoCollegamento,
} from "./alpaca.types";

export function logServer(origine: string, error: unknown, contesto?: Record<string, unknown>) {
  let dettagli: unknown = undefined;
  let messaggio = "Errore sconosciuto";
  let tipo = "Error";
  let stack: string | undefined;
  if (error instanceof Error) {
    messaggio = error.message;
    tipo = error.name;
    stack = error.stack;
    // Supabase/PostgREST errors extend Error but carry the useful database
    // diagnostics in additional own properties. Preserve only safe diagnostics,
    // never request headers, credentials, or arbitrary object contents.
    const e = error as Error & {
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      status?: unknown;
      statusCode?: unknown;
    };
    const extra = Object.fromEntries(
      (["code", "details", "hint", "status", "statusCode"] as const)
        .filter((key) => e[key] !== undefined && e[key] !== null)
        .map((key) => [key, e[key]]),
    );
    if (Object.keys(extra).length) dettagli = extra;
  } else if (error && typeof error === "object") {
    // Some runtime/PostgREST failures are plain objects with non-enumerable
    // diagnostic properties. Log only a strict allowlist; never serialize the
    // whole object because it may contain request headers or credentials.
    const e = error as Record<string, unknown>;
    const safeKeys = ["name", "message", "code", "details", "hint", "status", "statusCode", "statusText"];
    const extra = Object.fromEntries(
      safeKeys
        .filter((key) => e[key] !== undefined && e[key] !== null)
        .map((key) => [key, e[key]]),
    );
    const protoNames: string[] = [];
    let proto = Object.getPrototypeOf(error);
    for (let i = 0; proto && i < 4; i += 1) {
      protoNames.push((proto as { constructor?: { name?: string } }).constructor?.name ?? "unknown");
      proto = Object.getPrototypeOf(proto);
    }
    const descriptors = Object.getOwnPropertyDescriptors(error);
    const descriptorSummary = Object.fromEntries(
      ["name", "message", "code", "details", "hint", "status", "statusCode", "statusText", "stack"]
        .filter((key) => descriptors[key] !== undefined)
        .map((key) => {
          const d = descriptors[key];
          const value = "value" in d ? d.value : undefined;
          return [key, value == null || ["string", "number", "boolean"].includes(typeof value)
            ? value
            : { type: typeof value, constructor: (value as { constructor?: { name?: string } })?.constructor?.name }];
        }),
    );
    dettagli = {
      ...extra,
      ownPropertyNames: Object.getOwnPropertyNames(error),
      constructor: (error as { constructor?: { name?: string } }).constructor?.name,
      prototypeChain: protoNames,
      descriptors: descriptorSummary,
      stringified: String(error),
    };
    messaggio = String(e.message ?? "");
    tipo = String(e.name ?? "DatabaseError");
  } else {
    messaggio = String(error);
  }
  console.error(JSON.stringify({
    at: new Date().toISOString(),
    livello: "error",
    origine,
    tipo,
    messaggio,
    dettagli,
    contesto,
  }));
  if (stack) console.error(stack);
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

type Headers = Record<string, string>;

function headersDa(keyId: string, secret: string): Headers {
  return {
    "APCA-API-KEY-ID": keyId,
    "APCA-API-SECRET-KEY": secret,
    accept: "application/json",
  };
}

function credenzialiAmbiente(): Headers | null {
  const keyId = process.env["APCA_API_KEY_ID"];
  const secret = process.env["APCA_API_SECRET_KEY"];
  if (!keyId || !secret) return null;
  return headersDa(keyId, secret);
}

/** Chiavi dell'utente (se collegate) altrimenti quelle di piattaforma. */
export async function credenzialiUtente(
  userId: string | null,
  reale: boolean,
  userSupabase?: UserSupabase,
): Promise<{ headers: Headers; proprie: boolean } | null> {
  if (userId) {
    try {
      const { supabaseAdmin } = userSupabase
        ? { supabaseAdmin: userSupabase }
        : await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("broker_credenziali")
        .select("key_id, api_secret")
        .eq("user_id", userId)
        .eq("ambiente", reale ? "reale" : "paper")
        .maybeSingle();
      if (data?.key_id && data?.api_secret) {
        const keyId = await decryptCredential(data.key_id);
        const secret = await decryptCredential(data.api_secret);

        // Migrazione trasparente delle vecchie righe in chiaro: appena vengono
        // lette con la chiave di cifratura configurata, vengono riscritte cifrate.
        if (!data.key_id.startsWith("v1.") || !data.api_secret.startsWith("v1.")) {
          const { error: migrationError } = await supabaseAdmin
            .from("broker_credenziali")
            .update({
              key_id: await encryptCredential(keyId),
              api_secret: await encryptCredential(secret),
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId)
            .eq("ambiente", reale ? "reale" : "paper");
          if (migrationError) throw migrationError;
        }
        return { headers: headersDa(keyId, secret), proprie: true };
      }
    } catch (error) {
      logServer("alpaca.credenzialiUtente", error, { reale });
    }
  }
  const env = credenzialiAmbiente();
  return env ? { headers: env, proprie: false } : null;
}

const baseUrl = (reale: boolean) =>
  reale ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";

export async function verificaChiavi(
  keyId: string,
  secret: string,
  reale: boolean,
): Promise<{ ok: true; numeroConto: string } | { ok: false; messaggio: string }> {
  try {
    const res = await fetch(`${baseUrl(reale)}/v2/account`, {
      headers: headersDa(keyId, secret),
    });
    if (!res.ok) {
      return {
        ok: false,
        messaggio:
          res.status === 401 || res.status === 403
            ? `Chiavi rifiutate dal broker. Verifica di aver generato chiavi ${reale ? "live" : "paper"}.`
            : `Il broker ha risposto con errore ${res.status}.`,
      };
    }
    const account = (await res.json()) as Record<string, unknown>;
    return { ok: true, numeroConto: String(account["account_number"] ?? "—") };
  } catch (error) {
    logServer("alpaca.verificaChiavi", error, { reale });
    return { ok: false, messaggio: "Non riesco a raggiungere il broker in questo momento." };
  }
}

export async function salvaChiaviUtente(
  supabase: UserSupabase,
  userId: string,
  reale: boolean,
  keyId: string,
  secret: string,
): Promise<{ ok: boolean; messaggio: string }> {
  const check = await verificaChiavi(keyId, secret, reale);
  if (!check.ok) return { ok: false, messaggio: check.messaggio };

  // AES-256-GCM: le credenziali vengono cifrate prima di lasciare il Worker.
  // Se il segreto non è configurato o non è valido, il salvataggio fallisce.
  let encryptedKeyId: string;
  let encryptedSecret: string;
  try {
    [encryptedKeyId, encryptedSecret] = await Promise.all([
      encryptCredential(keyId),
      encryptCredential(secret),
    ]);
  } catch (error) {
    logServer("alpaca.salvaChiaviUtente.encryption", error, { reale });
    return { ok: false, messaggio: "Cifratura non configurata sul server: nessuna credenziale è stata salvata." };
  }

  const { error } = await supabase.from("broker_credenziali").upsert({
    user_id: userId,
    ambiente: reale ? "reale" : "paper",
    key_id: encryptedKeyId,
    api_secret: encryptedSecret,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,ambiente" });
  if (error) {
    logServer("alpaca.salvaChiaviUtente.database", error, { reale, userId });
    return { ok: false, messaggio: "Non sono riuscito a salvare le chiavi nel tuo profilo." };
  }

  return { ok: true, messaggio: `Conto ${check.numeroConto} collegato correttamente.` };
}

export async function scollegaChiaviUtente(supabase: UserSupabase, userId: string, reale: boolean) {
  const { error } = await supabase
    .from("broker_credenziali")
    .delete()
    .eq("user_id", userId)
    .eq("ambiente", reale ? "reale" : "paper");
  if (error) throw new Error("Non sono riuscito a scollegare il conto.");
  return { ok: true };
}

export async function statoCollegamento(supabase: UserSupabase, userId: string): Promise<StatoCollegamento> {
  try {
    const { data } = await supabase
      .from("broker_credenziali")
      .select("ambiente, key_id, api_secret, updated_at")
      .eq("user_id", userId);
    const righe = data ?? [];
    const trova = (a: string) => righe.find((r) => r.ambiente === a);
    const mask = (k: string | undefined) =>
      k ? `${k.slice(0, 4)}••••${k.slice(-4)}` : null;
    const chiaveMascherata = async (ambiente: "paper" | "reale") => {
      const riga = trova(ambiente);
      if (!riga?.key_id) return null;
      const keyId = await decryptCredential(riga.key_id);
      const apiSecret = await decryptCredential(
        (riga as typeof riga & { api_secret?: string }).api_secret ?? "",
      );
      if (!riga.key_id.startsWith("v1.") || !((riga as typeof riga & { api_secret?: string }).api_secret ?? "").startsWith("v1.")) {
        const { error } = await supabase
          .from("broker_credenziali")
          .update({
            key_id: await encryptCredential(keyId),
            api_secret: await encryptCredential(apiSecret),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
          .eq("ambiente", ambiente);
        if (error) throw error;
      }
      return mask(keyId);
    };
    return {
      paper: { collegato: Boolean(trova("paper")), chiave: await chiaveMascherata("paper") },
      reale: { collegato: Boolean(trova("reale")), chiave: await chiaveMascherata("reale") },
      piattaforma: Boolean(credenzialiAmbiente()),
    };
  } catch (error) {
    logServer("alpaca.statoCollegamento", error);
    return {
      paper: { collegato: false, chiave: null },
      reale: { collegato: false, chiave: null },
      piattaforma: Boolean(credenzialiAmbiente()),
    };
  }
}

export async function leggiConto(
  reale: boolean,
  userId: string | null,
  userSupabase?: UserSupabase,
): Promise<ContoBroker> {
  const cred = await credenzialiUtente(userId, reale, userSupabase);
  if (!cred) {
    return {
      stato: "non_configurato",
      messaggio: "Nessun broker collegato: inserisci le chiavi API per iniziare.",
    };
  }
  const headers = cred.headers;
  const base = baseUrl(reale);

  try {
    const [accountRes, positionsRes] = await Promise.all([
      fetch(`${base}/v2/account`, { headers }),
      fetch(`${base}/v2/positions`, { headers }),
    ]);

    if (!accountRes.ok) {
      const body = await accountRes.text();
      console.error(`Alpaca /v2/account [${accountRes.status}]: ${body}`);
      return {
        stato: "errore",
        messaggio:
          accountRes.status === 401 || accountRes.status === 403
            ? `Chiavi rifiutate dal broker (${accountRes.status}). Verifica che siano le chiavi ${reale ? "live" : "paper"}.`
            : `Il broker ha risposto con errore ${accountRes.status}.`,
      };
    }

    const account = (await accountRes.json()) as Record<string, unknown>;
    const rawPositions = positionsRes.ok
      ? ((await positionsRes.json()) as Record<string, unknown>[])
      : [];

    const equity = num(account["equity"]);
    const lastEquity = num(account["last_equity"]);

    return {
      stato: "collegato",
      ambiente: reale ? "reale" : "paper",
      proprieChiavi: cred.proprie,
      numeroConto: String(account["account_number"] ?? "—"),
      valuta: String(account["currency"] ?? "USD"),
      valorePortafoglio: equity,
      liquidita: num(account["cash"]),
      poterAcquisto: num(account["buying_power"]),
      pnlGiornaliero: lastEquity > 0 ? ((equity - lastEquity) / lastEquity) * 100 : 0,
      bloccato: Boolean(account["trading_blocked"]),
      posizioni: rawPositions.map((p) => ({
        ticker: String(p["symbol"] ?? ""),
        quantita: num(p["qty"]),
        prezzoMedio: num(p["avg_entry_price"]),
        valore: num(p["market_value"]),
        pnl: num(p["unrealized_pl"]),
        pnlPct: num(p["unrealized_plpc"]) * 100,
      })),
    };
  } catch (error) {
    logServer("alpaca.leggiConto", error, { reale });
    return {
      stato: "errore",
      messaggio: "Non riesco a raggiungere il broker in questo momento.",
    };
  }
}

type RawAsset = Record<string, unknown>;

const cacheAssets = new Map<string, { at: number; items: AssetInvestibile[] }>();
const TTL = 1000 * 60 * 60 * 6;


const RE_ETF =
  /\b(ETF|ETN|Trust|Index|Fund|Shares|Portfolio|Ultra|ProShares|iShares|SPDR|Vanguard|Invesco)\b/i;

function mappa(a: RawAsset): AssetInvestibile {
  const classe = String(a["class"] ?? "us_equity");
  const nome = String(a["name"] ?? "");
  const etf = classe !== "crypto" && RE_ETF.test(nome);
  return {
    ticker: String(a["symbol"] ?? ""),
    nome,
    tipo: classe === "crypto" ? "cripto" : etf ? "etf" : "azione",
    borsa: String(a["exchange"] ?? ""),
    frazionabile: Boolean(a["fractionable"]),
    operabile: Boolean(a["tradable"]),
  };
}

async function caricaAssets(
  headers: Headers,
  chiave: string,
  reale: boolean,
): Promise<AssetInvestibile[]> {
  const cached = cacheAssets.get(chiave);
  if (cached && Date.now() - cached.at < TTL) return cached.items;

  const base = `${baseUrl(reale)}/v2/assets?status=active`;
  const [eq, cr] = await Promise.all([
    fetch(`${base}&asset_class=us_equity`, { headers }),
    fetch(`${base}&asset_class=crypto`, { headers }),
  ]);

  const raw: RawAsset[] = [];
  if (eq.ok) raw.push(...((await eq.json()) as RawAsset[]));
  else logServer("alpaca.caricaAssets.equity", new Error(`HTTP ${eq.status}`));
  if (cr.ok) raw.push(...((await cr.json()) as RawAsset[]));
  else logServer("alpaca.caricaAssets.crypto", new Error(`HTTP ${cr.status}`));

  const items = raw.map(mappa).filter((a) => a.ticker && a.operabile);
  if (items.length) cacheAssets.set(chiave, { at: Date.now(), items });
  return items;
}

export async function cercaAssets(
  userId: string | null,
  reale: boolean,
  q: string,
  tipo: AssetTipo | "tutti",
  limite: number,
): Promise<{
  risultati: AssetInvestibile[];
  totale: number;
  totaleFiltrato: number;
  conteggi: Record<AssetTipo, number>;
}> {
  const vuoto = {
    risultati: [],
    totale: 0,
    totaleFiltrato: 0,
    conteggi: { azione: 0, etf: 0, cripto: 0 },
  };
  try {
    const cred = await credenzialiUtente(userId, reale);
    if (!cred) return vuoto;
    const chiave = `${cred.headers["APCA-API-KEY-ID"]}:${reale ? "reale" : "paper"}`;
    const tutti = await caricaAssets(cred.headers, chiave, reale);
    const pool = tipo === "tutti" ? tutti : tutti.filter((a) => a.tipo === tipo);
    const query = q.toUpperCase();

    const filtrati = query
      ? pool.filter(
          (a) => a.ticker.includes(query) || a.nome.toUpperCase().includes(query),
        )
      : pool;

    const ordinati = [...filtrati].sort((a, b) => {
      const pa = a.ticker === query ? 0 : a.ticker.startsWith(query) ? 1 : 2;
      const pb = b.ticker === query ? 0 : b.ticker.startsWith(query) ? 1 : 2;
      return pa - pb || a.ticker.localeCompare(b.ticker);
    });

    const conteggi = { azione: 0, etf: 0, cripto: 0 } as Record<AssetTipo, number>;
    for (const a of tutti) conteggi[a.tipo] += 1;

    return {
      risultati: ordinati.slice(0, limite),
      totale: tutti.length,
      totaleFiltrato: ordinati.length,
      conteggi,
    };
  } catch (error) {
    logServer("alpaca.cercaAssets", error, { q, tipo });
    return vuoto;
  }
}


export type PuntoStorico = { giorno: string; valore: number };

/** Storico reale del valore del conto Alpaca (ultimi 3 mesi, giornaliero). */
export async function storicoConto(userId: string, reale: boolean): Promise<PuntoStorico[]> {
  const cred = await credenzialiUtente(userId, reale);
  if (!cred) return [];
  try {
    const res = await fetch(
      `${baseUrl(reale)}/v2/account/portfolio/history?period=3M&timeframe=1D`,
      { headers: cred.headers },
    );
    if (!res.ok) {
      logServer("alpaca.storicoConto", new Error(`HTTP ${res.status}`), { reale });
      return [];
    }
    const j = (await res.json()) as { timestamp?: number[]; equity?: (number | null)[] };
    const ts = j.timestamp ?? [];
    const eq = j.equity ?? [];
    const out: PuntoStorico[] = [];
    ts.forEach((t, i) => {
      const v = eq[i];
      if (v == null || !Number.isFinite(v) || v <= 0) return;
      out.push({ giorno: new Date(t * 1000).toISOString().slice(0, 10), valore: Math.round(v * 100) / 100 });
    });
    return out;
  } catch (error) {
    logServer("alpaca.storicoConto", error, { reale });
    return [];
  }
}
