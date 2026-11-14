import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

describe('isolamento rules-only',()=>{
 it('i moduli raggiungibili non importano modelli, comitato o invio ordini',()=>{
  const visited=new Set<string>();
  function walk(url:URL){const path=fileURLToPath(url);if(visited.has(path))return;visited.add(path);const source=readFileSync(path,'utf8');
    expect(source).not.toMatch(/(?:from\s*|import\s*\()['"](?:.*(?:comitato|esecuzione|apprendimento|alpaca\.server)|ai|@ai-sdk\/[^'"]+)['"]/);
    for(const match of source.matchAll(/(?:from\s*|import\s*\()['"](\.[^'"]+)['"]/g)){const relative=match[1];if(relative)walk(new URL(relative+'.ts',url));}
  }
  walk(new URL('./autonomo.ts',import.meta.url));
  walk(new URL('./prezzi-fmp.server.ts',import.meta.url));
  expect(visited.size).toBeGreaterThan(3);
 });
});