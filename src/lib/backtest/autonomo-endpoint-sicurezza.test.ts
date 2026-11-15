import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
describe('confine backtest autonomo',()=>{
 it('lettori autonomi non importano esecuzione/live/ordini né scrivono conti',()=>{
  for(const name of ['universo-alpaca.server.ts','autonomo.functions.ts','screening-autonomo.ts','ledger-ia.ts','ledger-ia.server.ts','ia-autonoma.ts','screening-ia.server.ts','comitato-autonomo.server.ts','universo-nasdaq.server.ts','comitato.server.ts']){
   const source=readFileSync(new URL(name,import.meta.url),'utf8');
   const imports=[...source.matchAll(/(?:from\s*|import\s*\()['"]([^'"]+)['"]/g)].map(m=>m[1]??'');
   expect(imports.some(path=>/(?:^|\/)(?:trading|alpaca|historique|esecuzione|riconciliazione|apprendimento)(?:\.|\/)/.test(path))).toBe(false);
   expect(source).not.toMatch(/\.from\(['"](?:automazioni_conti|registro_ordini|ordini_ia|lease_conti)['"]\)/);
   expect(source).not.toMatch(/\.(?:insert|upsert|update|delete)\(/);
   expect(source).not.toMatch(/\/v2\/orders|\/v2\/positions|(?<!paper-)api\.alpaca\.markets/);
  }
 });
});