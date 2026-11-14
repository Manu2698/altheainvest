import { evidenzeAllaData, type Evidenza } from "./motore";
type Riga = Record<string, unknown>;
// Unknown publication timezone: wait until the following UTC day; never use fiscal date.
function dopoPubblicazione(data: unknown): string | null {
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(data)) return null;
  const giorno = data.slice(0,10), t = Date.parse(`${giorno}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0,10) !== giorno) return null;
  return new Date(t+86400000).toISOString();
}
export function bilanciStorici(righe: Riga[], ticker: string, data: string): Evidenza[] {
  const campi = ["date","symbol","reportedCurrency","period","fiscalYear","filingDate","acceptedDate","revenue","netIncome","eps","operatingIncome","grossProfit","totalAssets","totalLiabilities","totalDebt","cashAndCashEquivalents","operatingCashFlow","freeCashFlow"];
  const documenti: Evidenza[] = [];
  for (const r of righe) {
    if (r["symbol"] !== ticker) continue;
    const disponibileIl = dopoPubblicazione(r["acceptedDate"] ?? r["filingDate"]);
    if (!disponibileIl || !campi.some(k => typeof r[k] === "number" && Number.isFinite(r[k]))) continue;
    documenti.push({disponibileIl,fonte:`Financial Modeling Prep · ${ticker} · pubblicazione ${String(r["filingDate"] ?? r["acceptedDate"])}`,tipo:"fondamentali",contenuto:JSON.stringify(Object.fromEntries(campi.filter(k => r[k] !== undefined).map(k => [k,r[k]])))});
  }
  return evidenzeAllaData(documenti,data).sort((a,b) => a.disponibileIl.localeCompare(b.disponibileIl)).slice(-4);
}
export function notizieStoriche(righe: Riga[], ticker: string, data: string): Evidenza[] {
  const cutoff = Date.parse(`${data}T00:00:00Z`), inizio = cutoff-7*86400000;
  const documenti: Evidenza[] = [];
  for (const r of righe) {
    const created = typeof r["created_at"] === "string" ? Date.parse(r["created_at"]) : NaN;
    const updated = typeof r["updated_at"] === "string" ? Date.parse(r["updated_at"]) : created;
    if (!Array.isArray(r["symbols"]) || !r["symbols"].includes(ticker) || !Number.isFinite(created) || !Number.isFinite(updated) || created<inizio || created>cutoff || updated>cutoff || typeof r["headline"] !== "string" || typeof r["url"] !== "string" || !/^https:\/\//.test(r["url"])) continue;
    documenti.push({disponibileIl:new Date(created).toISOString(),fonte:String(r["url"]).slice(0,200),tipo:"news",contenuto:`${r["headline"]}\n${String(r["summary"] ?? "")}`.slice(0,4000)});
  }
  return documenti.sort((a,b) => a.disponibileIl.localeCompare(b.disponibileIl)).slice(-8);
}
