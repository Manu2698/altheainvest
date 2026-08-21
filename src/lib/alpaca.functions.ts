import { createServerFn } from "@tanstack/react-start";

export type PosizioneBroker = {
  ticker: string;
  quantita: number;
  prezzoMedio: number;
  valore: number;
  pnl: number;
  pnlPct: number;
};

export type ContoBroker =
  | {
      stato: "collegato";
      ambiente: "paper" | "reale";
      numeroConto: string;
      valuta: string;
      valorePortafoglio: number;
      liquidita: number;
      poterAcquisto: number;
      pnlGiornaliero: number;
      bloccato: boolean;
      posizioni: PosizioneBroker[];
    }
  | { stato: "non_configurato"; messaggio: string }
  | { stato: "errore"; messaggio: string };

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const getContoBroker = createServerFn({ method: "GET" })
  .inputValidator((input: { reale?: boolean } | undefined) => ({
    reale: Boolean(input?.reale),
  }))
  .handler(async ({ data }): Promise<ContoBroker> => {
    const keyId = process.env["APCA_API_KEY_ID"];
    const secret = process.env["APCA_API_SECRET_KEY"];

    if (!keyId || !secret) {
      return {
        stato: "non_configurato",
        messaggio: "Chiavi API del broker non configurate.",
      };
    }

    const base = data.reale
      ? "https://api.alpaca.markets"
      : "https://paper-api.alpaca.markets";
    const headers = {
      "APCA-API-KEY-ID": keyId,
      "APCA-API-SECRET-KEY": secret,
      accept: "application/json",
    };

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
              ? `Chiavi rifiutate dal broker (${accountRes.status}). Verifica che siano le chiavi ${data.reale ? "live" : "paper"}.`
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
        ambiente: data.reale ? "reale" : "paper",
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
      console.error("Alpaca request failed", error);
      return {
        stato: "errore",
        messaggio: "Non riesco a raggiungere il broker in questo momento.",
      };
    }
  });

// ---------- Ricerca asset investibili (azioni, ETF, cripto/memecoin) ----------

export type AssetTipo = "azione" | "etf" | "cripto";

export type AssetInvestibile = {
  ticker: string;
  nome: string;
  tipo: AssetTipo;
  borsa: string;
  frazionabile: boolean;
  operabile: boolean;
};

type RawAsset = Record<string, unknown>;

let cacheAssets: { at: number; items: AssetInvestibile[] } | null = null;
const TTL = 1000 * 60 * 60 * 6;

function mappa(a: RawAsset): AssetInvestibile {
  const classe = String(a["class"] ?? "us_equity");
  const nome = String(a["name"] ?? "");
  const etf =
    classe !== "crypto" &&
    /\b(ETF|ETN|Trust|Index Fund|Fund)\b/i.test(nome);
  return {
    ticker: String(a["symbol"] ?? ""),
    nome,
    tipo: classe === "crypto" ? "cripto" : etf ? "etf" : "azione",
    borsa: String(a["exchange"] ?? ""),
    frazionabile: Boolean(a["fractionable"]),
    operabile: Boolean(a["tradable"]),
  };
}

async function caricaAssets(): Promise<AssetInvestibile[]> {
  if (cacheAssets && Date.now() - cacheAssets.at < TTL) return cacheAssets.items;

  const keyId = process.env["APCA_API_KEY_ID"];
  const secret = process.env["APCA_API_SECRET_KEY"];
  if (!keyId || !secret) return [];

  const headers = {
    "APCA-API-KEY-ID": keyId,
    "APCA-API-SECRET-KEY": secret,
    accept: "application/json",
  };
  const base = "https://paper-api.alpaca.markets/v2/assets?status=active";

  const [eq, cr] = await Promise.all([
    fetch(`${base}&asset_class=us_equity`, { headers }),
    fetch(`${base}&asset_class=crypto`, { headers }),
  ]);

  const raw: RawAsset[] = [];
  if (eq.ok) raw.push(...((await eq.json()) as RawAsset[]));
  if (cr.ok) raw.push(...((await cr.json()) as RawAsset[]));

  const items = raw.map(mappa).filter((a) => a.ticker && a.operabile);
  cacheAssets = { at: Date.now(), items };
  return items;
}

export const cercaAsset = createServerFn({ method: "GET" })
  .inputValidator((input: { q?: string; tipo?: AssetTipo | "tutti" } | undefined) => ({
    q: String(input?.q ?? "").trim().slice(0, 40),
    tipo: (input?.tipo ?? "tutti") as AssetTipo | "tutti",
  }))
  .handler(async ({ data }): Promise<{ risultati: AssetInvestibile[]; totale: number }> => {
    try {
      const tutti = await caricaAssets();
      const pool = data.tipo === "tutti" ? tutti : tutti.filter((a) => a.tipo === data.tipo);
      const q = data.q.toUpperCase();

      const filtrati = q
        ? pool.filter(
            (a) => a.ticker.includes(q) || a.nome.toUpperCase().includes(q),
          )
        : pool;

      const ordinati = [...filtrati].sort((a, b) => {
        const pa = a.ticker === q ? 0 : a.ticker.startsWith(q) ? 1 : 2;
        const pb = b.ticker === q ? 0 : b.ticker.startsWith(q) ? 1 : 2;
        return pa - pb || a.ticker.localeCompare(b.ticker);
      });

      return { risultati: ordinati.slice(0, 40), totale: tutti.length };
    } catch (error) {
      console.error("Alpaca assets failed", error);
      return { risultati: [], totale: 0 };
    }
  });
