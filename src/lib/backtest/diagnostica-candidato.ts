import { z } from 'zod';
import type { EvidenzeAutonome } from './evidenze-autonome';
import type { AssetAutonomo } from './universo-autonomo';

const tickerSchema = z.string().regex(/^[A-Z0-9./-]{1,15}$/);
const classeSchema = z.enum(['azione', 'etf', 'crypto', 'us_equity_non_classificata']);
export const richiestaDiagnosticaSchema = z.object({
  ticker: tickerSchema, classe: classeSchema, data: z.iso.date(),
  candidati: z.array(z.object({ ticker: tickerSchema, classe: classeSchema })).min(1).max(3),
}).refine(x => x.data >= '1970-01-01' && x.data <= new Date().toISOString().slice(0, 10), 'Data non valida.')
  .refine(x => x.candidati.some(c => c.ticker === x.ticker && c.classe === x.classe), 'Ticker/classe non coerenti con i candidati del checkpoint.');
export type RichiestaDiagnostica = z.infer<typeof richiestaDiagnosticaSchema>;
export type DiagnosiCandidato = Pick<EvidenzeAutonome, 'diagnostica' | 'avvisi' | 'mancante'> & { ticker: string; classe: AssetAutonomo['classe']; data: string; validi: number; acquisitaIl: string };

/** Read-only evidence diagnostic: only the injected evidence loader runs — no ledger, budget, screening, committee or model. */
export async function diagnosticaCandidato(userId: string, r: RichiestaDiagnostica, carica: (u: string, t: string, d: string, c: AssetAutonomo['classe']) => Promise<EvidenzeAutonome>, ora = () => new Date().toISOString()): Promise<DiagnosiCandidato> {
  const ev = await carica(userId, r.ticker, r.data, r.classe);
  return { ticker: r.ticker, classe: r.classe, data: r.data, diagnostica: ev.diagnostica, avvisi: ev.avvisi, mancante: ev.mancante, validi: ev.evidenze.length, acquisitaIl: ora() };
}
