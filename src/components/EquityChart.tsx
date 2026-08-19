import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEuro, type PuntoEquity } from "@/lib/strategies";

export function EquityChart({ dati }: { dati: PuntoEquity[] }) {
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
          <XAxis
            dataKey="giorno"
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={48}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={72}
            tickFormatter={(v: number) => formatEuro(v)}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
              borderRadius: "12px",
              color: "var(--color-foreground)",
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [
              formatEuro(value),
              name === "valore" ? "Portafoglio IA" : "Benchmark S&P 500",
            ]}
          />
          <Area
            type="monotone"
            dataKey="valore"
            stroke="var(--color-primary)"
            strokeWidth={2}
            fill="url(#equityFill)"
          />
          <Line
            type="monotone"
            dataKey="benchmark"
            stroke="var(--color-chart-5)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
