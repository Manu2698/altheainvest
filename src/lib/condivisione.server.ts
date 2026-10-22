// Vista in sola lettura per i link «Condivisione per analisi».
// Legge con privilegi solo dopo aver verificato il token e restituisce un insieme fisso di campi.
import { logServer } from "./alpaca.server";
import { campiNascosti, hashToken, importo, LIMITE_ACCESSI, normalizzaOpzioni, quantita, statoLink, tokenBenFormato, type OpzioniCondivisione } from "./condivisione";
import { VERSIONE_MOTORE, type EsitoVista, type VistaCondivisa } from "./condivisione.types";
import { salvaEvento } from "./event-log.server";
import { INFO_PIATTAFORME, PIATTAFORME_ESTERNE, type Piattaforma } from "./piattaforme.types";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
const nome = (p: string) => INFO_PIATTAFORME[p as Piattaforma]?.nome ?? p;

export async function apriVista(token: unknown): Promise<EsitoVista> {
  if (!tokenBenFormato(token)) return { ok: false, motivo: "non_valido" };
  const db = await admin();
  const { data: link } = await db.from("link_condivisione").select("*").eq("token_hash", await hashToken(token)).maybeSingle();
  if (!link) return { ok: false, motivo: "non_valido" };
  const stato = statoLink(link);
  if (stato !== "attivo") return { ok: false, motivo: stato };
  // Contatore atomico nel database: richieste simultanee non possono superare il limite.
  const { data: ammesso, error: errFreq } = await db.rpc("registra_accesso_condivisione", {
    p_id: link.id,
    p_finestra_secondi: Math.round(LIMITE_ACCESSI.finestraMs / 1000),
    p_massimo: LIMITE_ACCESSI.massimo,
  });
  if (errFreq || ammesso !== true) return { ok: false, motivo: "troppe_richieste" };

  const ora = new Date();
  const registra = !link.ultimo_accesso || ora.getTime() - Date.parse(link.ultimo_accesso) > 10 * 60_000;
  if (registra)
    await salvaEvento({ livello: "info", origine: "condivisione.accesso", tipo: "Condivisione", messaggio: "Link di analisi aperto.", contesto: { link_id: link.id } });

  const vista = await costruisciVista(link.user_id, normalizzaOpzioni(link.opzioni as Partial<OpzioniCondivisione>), {
    nome: link.nome,
    scadeIl: link.scade_il,
  });
  return { ok: true, vista };
}

const ambienti = (o: OpzioniCondivisione) => (o.reale ? (["paper", "reale"] as const) : (["paper"] as const));

export async function costruisciVista(
  userId: string,
  o: OpzioniCondivisione,
  link: { nome: string; scadeIl: string },
): Promise<VistaCondivisa> {
  const db = await admin();
  const avvisi: string[] = [];
  const ok = (a: string) => o.reale || a === "paper";
  const imp = (n: number | null | undefined) => importo(o, n);

  const { panoramicaPiattaforme } = await import("./piattaforme.server");
  const { confrontoConti } = await import("./conti.server");
  const { statoCollegamento } = await import("./alpaca.server");
  const { leggiLezioni } = await import("./apprendimento");
  const { segnaleDi } = await import("./apprendimento");
  const { calcolaStatistiche } = await import("./report.server");

  const pannelli = (await panoramicaPiattaforme(userId)).filter((p) => ok(p.ambiente));
  const [confronto, alpaca, { data: creds }, { data: automazioni }, { data: righe }] = await Promise.all([
    confrontoConti(userId, { riconcilia: false, pannelli }),
    statoCollegamento(userId),
    db.from("piattaforme_credenziali").select("piattaforma, ambiente").eq("user_id", userId),
    db.from("automazioni_conti").select("*").eq("user_id", userId),
    db
      .from("ordini_ia")
      .select("id, created_at, piattaforma, ambiente, conto_id, strategia, ticker, lato, importo, pnl_pct, motivo")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  // Collegamenti: solo stato, mai chiavi o loro parti.
  const collegamenti: VistaCondivisa["collegamenti"] = [];
  for (const a of ambienti(o)) {
    const pan = pannelli.find((p) => p.piattaforma === "alpaca" && p.ambiente === a);
    const proprie = alpaca[a].collegato;
    collegamenti.push({
      piattaforma: "alpaca",
      nome: "Alpaca",
      ambiente: a,
      stato: pan ? pan.stato : proprie ? "errore" : "non collegato",
      messaggio: pan?.stato === "errore" ? pan.messaggio : null,
    });
    for (const p of PIATTAFORME_ESTERNE) {
      const c = (creds ?? []).find((x) => x.piattaforma === p && x.ambiente === a);
      const pn = pannelli.find((x) => x.piattaforma === p && x.ambiente === a);
      collegamenti.push({
        piattaforma: p,
        nome: nome(p),
        ambiente: a,
        stato: !c ? "non collegato" : pn?.stato ?? "errore",
        messaggio: pn?.stato === "errore" ? pn.messaggio : null,
      });
    }
  }
  for (const p of pannelli) if (p.stato === "errore") avvisi.push(`${p.nome} ${p.ambiente.toUpperCase()}: dati del conto non disponibili (${p.messaggio ?? "errore"}).`);

  const tutte = (righe ?? []).filter((r) => ok(r.ambiente));
  if (tutte.length === 2000) avvisi.push("Storico ordini troncato agli ultimi 2.000.");

  const autom: VistaCondivisa["automazioni"] = [];
  for (const a of (automazioni ?? []).filter((x) => ok(x.ambiente))) {
    const esito = (a.ultimo_esito ?? null) as Record<string, unknown> | null;
    const lez = await leggiLezioni(userId, a.piattaforma, a.ambiente === "reale" ? "reale" : "paper", a.strategia);
    const dec = Array.isArray(esito?.["decisioni"]) ? (esito!["decisioni"] as Record<string, unknown>[]) : [];
    autom.push({
      piattaforma: a.piattaforma,
      nome: nome(a.piattaforma),
      ambiente: a.ambiente === "reale" ? "reale" : "paper",
      attivo: a.attivo,
      strategia: a.strategia,
      modalita: a.modalita,
      capitale: imp(Number(a.capitale)),
      perditaMaxGiornaliera: imp(a.perdita_max_giornaliera == null ? null : Number(a.perdita_max_giornaliera)),
      pausaMotivo: a.pausa_motivo,
      pausaIl: a.pausa_il,
      ultimoCiclo: a.ultimo_ciclo,
      modificatoIl: a.updated_at,
      lezioni: lez.riepilogo,
      ultimoEsito: esito
        ? {
            messaggio: String(esito["messaggio"] ?? "").slice(0, 300),
            eseguiti: Number(esito["eseguiti"] ?? 0),
            mercatoAperto: typeof esito["mercatoAperto"] === "boolean" ? (esito["mercatoAperto"] as boolean) : null,
            decisioni: dec.slice(0, 40).map((d) => ({
              ticker: String(d["ticker"] ?? ""),
              azione: String(d["azione"] ?? ""),
              motivo: String(d["motivo"] ?? "").slice(0, 200),
              eseguito: d["eseguito"] === true,
              errore: d["errore"] ? String(d["errore"]).slice(0, 200) : null,
            })),
          }
        : null,
    });
    if (a.attivo && a.ultimo_ciclo && Date.now() - Date.parse(a.ultimo_ciclo) > 10 * 60_000)
      avvisi.push(`${nome(a.piattaforma)} ${a.ambiente.toUpperCase()}: automatico attivo ma ultimo ciclo più vecchio di 10 minuti (motore fermo o sito non pubblicato).`);
  }

  const strategie = {} as VistaCondivisa["strategie"];
  for (const a of ["paper", "reale"] as const) {
    strategie[a] = ok(a)
      ? calcolaStatistiche(
          tutte.filter((r) => r.ambiente === a).map((r) => ({ ...r, importo: Number(r.importo), pnl_pct: r.pnl_pct == null ? null : Number(r.pnl_pct) })),
        ).riepilogo.map((s) => ({ ...s, capitaleInvestito: imp(s.capitaleInvestito) }))
      : [];
  }

  const etichettaConto = new Map<string, string>();
  for (const c of [...confronto.attivi]) if (c.contoId) etichettaConto.set(c.contoId, `attivo ${c.etichetta ?? ""}`.trim());
  const { data: conti } = await db.from("conti_broker").select("conto_id, stato, etichetta").eq("user_id", userId);
  for (const c of conti ?? []) if (!etichettaConto.has(c.conto_id)) etichettaConto.set(c.conto_id, `${c.stato.replace("_", " ")} ${c.etichetta ?? ""}`.trim());

  let ordiniBroker: VistaCondivisa["ordiniBroker"] = null;
  if (o.storico) {
    const { leggiOrdini } = await import("./trading.server");
    ordiniBroker = [];
    for (const a of ambienti(o)) {
      if (!pannelli.some((p) => p.piattaforma === "alpaca" && p.ambiente === a && p.stato === "collegato")) continue;
      for (const b of await leggiOrdini(userId, a === "reale", 100))
        ordiniBroker.push({ ambiente: a, ticker: b.ticker, lato: b.lato, stato: b.stato, tipo: b.tipo, quantita: b.quantita, prezzoMedio: imp(b.prezzoMedio), importo: imp(b.importo), creatoIl: b.creatoIl });
    }
  }

  let curva: VistaCondivisa["curva"] = null;
  if (o.importi) {
    const { storicoConto } = await import("./alpaca.server");
    curva = { paper: await storicoConto(userId, false), reale: o.reale ? await storicoConto(userId, true) : [] };
  }

  if (!pannelli.length) avvisi.push("Nessun conto raggiungibile al momento della lettura.");

  return {
    generataIl: new Date().toISOString(),
    link,
    opzioni: o,
    motore: VERSIONE_MOTORE,
    avvisi,
    collegamenti,
    confronto: {
      aggiornatoIl: confronto.aggiornatoIl,
      attivi: confronto.attivi.map(({ contoId: _c, ...c }) => ({
        ...c,
        capitale: imp(c.capitale),
        pnlRealizzato: imp(c.pnlRealizzato),
        pnlNonRealizzato: imp(c.pnlNonRealizzato),
        flussi: o.importi ? c.flussi : null,
        settimana: c.settimana.map((g) => ({ data: g.data, pnl: imp(g.pnl) })),
      })),
      storici: confronto.storici.filter((c) => ok(c.ambiente)).map(({ id: _i, ...c }) => ({ ...c, pnlRealizzato: imp(c.pnlRealizzato) })),
      nonDeterminati: confronto.nonDeterminati.filter((c) => ok(c.ambiente)).map((c) => ({ ...c, pnlRealizzato: imp(c.pnlRealizzato) })),
    },
    posizioni: o.posizioni
      ? pannelli.flatMap((p) =>
          p.posizioni.map((x) => ({ piattaforma: p.piattaforma, nome: p.nome, ambiente: p.ambiente, ticker: x.ticker, quantita: x.quantita, valore: imp(x.valore), pnlPct: x.pnlPct })),
        )
      : null,
    automazioni: autom,
    strategie,
    ordiniIA: o.storico
      ? tutte.slice(0, 300).map((r) => ({
          createdAt: r.created_at,
          piattaforma: r.piattaforma,
          ambiente: r.ambiente === "reale" ? "reale" : "paper",
          conto: r.conto_id ? etichettaConto.get(r.conto_id) ?? "conto non registrato" : "conto non determinato",
          strategia: r.strategia,
          ticker: r.ticker,
          lato: r.lato,
          importo: imp(Number(r.importo)),
          pnlPct: r.pnl_pct == null ? null : Number(r.pnl_pct),
          segnale: segnaleDi(r.motivo),
          motivo: r.motivo,
        }))
      : null,
    ordiniBroker,
    curva,
  };
}

export function logCondivisione(e: unknown) {
  logServer("condivisione", e);
}
