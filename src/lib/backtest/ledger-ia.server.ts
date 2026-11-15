import type { Ledger, Prenotazione } from './ledger-ia';
// Ledger RPCs are executable only by service_role; userId always comes from the verified session.
export async function apriRunIA(userId: string, max: number): Promise<string> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.rpc('ia_backtest_apri_run', { p_user: userId, p_max: max });
  if (error || typeof data !== 'string') throw new Error(error?.message?.includes('Limite') ? error.message : 'Ledger IA server non disponibile: nessuna chiamata autorizzata.');
  return data;
}
export async function ledgerServer(userId: string, runId: string): Promise<Ledger> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return {
    async riserva(chiave, tipo, n) {
      const { data, error } = await supabaseAdmin.rpc('ia_backtest_riserva', { p_user: userId, p_run: runId, p_chiave: chiave, p_tipo: tipo, p_n: n });
      if (error || !data || typeof data !== 'object') throw new Error('Prenotazione ledger non confermata: nessuna chiamata IA.');
      return data as unknown as Prenotazione;
    },
    async chiudi(chiave, stato, effettive, risultato, errore, statoRun) {
      const { data, error } = await supabaseAdmin.rpc('ia_backtest_chiudi', { p_user: userId, p_run: runId, p_chiave: chiave, p_stato: stato, p_effettive: effettive as number, p_risultato: (risultato ?? null) as never, p_errore: errore as string, p_stato_run: statoRun as string });
      if (error) throw new Error('Chiusura ledger non confermata.');
      return data === true;
    },
  };
}
export async function statoRunIA(userId: string, runId: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin.from('ia_backtest_run').select('riservate,max_chiamate,stato,motivo').eq('id', runId).eq('user_id', userId).maybeSingle();
  return data ? { riservate: data.riservate, max: data.max_chiamate, stato: data.stato, motivo: data.motivo } : null;
}
