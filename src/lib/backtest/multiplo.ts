import { simula, type Barra, type ConfigTest, type RisultatoTest, type Verdetto } from "./motore";
export function leggiTitoli(testo: string): string[] {
  const titoli = [...new Set(testo.toUpperCase().split(/[\s,;]+/).filter(Boolean))];
  if (!titoli.length || titoli.length > 20 || titoli.some(t => !/^[A-Z0-9./-]{1,15}$/.test(t))) throw new Error("Scegli da 1 a 20 simboli validi, separati da virgole.");
  return titoli;
}
export type TestTitolo = { config: ConfigTest; barre: Barra[]; fonte: string; verdetti: Record<string, Verdetto>; risultato: RisultatoTest | null; errore: string };
export function eseguiTitolo(config: ConfigTest, barre: Barra[], fonte: string, verdetti: Record<string, Verdetto> = {}): TestTitolo {
  try { return { config, barre, fonte, verdetti, risultato: simula(config, barre, verdetti), errore: "" }; }
  catch (e) { return { config, barre, fonte, verdetti, risultato: null, errore: e instanceof Error ? e.message : "Test non disponibile." }; }
}
