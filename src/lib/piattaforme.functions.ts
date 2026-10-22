import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PIATTAFORME_ESTERNE, type PiattaformaEsterna } from "./piattaforme.types";

const valida = (p: unknown): PiattaformaEsterna => {
  if (!PIATTAFORME_ESTERNE.includes(p as PiattaformaEsterna)) throw new Error("Piattaforma non valida.");
  return p as PiattaformaEsterna;
};

export const getStatoPiattaforme = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { statoPiattaforme } = await import("./piattaforme.server");
    return statoPiattaforme(context.userId);
  });

export const collegaPiattaforma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { piattaforma: PiattaformaEsterna; reale: boolean; chiave: string; segreto: string }) => {
    const chiave = String(i?.chiave ?? "").trim();
    const segreto = String(i?.segreto ?? "").trim();
    if (!chiave || !segreto || chiave.length > 500 || segreto.length > 5000) throw new Error("Chiavi non valide.");
    return { piattaforma: valida(i?.piattaforma), reale: Boolean(i?.reale), chiave, segreto };
  })
  .handler(async ({ data, context }) => {
    const { salvaCredenziali } = await import("./piattaforme.server");
    return salvaCredenziali(context.userId, data.piattaforma, data.reale, data.chiave, data.segreto);
  });

export const scollegaPiattaforma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { piattaforma: PiattaformaEsterna; reale: boolean }) => ({
    piattaforma: valida(i?.piattaforma),
    reale: Boolean(i?.reale),
  }))
  .handler(async ({ data, context }) => {
    const { scollegaCredenziali } = await import("./piattaforme.server");
    return scollegaCredenziali(context.userId, data.piattaforma, data.reale);
  });

export const getPanoramicaPiattaforme = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { panoramicaPiattaforme } = await import("./piattaforme.server");
    return panoramicaPiattaforme(context.userId);
  });

export const getRiepilogoConti = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { riepilogoConti } = await import("./piattaforme.server");
    return riepilogoConti(context.userId);
  });

/** Archivia un conto "da confermare" su conferma esplicita dell'utente. */
export const archiviaConto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => {
    const id = String(i?.id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Conto non valido.");
    return { id };
  })
  .handler(async ({ data, context }) => {
    const { archiviaConto: archivia } = await import("./conti.server");
    return archivia(context.userId, data.id);
  });
