import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PuntoStorico } from "@/lib/alpaca.server";

const fmt = (v: number) => `${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} $`;

export function EquityChart({ dati }: { dati: PuntoStorico[] }) {
  if (dati.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-xs text-muted-foreground">
        Nessuno storico disponibile: collega il conto per vedere la curva reale.
      </div>
    );
  }
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dati} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="giorno" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={48} tickFormatter={(v: string) => v.slice(5)} />
          <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} width={90} tickFormatter={fmt} />
          <Tooltip
            contentStyle={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: "12px", color: "var(--color-foreground)", fontSize: 12 }}
            formatter={(value: number) => [fmt(value), "Valore conto"]}
          />
          <Area type="monotone" dataKey="valore" stroke="var(--color-primary)" strokeWidth={2} fill="url(#equityFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
