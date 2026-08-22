import { createServerFn } from "@tanstack/react-start";
import type { AssetInvestibile, AssetTipo, ContoBroker } from "./alpaca.types";

export type {
  AssetInvestibile,
  AssetTipo,
  ContoBroker,
  PosizioneBroker,
} from "./alpaca.types";

export const getContoBroker = createServerFn({ method: "GET" })
  .inputValidator((input: { reale?: boolean } | undefined) => ({
    reale: Boolean(input?.reale),
  }))
  .handler(async ({ data }): Promise<ContoBroker> => {
    const { leggiConto } = await import("./alpaca.server");
    return leggiConto(data.reale);
  });

export const cercaAsset = createServerFn({ method: "GET" })
  .inputValidator((input: { q?: string; tipo?: AssetTipo | "tutti" } | undefined) => ({
    q: String(input?.q ?? "").trim().slice(0, 40),
    tipo: (input?.tipo ?? "tutti") as AssetTipo | "tutti",
  }))
  .handler(async ({ data }): Promise<{ risultati: AssetInvestibile[]; totale: number }> => {
    const { cercaAssets } = await import("./alpaca.server");
    return cercaAssets(data.q, data.tipo);
  });
