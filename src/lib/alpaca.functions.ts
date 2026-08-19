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
