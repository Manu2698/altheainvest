import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Download, Play, Pause, Stethoscope, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { useSessione } from '@/hooks/useSessione';
import { STRATEGIE } from '@/lib/strategies';
import { getUniversoAutonomo, getUniversoNasdaq, getUniversoIbrido, getBloccoAutonomo, getPrezziAutonomi, getCambiAutonomi, getDiagnosticaAlpaca, apriRunIA, getStatoRunIA, eseguiScreeningIA, eseguiComitatoIA } from '@/lib/backtest/autonomo.functions';
import { preparaAutonomo, simulaAutonomo, type EsitoAutonomo, type DatiAutonomi, type ParametriAutonomi, type Copertura } from '@/lib/backtest/autonomo';
import { blocchi, verificaSerie, type AssetAutonomo, type UniversoAutonomo } from '@/lib/backtest/universo-autonomo';
import { checkpointAutonomo } from '@/lib/backtest/checkpoint-autonomo';
import { acquisisciBlocchiAlpaca, type StatoAcquisizione } from '@/lib/backtest/acquisizione-ibrida';
import { eleggibiliScreening, candidatiComitato, statoIA, type StatoIA, type EsitoComitatoUI } from '@/lib/backtest/ia-autonoma';

type Fonte = 'nasdaq' | 'alpaca' | 'ibrida';
type Universo = UniversoAutonomo & { esclusiPerMotivo?: Record<string, number> };
type Diagnostica = Awaited<ReturnType<typeof getDiagnosticaAlpaca>>;
type RunServer = { riservate: number; max: number; stato: string; motivo: string | null } | null;
type Checkpoint = { dati: DatiAutonomi; ia: StatoIA; errore: string; inCorso?: string[] | undefined; universo?: Universo | null };
type Salvataggio = { id: string; parametri: ParametriAutonomi; esito: EsitoAutonomo; etichetta: string };
const vuoti = (): DatiAutonomi => ({ strumenti: [], serie: {}, cambi: {}, errori: {}, avvisi: [] });
const iaVuota = (): StatoIA => ({ runId: null, screening: {}, comitati: {}, messaggi: [] });
const n = (v: number) => v.toFixed(2);
const BLOCCO_FONTE = /HTTP (401|402|403|429)/;

/** Processed instruments only: unprocessed universe members are reported as pending, never as excluded. */
function elaborati(d: DatiAutonomi): DatiAutonomi { return { ...d, strumenti: d.strumenti.filter(s => d.serie[s.ticker] || d.errori[s.ticker]) }; }

export function BacktestAutonomo() {
  const { utente, caricata, autenticato } = useSessione();
  const fn = { nasdaq: useServerFn(getUniversoNasdaq), ibrido: useServerFn(getUniversoIbrido), alpaca: useServerFn(getUniversoAutonomo), blocco: useServerFn(getBloccoAutonomo), prezzi: useServerFn(getPrezziAutonomi), cambi: useServerFn(getCambiAutonomi), diag: useServerFn(getDiagnosticaAlpaca), apri: useServerFn(apriRunIA), statoRun: useServerFn(getStatoRunIA), screening: useServerFn(eseguiScreeningIA), comitato: useServerFn(eseguiComitatoIA) };
  const [p, setP] = useState<ParametriAutonomi>({ dal: '2025-07-01', al: '2025-12-31', strategia: 'medio', quotaPct: 10, commissione: 0, spreadBps: 10, slippageBps: 5 });
  const [fonte, setFonte] = useState<Fonte>('ibrida'), [classe, setClasse] = useState<'tutte' | 'azione' | 'etf' | 'crypto'>('tutte'), [limite, setLimite] = useState(40), [budget, setBudget] = useState(0), [simboli, setSimboli] = useState('');
  const [universo, setUniverso] = useState<Universo | null>(null), [d, setD] = useState<DatiAutonomi>(vuoti), [ia, setIa] = useState<StatoIA>(iaVuota), [run, setRun] = useState<RunServer>(null);
  const [busy, setBusy] = useState(false), [stato, setStato] = useState(''), [errore, setErrore] = useState(''), [copertura, setCopertura] = useState<Copertura[]>([]);
  const [esito, setEsito] = useState<EsitoAutonomo | null>(null), [esitoIA, setEsitoIA] = useState<EsitoAutonomo | null>(null), [diag, setDiag] = useState<Diagnostica | null>(null), [salvati, setSalvati] = useState<Salvataggio[]>([]);
  const stop = useRef(false);
  const inCorso = useRef<string[] | undefined>(undefined);
  const storage = `althea-autonomo-v2-${utente?.id ?? 'locale'}`;
  const chiave = JSON.stringify({ v: 3, fonte, dal: p.dal, al: p.al });

  useEffect(() => { if (!caricata) return; try { const v = JSON.parse(localStorage.getItem(storage) ?? '[]'); setSalvati(Array.isArray(v) ? v : []); } catch { setErrore('Salvataggi non leggibili.'); } }, [storage, caricata]);
  // Resume the owner-scoped checkpoint for this source/period after a reload.
  useEffect(() => { if (!utente) return; let vivo = true; inCorso.current = undefined; checkpointAutonomo<Checkpoint>(utente.id, chiave).then(c => { if (!vivo || !c) return; inCorso.current = c.inCorso; setD(c.dati); setUniverso(c.universo ?? null); setIa(c.ia ?? iaVuota()); setCopertura(preparaAutonomo(p, elaborati(c.dati)).copertura); if (c.errore) setErrore(c.errore); if (c.ia?.runId) fn.statoRun({ data: { runId: c.ia.runId } }).then(r => { if (vivo) setRun(r); }).catch(() => setRun(null)); setStato('Checkpoint ripreso da questo dispositivo: lo stato del budget IA resta quello del server.'); }).catch(() => setErrore('Archivio locale non disponibile.')); return () => { vivo = false; }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utente?.id, chiave]);

  const salvaCk = async (dati: DatiAutonomi, statoIa: StatoIA, err = '', catalogo = universo) => { if (utente) await checkpointAutonomo<Checkpoint>(utente.id, chiave, { dati, ia: statoIa, errore: err, inCorso: inCorso.current, universo: catalogo }); };
  const filtra = (s: AssetAutonomo) => classe === 'tutte' || s.classe === classe;

  async function caricaUniverso(): Promise<Universo> {
    const r: Universo = fonte === 'nasdaq' ? await fn.nasdaq() : fonte === 'ibrida' ? await fn.ibrido() : await fn.alpaca();
    setUniverso(r); return r;
  }
  async function scopri() {
    if (busy) return; setBusy(true); setErrore('');
    try { if (!autenticato) throw new Error('Accedi per acquisire l’universo.'); const r = await caricaUniverso(); const dati = { ...d, strumenti: r.strumenti, avvisi: r.avvisi }; await salvaCk(dati, ia, '', r); setD(dati); setStato(`${r.strumenti.length} strumenti classificati nel catalogo ${r.provider}`); }
    catch (e) { setStato('INCOMPLETE'); setErrore(e instanceof Error ? e.message : 'Catalogo non disponibile.'); } finally { setBusy(false); }
  }

  async function acquisisci() {
    if (busy) return; setBusy(true); setErrore(''); setEsito(null); setEsitoIA(null); stop.current = false;
    let dati: DatiAutonomi = { ...d, serie: { ...d.serie }, cambi: { ...d.cambi }, errori: { ...d.errori }, strumenti: d.strumenti.map(s => ({ ...s })) };
    try {
      if (!autenticato || !utente) throw new Error('Accedi per acquisire lo storico.');
      let catalogo = universo;
      if (!dati.strumenti.length) { const r = await caricaUniverso(); catalogo = r; dati = { ...dati, strumenti: r.strumenti, avvisi: r.avvisi }; }
      const assets = dati.strumenti.filter((s): s is AssetAutonomo => 'classe' in s).filter(filtra);
      const scelti = simboli.toUpperCase().split(/[\s,;]+/).filter(Boolean);
      const ignoti = scelti.filter(t => !assets.some(s => s.ticker === t));
      if (ignoti.length) dati.avvisi = [...dati.avvisi.filter(a => !a.startsWith('Simboli non presenti')), `Simboli non presenti nell’universo classificato (esclusi): ${ignoti.join(', ')}.`];
      const daFare = assets.filter(s => (!scelti.length || scelti.includes(s.ticker)) && !dati.serie[s.ticker] && !dati.errori[s.ticker]).slice(0, Math.max(1, limite));
      if (!daFare.length) setStato('Nessuno strumento da acquisire con il filtro scelto: tutti già elaborati.');
      if (daFare.some(s => s.valuta === 'USD') && !dati.cambi['USD']) { setStato('Cambi storici EUR/USD'); dati.cambi['USD'] = await fn.cambi({ data: { valuta: 'USD', dal: p.dal, al: p.al } }); await salvaCk(dati, ia); }
      if (fonte === 'ibrida') {
        const acquisizione: StatoAcquisizione = { serie: dati.serie, errori: dati.errori, inCorso: inCorso.current };
        await acquisisciBlocchiAlpaca(daFare, acquisizione, p.dal, p.al, limite, {
          prezzi: strumenti => fn.blocco({ data: { strumenti, dal: p.dal, al: p.al } }),
          checkpoint: async s => { inCorso.current = s.inCorso; await salvaCk(dati, ia, '', catalogo); setD({ ...dati }); },
          stop: () => stop.current,
          progresso: (i, totale) => setStato(`Alpaca PAPER/IEX blocco ${i}/${totale}`),
        });
      } else if (fonte === 'alpaca') {
        const bs = blocchi(daFare, 25);
        for (let i = 0; i < bs.length && !stop.current; i++) {
          const b = bs[i] ?? []; setStato(`Alpaca blocco ${i + 1}/${bs.length}`);
          const r = await fn.blocco({ data: { strumenti: b, dal: p.dal, al: p.al } });
          Object.assign(dati.serie, r.serie); Object.assign(dati.errori, r.errori);
          for (const s of b) { try { verificaSerie(s, dati.serie[s.ticker] ?? [], p.dal, p.al); } catch (e) { dati.errori[s.ticker] = e instanceof Error ? e.message : 'Serie non verificata.'; } }
          await salvaCk(dati, ia);
        }
      } else {
        for (let i = 0; i < daFare.length && !stop.current; i++) {
          const s = daFare[i]; if (!s) continue; setStato(`Prezzi FMP ${i + 1}/${daFare.length} · ${s.ticker}`);
          try { const r = await fn.prezzi({ data: { ticker: s.ticker, valuta: 'USD', mercato: 'azioni', fonte: 'FMP', dal: p.dal, al: p.al } }); dati.serie[s.ticker] = r.barre; verificaSerie(s, r.barre, p.dal, p.al); }
          catch (e) {
            const msg = e instanceof Error ? e.message : 'Fonte non disponibile.';
            // Source-level refusal: stop without marking the remaining instruments, so they resume later.
            if (BLOCCO_FONTE.test(msg)) { delete dati.serie[s.ticker]; await salvaCk(dati, ia, `Fonte prezzi bloccata (${msg}): scansione arrestata, nessun reinvio automatico. Riprendi più tardi.`); throw new Error(`Fonte prezzi bloccata (${msg}): scansione arrestata; gli strumenti non elaborati restano in coda.`); }
            dati.errori[s.ticker] = msg;
          }
          await salvaCk(dati, ia);
        }
      }
      const prep = preparaAutonomo(p, elaborati(dati)); setCopertura(prep.copertura);
      setStato(stop.current ? 'Scansione interrotta: copertura parziale, riprendibile.' : `Acquisizione completata per questa sessione: ${Object.keys(prep.serie).length} strumenti utilizzabili.`);
    } catch (e) { setStato('INCOMPLETE'); setErrore(e instanceof Error ? e.message : 'Acquisizione interrotta.'); }
    finally { setD(dati); setBusy(false); }
  }

  function salva(es: EsitoAutonomo, etichetta: string) {
    const next = [{ id: crypto.randomUUID(), parametri: p, esito: es, etichetta }, ...salvati].slice(0, 10);
    try { localStorage.setItem(storage, JSON.stringify(next)); setSalvati(next); } catch { setErrore('Risultato calcolato ma non salvato: spazio locale insufficiente.'); }
  }
  function simulaRegole() {
    setErrore(''); try { const r = simulaAutonomo(p, elaborati(d)); setEsito(r); setCopertura(r.copertura); salva(r, 'solo regole'); setStato(`Simulazione solo regole completata su ${r.config.titoli.length} strumenti (nessuna IA).`); }
    catch (e) { setErrore(e instanceof Error ? e.message : 'Simulazione non riuscita.'); }
  }

  async function avviaIA() {
    if (busy) return; setBusy(true); setErrore(''); setEsitoIA(null); stop.current = false;
    let s: StatoIA = { ...ia, screening: { ...ia.screening }, comitati: { ...ia.comitati }, messaggi: [] };
    try {
      if (!utente) throw new Error('Accedi per usare il ledger IA del server.');
      const dati = elaborati(d), prep = preparaAutonomo(p, dati);
      const assets = dati.strumenti.filter((x): x is AssetAutonomo => 'classe' in x && !!prep.serie[x.ticker]);
      const inputs = eleggibiliScreening(assets, dati.serie, p.dal);
      if (!inputs.length) throw new Error('Nessuno strumento eleggibile: acquisisci prima lo storico (almeno 20 barre prima della data iniziale).');
      const pendenti = inputs.filter(i => !s.screening[i.ticker]), necessari = Math.ceil(pendenti.length / 10);
      if (budget < necessari) throw new Error(`Budget insufficiente: lo screening di tutti i ${inputs.length} eleggibili richiede ancora ${necessari} chiamate (+9 per ogni comitato). Nessuna chiamata inviata.`);
      if (!s.runId || (run && run.stato !== 'attivo')) { const r = await fn.apri({ data: { max: Math.min(200, budget) } }); s = { ...s, runId: r.runId }; setRun(r.stato); await salvaCk(d, s); }
      const runId = s.runId; if (!runId) throw new Error('Run IA non aperto.');
      const bs = blocchi(inputs, 10);
      for (let i = 0; i < bs.length && !stop.current; i++) {
        const b = bs[i] ?? []; if (b.every(x => s.screening[x.ticker])) continue;
        setStato(`Screening IA blocco ${i + 1}/${bs.length}`);
        const r = await fn.screening({ data: { runId, strategia: p.strategia, inputs: b } }); setRun(r.run);
        if (r.esito.stato === 'negata') { s.messaggi.push(r.esito.motivo); break; }
        for (const v of r.esito.risultato) s.screening[v.ticker] = v;
        setIa({ ...s }); await salvaCk(d, s);
      }
      const cand = candidatiComitato(s.screening, 3);
      for (const t of cand) {
        if (stop.current || s.comitati[t]) continue;
        const input = inputs.find(i => i.ticker === t); if (!input) continue;
        setStato(`Comitato IA · ${t}`);
        const r = await fn.comitato({ data: { runId, strategia: p.strategia, input } }); setRun(r.run);
        const e = r.esito;
        const c: EsitoComitatoUI = e.stato === 'non_eseguibile' ? { stato: 'non_eseguibile', motivo: e.motivo } : e.stato === 'negata' ? { stato: 'negata', motivo: e.motivo } : { stato: 'eseguito', approvato: e.risultato.approvato, azione: e.risultato.azione, motivo: e.risultato.motivo, chiamate: e.risultato.chiamate };
        s.comitati[t] = c; setIa({ ...s }); await salvaCk(d, s);
        if (c.stato === 'negata') { s.messaggi.push(c.motivo); break; }
      }
      const st = statoIA(inputs.map(i => i.ticker), s, 3);
      s.messaggi.push(...st.motivi); setIa({ ...s }); await salvaCk(d, s);
      if (st.completo) {
        if (!st.approvati.length) setStato('IA COMPLETE: nessun candidato approvato dal comitato; il capitale resterebbe in liquidità.');
        else { const filtrati = { ...dati, strumenti: dati.strumenti.filter(x => st.approvati.includes(x.ticker)) }; const r = simulaAutonomo(p, filtrati); setEsitoIA(r); salva(r, `IA · ${st.approvati.join(', ')}`); setStato(`IA COMPLETE: portafoglio condiviso su ${st.approvati.length} strumenti approvati.`); }
      } else setStato('IA INCOMPLETE: nessun risultato IA dichiarato.');
    } catch (e) { setStato('IA INCOMPLETE'); setErrore(e instanceof Error ? e.message : 'Screening interrotto.'); }
    finally { setIa(s); setBusy(false); }
  }

  async function diagnostica() { setBusy(true); try { setDiag(await fn.diag()); } catch (e) { setErrore(e instanceof Error ? e.message : 'Diagnostica non disponibile.'); } finally { setBusy(false); } }
  const modifica = (v: Partial<ParametriAutonomi>) => { setP(old => ({ ...old, ...v })); setEsito(null); setEsitoIA(null); if (v.dal !== undefined || v.al !== undefined) { setD(old => ({ ...vuoti(), strumenti: old.strumenti, avvisi: old.avvisi })); setIa(iaVuota()); setCopertura([]); } };

  const assets = d.strumenti.filter((s): s is AssetAutonomo => 'classe' in s);
  const nelFiltro = assets.filter(filtra), fatti = nelFiltro.filter(s => d.serie[s.ticker] || d.errori[s.ticker]).length;
  const inclusi = copertura.filter(x => x.incluso).length;
  const eleggibili = eleggibiliScreening(assets.filter(s => copertura.some(c => c.ticker === s.ticker && c.incluso)), d.serie, p.dal);
  const screenati = Object.keys(ia.screening).length, stIA = statoIA(eleggibili.map(i => i.ticker), ia, 3);
  const perClasse = (c: string) => assets.filter(s => s.classe === c).length;

  return <section className="border-b border-border pb-8 mb-8 space-y-5 min-w-0">
    <header><h2 className="text-xl font-semibold">Backtest autonomo multi-asset</h2><p className="text-xs text-warn mt-2">50 EUR · accantonamento fino a 25 EUR/mese solo da profitto netto realizzato · solo simulazione, nessun ordine · IA {stIA.completo ? 'COMPLETE' : 'INCOMPLETE'}</p></header>
    <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs space-y-2">Strategia<Select value={p.strategia} onValueChange={v => modifica({ strategia: v as ParametriAutonomi['strategia'] })}><SelectTrigger aria-label="Strategia autonoma"><SelectValue /></SelectTrigger><SelectContent>{STRATEGIE.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent></Select></label>
      {(['dal', 'al'] as const).map(k => <label key={k} className="text-xs space-y-2">{k === 'dal' ? 'Dal' : 'Al'}<Input aria-label={`Autonomo ${k}`} type="date" value={p[k]} onChange={e => modifica({ [k]: e.target.value })} /></label>)}
      <label className="text-xs space-y-2">Universo e prezzi<Select value={fonte} onValueChange={v => { setFonte(v as Fonte); setD(vuoti()); setUniverso(null); setIa(iaVuota()); setCopertura([]); }}><SelectTrigger aria-label="Fonte universo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ibrida">Nasdaq Trader + prezzi Alpaca PAPER</SelectItem><SelectItem value="nasdaq">Nasdaq Trader + prezzi FMP</SelectItem><SelectItem value="alpaca">Alpaca PAPER (catalogo + prezzi)</SelectItem></SelectContent></Select></label>
      <label className="text-xs space-y-2">Classe<Select value={classe} onValueChange={v => setClasse(v as typeof classe)}><SelectTrigger aria-label="Classe strumenti"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tutte">Tutte le classi disponibili</SelectItem><SelectItem value="azione">Solo azioni</SelectItem><SelectItem value="etf">Solo ETF</SelectItem><SelectItem value="crypto">Solo crypto</SelectItem></SelectContent></Select></label>
      <label className="text-xs space-y-2">Strumenti da acquisire in questa sessione<Input aria-label="Limite sessione" type="number" min="1" max="2000" value={limite} onChange={e => setLimite(Math.max(1, Math.min(2000, Math.floor(Number(e.target.value) || 1))))} /></label>
      <label className="text-xs space-y-2 sm:col-span-2">Simboli da acquisire (facoltativo, separati da virgola; vuoto = coda dell’universo)<Input aria-label="Simboli autonomi" value={simboli} placeholder="AAPL, MSFT, SPY, KO" onChange={e => setSimboli(e.target.value)} /></label>
      <label className="text-xs space-y-2">Budget massimo chiamate IA (server, max 200)<Input aria-label="Budget IA autonomo" type="number" min="0" max="200" step="1" value={budget} onChange={e => setBudget(Math.max(0, Math.min(200, Math.floor(Number(e.target.value) || 0))))} /></label>
      {([{ k: 'quotaPct', l: 'Quota simulata per titolo (%)' }, { k: 'commissione', l: 'Commissione simulata (EUR)' }, { k: 'spreadBps', l: 'Spread simulato (bps)' }, { k: 'slippageBps', l: 'Slippage simulato (bps)' }] as const).map(x => <label key={x.k} className="text-xs space-y-2">{x.l}<Input aria-label={x.l} type="number" min="0" value={p[x.k]} onChange={e => modifica({ [x.k]: Number(e.target.value) })} /></label>)}
    </fieldset>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={scopri}>Acquisisci universo</Button>
      <Button disabled={busy} onClick={acquisisci}><Play className="size-4" />Acquisisci storico / riprendi</Button>
      <Button variant="outline" disabled={busy || !inclusi} onClick={simulaRegole}>Simula solo regole</Button>
      <Button variant="outline" disabled={busy || !eleggibili.length || budget < 1} onClick={avviaIA}><Sparkles className="size-4" />Screening IA + comitato</Button>
      {busy && <Button variant="outline" onClick={() => { stop.current = true; }}><Pause className="size-4" />Interrompi</Button>}
      <Button variant="ghost" disabled={busy} onClick={diagnostica}><Stethoscope className="size-4" />Diagnostica Alpaca PAPER</Button>
    </div>
    <p className="text-xs text-muted-foreground numeric">Universo: {assets.length} ({perClasse('azione')} azioni · {perClasse('etf')} ETF · {perClasse('crypto')} crypto · {perClasse('us_equity_non_classificata')} non classificati) · nel filtro {nelFiltro.length} · elaborati {fatti} · in coda {nelFiltro.length - fatti} · utilizzabili {inclusi} · eleggibili IA {eleggibili.length} · screening IA {screenati}/{eleggibili.length} · comitati {Object.values(ia.comitati).filter(c => c.stato === 'eseguito').length} · budget server {run ? `${run.riservate}/${run.max} riservate · run ${run.stato}` : 'nessun run'}</p>
    {universo && <p className="text-xs text-muted-foreground">Provider: {universo.provider} · aggiornato {universo.aggiornatoIl} · righe acquisite {universo.totaleAcquisito} · copertura corrente, non mondiale.</p>}
    {Object.keys(d.errori).length > 0 && <details className="text-xs"><summary>Errori per simbolo: {Object.keys(d.errori).length}</summary><ul className="max-h-72 overflow-auto mt-2">{Object.entries(d.errori).map(([t, m]) => <li key={t}>{t} · {m}</li>)}</ul></details>}
    {eleggibili.length > 0 && <p className="text-xs text-muted-foreground">Stima: {Math.ceil(eleggibili.filter(i => !ia.screening[i.ticker]).length / 10)} chiamate per lo screening residuo + fino a 9 per ciascuno dei 3 migliori candidati BUY al comitato. Le chiamate vengono prenotate dal server prima dell’invio; richieste identiche già completate non vengono ripagate.</p>}
    {universo?.esclusiPerMotivo && <details className="text-xs"><summary className="cursor-pointer">Esclusi dal catalogo {universo.provider}: {Object.values(universo.esclusiPerMotivo).reduce((a, b) => a + b, 0)}</summary><ul className="mt-2 space-y-1">{Object.entries(universo.esclusiPerMotivo).map(([m, c]) => <li key={m}>{c} · {m}</li>)}</ul></details>}
    {diag && <div className="border border-border p-3 text-xs space-y-2"><p className="font-semibold">{diag.conclusione}</p><ul className="space-y-1">{diag.controlli.map(c => <li key={c.nome} className={c.ok ? '' : 'text-bear'}>{c.ok ? 'OK' : 'KO'} · {c.nome}: {c.dettaglio}</li>)}</ul><p>{diag.rimedio}</p></div>}
    {stato && <p role="status" className="text-xs">{stato}</p>}{errore && <p role="alert" className="text-sm text-bear break-words">{errore}</p>}
    {ia.messaggi.length > 0 && <ul className="text-xs text-warn space-y-1">{ia.messaggi.map((m, i) => <li key={i}>{m}</li>)}</ul>}
    {screenati > 0 && <details open className="text-xs"><summary className="font-semibold text-sm cursor-pointer">Screening IA alla data {p.dal} (solo dati precedenti)</summary><div className="max-h-72 overflow-auto mt-2 space-y-1">{Object.values(ia.screening).sort((a, b) => b.priorita - a.priorita).map(v => <p key={v.ticker} className="break-words">{v.ticker} · {v.verdetto} · priorità {v.priorita} · {v.motivazione}{ia.comitati[v.ticker] ? ` · comitato: ${ia.comitati[v.ticker]?.stato === 'eseguito' ? (ia.comitati[v.ticker] as { approvato: boolean }).approvato ? 'APPROVATO' : 'NON APPROVATO' : ia.comitati[v.ticker]?.stato} — ${ia.comitati[v.ticker]?.motivo}` : ''}</p>)}</div></details>}
    <p className="text-xs text-muted-foreground">Checkpoint dei dati su questo dispositivo; budget, idempotenza e blocchi IA sono registrati dal server. Universo corrente (survivorship bias), dividendi e conoscenza pregressa del modello non eliminati.</p>
    {salvati.length > 0 && <div className="space-y-2"><h3 className="text-sm font-semibold">Risultati salvati su questo dispositivo</h3><div className="flex flex-wrap gap-2">{salvati.map(s => <Button key={s.id} className="h-auto max-w-full whitespace-normal text-left" variant="outline" disabled={busy} onClick={() => { setP(s.parametri); setEsito(s.esito); setCopertura(s.esito.copertura); }}>{s.etichetta} · {s.parametri.strategia} · {s.parametri.dal} / {s.parametri.al} · {n(s.esito.risultato.equity)} EUR</Button>)}</div></div>}
    {esitoIA && <Risultato titolo="Risultato IA (screening + comitato) · EUR" esito={esitoIA} />}
    {esito && <Risultato titolo="Risultato solo regole · EUR" esito={esito} />}
    {copertura.length > 0 && <details><summary className="font-semibold text-sm cursor-pointer">Copertura: {inclusi} inclusi / {copertura.length - inclusi} esclusi su {copertura.length} elaborati</summary><div className="max-h-80 overflow-auto mt-3 space-y-2 text-xs">{copertura.map(x => <p key={x.ticker} className="break-words">{x.ticker} · {x.incluso ? 'INCLUSO' : 'ESCLUSO'} · {x.barre} barre · {x.dal ?? '—'} / {x.al ?? '—'} · {x.motivo}</p>)}</div></details>}
    <div className="text-xs text-muted-foreground space-y-2">{(esito?.avvisi ?? d.avvisi).map((a, i) => <p key={i}>{a}</p>)}</div>
  </section>;
}

function Risultato({ titolo, esito }: { titolo: string; esito: EsitoAutonomo }) {
  const r = esito.risultato;
  function esporta() { const url = URL.createObjectURL(new Blob([JSON.stringify(esito, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'althea-backtest-autonomo.json'; a.click(); URL.revokeObjectURL(url); }
  const celle = [{ l: 'Capitale iniziale', v: '50.00 EUR' }, { l: 'Valore finale', v: n(r.equity) + ' EUR' }, { l: 'Profitto / perdita netti (con accantonato)', v: n(r.equity + r.accantonato - 50) + ' EUR' }, { l: 'Accantonato per Lovable', v: n(r.accantonato) + ' EUR' }, { l: 'Mesi coperti / non coperti', v: `${r.mesiCapitale.filter(m => m.scoperto < 0.005).length} / ${r.mesiCapitale.filter(m => m.scoperto >= 0.005).length}` }, { l: 'Rendimento composto', v: n(r.rendimentoCompostoPct) + '%' }, { l: 'P/L non realizzato', v: n(r.pnlAperto) + ' EUR' }, { l: 'Liquidità residua', v: n(r.liquidita) + ' EUR' }, { l: 'Acquisti / vendite', v: `${r.acquisti} / ${r.vendite}` }, { l: 'Costi di transazione', v: n(r.costi) + ' EUR' }, { l: 'Drawdown massimo', v: n(r.drawdownPct) + '%' }, { l: 'Strumenti simulati', v: String(esito.config.titoli.length) }];
  return <div className="space-y-4 border-t border-border pt-4">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{titolo}</h3><Button variant="outline" onClick={esporta}><Download className="size-4" />Esporta</Button></div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{celle.map(x => <div key={x.l}><p className="text-xs text-muted-foreground">{x.l}</p><p className="font-semibold numeric break-words">{x.v}</p></div>)}</div>
    <details open><summary className="font-semibold text-sm cursor-pointer">Capitale mese per mese · costo Lovable 25 EUR</summary><div className="overflow-auto mt-3"><table className="w-full text-xs numeric"><thead><tr className="text-left text-muted-foreground">{['Mese', 'Capitale inizio', 'Realizzato netto', 'Costi transazione', 'Non realizzato', 'Accantonato', 'Non coperto', 'Reinvestito', 'Capitale investibile', 'Rendimento'].map(h => <th key={h} className="pr-3 pb-2 font-normal">{h}</th>)}</tr></thead><tbody>{r.mesiCapitale.map(m => <tr key={m.mese} className="border-t border-border"><td className="pr-3 py-1">{m.mese}</td><td className="pr-3">{n(m.capitaleInizio)}</td><td className="pr-3">{n(m.realizzato)}</td><td className="pr-3">{n(m.costiTransazione)}</td><td className="pr-3">{n(m.nonRealizzato)}</td><td className="pr-3">{n(m.accantonato)}</td><td className={m.scoperto >= 0.005 ? 'pr-3 text-bear' : 'pr-3'}>{n(m.scoperto)}</td><td className="pr-3">{n(m.reinvestito)}</td><td className="pr-3">{n(m.capitaleInvestibile)}</td><td>{n(m.rendimentoPct)}%</td></tr>)}</tbody></table></div></details>
    <details><summary className="font-semibold text-sm cursor-pointer">Posizioni aperte e operazioni</summary><div className="max-h-80 overflow-auto space-y-2 mt-3 text-xs">{Object.entries(r.posizioni).map(([t, v]) => <p key={t}>{t} · {v.quantita.toFixed(6)} · valore {n(v.quantita * v.prezzo)} EUR</p>)}{r.operazioni.map((o, i) => <p key={i}>{o.ticker} · {o.lato} · segnale {o.segnale} → esecuzione {o.esecuzione} · {o.quantita.toFixed(6)} · {n(o.prezzo)} EUR · costo {n(o.costo)} EUR</p>)}</div></details>
  </div>;
}
