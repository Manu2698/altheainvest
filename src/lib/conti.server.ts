// Identità dei conti broker, riconciliazione dello storico e confronto conti.
// Nessuna funzione qui invia ordini o modifica la logica d'investimento.
import { credenzialiUtente, logServer, storicoConto } from "./alpaca.server";
import { abbinaOrdini, pnlNonRealizzato, rendimentoNetto, risultatiChiusi } from "./conti";
import { salvaEvento } from "./event-log.server";
import {
  INFO_PIATTAFORME,
  PIATTAFORME_ESTERNE,
  type ConfrontoConti,
  type ContoStorico,
  type OrdiniNonDeterminati,
  type PannelloPiattaforma,
  type Piattaforma,
  type PiattaformaEsterna,
  type RiepilogoConto,
} from "./piattaforme.types";

type Amb = "paper" | "reale";
const ALPACA = (reale: boolean) => (reale ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets");
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

/** Impronta non reversibile della chiave pubblica: identifica le chiavi, non il conto. */
export async function improntaChiave(keyId: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(keyId));
  return `impronta:${[...new Uint8Array(h)].slice(0, 8).map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

type Identita = { piattaforma: Piattaforma; ambiente: Amb; contoId: string; verificato: boolean; etichetta: string | null };

/** Legge l'identità del conto Alpaca dal broker. null = non verificabile ora. */
export async function identitaAlpaca(userId: string, reale: boolean): Promise<Identita | null | "assente"> {
  const cred = await credenzialiUtente(userId, reale);
  if (!cred) return "assente";
  try {
    const r = await fetch(`${ALPACA(reale)}/v2/account`, { headers: cred.headers });
    if (!r.ok) return null;
    const a = (await r.json()) as Record<string, unknown>;
    if (!a["id"]) return null;
    const numero = String(a["account_number"] ?? "");
    return {
      piattaforma: "alpaca",
      ambiente: reale ? "reale" : "paper",
      contoId: `alpaca:${String(a["id"])}`,
      verificato: true,
      etichetta: numero ? `••${numero.slice(-4)}` : null,
    };
  } catch (e) {
    logServer("conti.identitaAlpaca", e, { reale });
    return null;
  }
}

async function ordiniBrokerAlpaca(headers: Record<string, string>, reale: boolean, dal: string) {
  const out: { ticker: string; lato: string; creatoIl: string }[] = [];
  let after = dal;
  for (let pagina = 0; pagina < 6; pagina++) {
    const r = await fetch(
      `${ALPACA(reale)}/v2/orders?status=all&limit=500&direction=asc&after=${encodeURIComponent(after)}`,
      { headers },
    );
    if (!r.ok) break;
    const righe = (await r.json()) as Record<string, unknown>[];
    for (const o of righe)
      out.push({ ticker: String(o["symbol"] ?? ""), lato: o["side"] === "sell" ? "sell" : "buy", creatoIl: String(o["created_at"] ?? "") });
    if (righe.length < 500) break;
    after = String(righe[righe.length - 1]!["created_at"]);
  }
  return out;
}

/** Abbina gli ordini senza conto agli ordini presenti nello storico del conto Alpaca attuale. */
async function riconciliaAlpaca(userId: string, id: Identita) {
  const db = await admin();
  const { data: senza } = await db
    .from("ordini_ia")
    .select("id, ticker, lato, created_at")
    .eq("user_id", userId)
    .eq("piattaforma", "alpaca")
    .eq("ambiente", id.ambiente)
    .is("conto_id", null)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (!senza?.length) return 0;
  const cred = await credenzialiUtente(userId, id.ambiente === "reale");
  if (!cred) return 0;
  const dal = new Date(Date.parse(senza[0]!.created_at) - 86_400_000).toISOString();
  const broker = await ordiniBrokerAlpaca(cred.headers, id.ambiente === "reale", dal);
  const ids = abbinaOrdini(senza, broker);
  for (let i = 0; i < ids.length; i += 200) {
    await db
      .from("ordini_ia")
      .update({ conto_id: id.contoId, conto_attribuzione: "verificato_broker" })
      .in("id", ids.slice(i, i + 200))
      .is("conto_id", null);
  }
  if (ids.length)
    await salvaEvento({
      livello: "info",
      origine: "conti.riconciliazione",
      tipo: "Riconciliazione",
      messaggio: `${ids.length} ordini abbinati a un conto verificato dal broker.`,
      contesto: { piattaforma: "alpaca", ambiente: id.ambiente, abbinati: ids.length, esaminati: senza.length },
    });
  return ids.length;
}

/**
 * Registra i conti collegati in base all'identità letta dal broker. Non archivia mai da solo:
 * un conto che non corrisponde più alle chiavi collegate diventa "da confermare".
 */
export async function riconciliaConti(userId: string) {
  const db = await admin();
  const identita: Identita[] = [];
  const verificabili = new Set<string>(); // piattaforma-ambiente di cui conosciamo lo stato attuale

  for (const reale of [false, true]) {
    const r = await identitaAlpaca(userId, reale);
    const k = `alpaca-${reale ? "reale" : "paper"}`;
    if (r === "assente") verificabili.add(k);
    else if (r) {
      identita.push(r);
      verificabili.add(k);
    }
  }
  const { data: creds } = await db.from("piattaforme_credenziali").select("piattaforma, ambiente, key_id").eq("user_id", userId);
  for (const p of PIATTAFORME_ESTERNE) for (const a of ["paper", "reale"] as const) verificabili.add(`${p}-${a}`);
  for (const c of creds ?? []) {
    if (!PIATTAFORME_ESTERNE.includes(c.piattaforma as PiattaformaEsterna)) continue;
    identita.push({
      piattaforma: c.piattaforma as Piattaforma,
      ambiente: c.ambiente === "reale" ? "reale" : "paper",
      contoId: await improntaChiave(c.key_id),
      verificato: false,
      etichetta: null,
    });
  }

  const { data: esistenti } = await db.from("conti_broker").select("*").eq("user_id", userId);
  const ora = new Date().toISOString();

  for (const id of identita) {
    const prima = (esistenti ?? []).find(
      (e) => e.piattaforma === id.piattaforma && e.ambiente === id.ambiente && e.conto_id === id.contoId,
    );
    await db.from("conti_broker").upsert(
      {
        user_id: userId,
        piattaforma: id.piattaforma,
        ambiente: id.ambiente,
        conto_id: id.contoId,
        verificato: id.verificato,
        etichetta: id.etichetta,
        stato: "attivo",
        motivo: null,
        archiviato_il: null,
        ultimo_visto: ora,
      },
      { onConflict: "user_id,piattaforma,ambiente,conto_id" },
    );
    if (prima && prima.stato !== "attivo")
      await salvaEvento({
        livello: "info",
        origine: "conti.riattivato",
        tipo: "Conto",
        messaggio: "Conto di nuovo collegato e confermato attivo.",
        contesto: { piattaforma: id.piattaforma, ambiente: id.ambiente, stato_precedente: prima.stato },
      });
    if (id.piattaforma === "alpaca") {
      const ultima = prima?.riconciliato_il ? Date.parse(prima.riconciliato_il) : 0;
      if (Date.now() - ultima > 10 * 60_000) {
        try {
          await riconciliaAlpaca(userId, id);
          await db
            .from("conti_broker")
            .update({ riconciliato_il: ora })
            .eq("user_id", userId)
            .eq("piattaforma", "alpaca")
            .eq("ambiente", id.ambiente)
            .eq("conto_id", id.contoId);
        } catch (e) {
          logServer("conti.riconciliaAlpaca", e);
        }
      }
    }
  }

  // Conti attivi non più corrispondenti alle chiavi: da confermare (mai archiviati in automatico).
  for (const e of esistenti ?? []) {
    if (e.stato !== "attivo" || !verificabili.has(`${e.piattaforma}-${e.ambiente}`)) continue;
    if (identita.some((i) => i.piattaforma === e.piattaforma && i.ambiente === e.ambiente && i.contoId === e.conto_id)) continue;
    const altro = identita.some((i) => i.piattaforma === e.piattaforma && i.ambiente === e.ambiente);
    await db
      .from("conti_broker")
      .update({
        stato: "da_confermare",
        motivo: altro
          ? "Le chiavi collegate ora appartengono a un altro conto. Il broker non permette di verificare se questo conto è stato chiuso."
          : "Nessuna chiave collegata per questo conto: non è possibile verificarne lo stato.",
      })
      .eq("id", e.id);
    await salvaEvento({
      livello: "info",
      origine: "conti.da_confermare",
      tipo: "Conto",
      messaggio: "Conto non più corrispondente alle chiavi collegate: in attesa di conferma.",
      contesto: { piattaforma: e.piattaforma, ambiente: e.ambiente },
    });
  }
}

/** Conferma dell'utente: archivia un conto da confermare. */
export async function archiviaConto(userId: string, id: string) {
  const db = await admin();
  const { data } = await db
    .from("conti_broker")
    .update({ stato: "archiviato", archiviato_il: new Date().toISOString(), motivo: "Archiviato su conferma dell'utente." })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("stato", "da_confermare")
    .select("piattaforma, ambiente");
  if (!data?.length) return { ok: false };
  await salvaEvento({
    livello: "info",
    origine: "conti.archiviato",
    tipo: "Conto",
    messaggio: "Conto archiviato su conferma dell'utente.",
    contesto: { piattaforma: data[0]!.piattaforma, ambiente: data[0]!.ambiente },
  });
  return { ok: true };
}

/** Versamenti, prelievi e costi dal registro attività Alpaca (null se non disponibile). */
async function flussiAlpaca(userId: string, reale: boolean) {
  const cred = await credenzialiUtente(userId, reale);
  if (!cred) return null;
  try {
    const [storico, att] = await Promise.all([
      storicoConto(userId, reale),
      fetch(`${ALPACA(reale)}/v2/account/activities?activity_types=CSD,CSW,FEE&page_size=100`, { headers: cred.headers }),
    ]);
    if (!att.ok) return null;
    const inizio = storico[0]?.giorno ?? null;
    const righe = ((await att.json()) as Record<string, unknown>[]).filter(
      (a) => !inizio || String(a["date"] ?? "").slice(0, 10) >= inizio,
    );
    const somma = (t: string) => righe.filter((a) => a["activity_type"] === t).reduce((s, a) => s + Math.abs(num(a["net_amount"])), 0);
    return { iniziale: storico[0]?.valore ?? null, versamenti: somma("CSD"), prelievi: somma("CSW"), costi: somma("FEE") };
  } catch (e) {
    logServer("conti.flussi", e, { reale });
    return null;
  }
}

/**
 * Confronto conti: conti attivi (solo ordini attribuiti al loro identificativo), conti da
 * confermare/archiviati e ordini "conto non determinato", sempre separati per PAPER e REALE.
 */
export async function confrontoConti(
  userId: string,
  opzioni: { riconcilia: boolean; pannelli?: PannelloPiattaforma[] },
): Promise<ConfrontoConti> {
  if (opzioni.riconcilia) {
    try {
      await riconciliaConti(userId);
    } catch (e) {
      logServer("conti.riconcilia", e);
    }
  }
  const db = await admin();
  const { panoramicaPiattaforme } = await import("./piattaforme.server");
  const [{ data: conti }, { data: righe }, pannelli] = await Promise.all([
    db.from("conti_broker").select("*").eq("user_id", userId),
    db
      .from("ordini_ia")
      .select("piattaforma, ambiente, conto_id, lato, importo, pnl_pct, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5000),
    opzioni.pannelli ? Promise.resolve(opzioni.pannelli) : panoramicaPiattaforme(userId),
  ]);
  const tutti = righe ?? [];
  const dal30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const nome = (p: string) => INFO_PIATTAFORME[p as Piattaforma]?.nome ?? p;

  const attivi: RiepilogoConto[] = [];
  for (const p of pannelli) {
    const conto = (conti ?? []).find((c) => c.piattaforma === p.piattaforma && c.ambiente === p.ambiente && c.stato === "attivo");
    const ordini = conto ? tutti.filter((r) => r.conto_id === conto.conto_id && r.piattaforma === p.piattaforma && r.ambiente === p.ambiente && r.created_at >= dal30) : [];
    const ris = risultatiChiusi(ordini);
    const flussi = p.piattaforma === "alpaca" && p.stato === "collegato" ? await flussiAlpaca(userId, p.ambiente === "reale") : null;
    attivi.push({
      piattaforma: p.piattaforma,
      ambiente: p.ambiente,
      nome: p.nome,
      stato: p.stato,
      valuta: p.valuta,
      contoId: conto?.conto_id ?? null,
      etichetta: conto?.etichetta ?? null,
      verificato: conto?.verificato ?? false,
      capitale: p.valore,
      ...ris,
      pnlNonRealizzato: pnlNonRealizzato(p.posizioni),
      flussi,
      rendimentoNettoPct: flussi ? rendimentoNetto({ ...flussi, attuale: p.valore }) : null,
    });
  }

  const storici: ContoStorico[] = (conti ?? [])
    .filter((c) => c.stato !== "attivo")
    .map((c) => {
      const ris = risultatiChiusi(tutti.filter((r) => r.conto_id === c.conto_id));
      return {
        id: c.id,
        piattaforma: c.piattaforma as Piattaforma,
        ambiente: c.ambiente === "reale" ? "reale" : "paper",
        nome: nome(c.piattaforma),
        etichetta: c.etichetta,
        stato: c.stato === "archiviato" ? "archiviato" : "da_confermare",
        motivo: c.motivo,
        ultimoVisto: c.ultimo_visto,
        archiviatoIl: c.archiviato_il,
        ordini: ris.ordini,
        vincite: ris.vincite,
        perdite: ris.perdite,
        pnlRealizzato: ris.pnlRealizzato,
      };
    });

  const gruppi = new Map<string, typeof tutti>();
  for (const r of tutti.filter((x) => !x.conto_id)) {
    const k = `${r.piattaforma}|${r.ambiente}`;
    gruppi.set(k, [...(gruppi.get(k) ?? []), r]);
  }
  const nonDeterminati: OrdiniNonDeterminati[] = [...gruppi.entries()].map(([k, rs]) => {
    const [p, a] = k.split("|") as [string, string];
    const ris = risultatiChiusi(rs);
    return {
      piattaforma: p as Piattaforma,
      ambiente: a === "reale" ? "reale" : "paper",
      nome: nome(p),
      ordini: ris.ordini,
      vincite: ris.vincite,
      perdite: ris.perdite,
      pnlRealizzato: ris.pnlRealizzato,
      dal: rs[rs.length - 1]?.created_at ?? null,
      al: rs[0]?.created_at ?? null,
    };
  });

  return { aggiornatoIl: new Date().toISOString(), attivi, storici, nonDeterminati };
}
