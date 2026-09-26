import { type ReactNode } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

export interface WeightPoint {
  date: string;
  kg: number;
}

/** Weight trend line. Split into its own chunk — Recharts is large. */
export function WeightChart({ data }: { data: WeightPoint[] }): ReactNode {
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgb(var(--c-border))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'rgb(var(--c-faint))' }}
            stroke="rgb(var(--c-border))"
            tickLine={false}
            minTickGap={28}
            padding={{ left: 12, right: 4 }}
          />
          {/* Whole-kilo bounds and ticks: the old dataMin-1 domain produced
              ticks like 74.3 that were clipped to ".3" in a 36px gutter. */}
          <YAxis
            domain={[
              (min: number) => Math.floor(min - 0.5),
              (max: number) => Math.ceil(max + 0.5),
            ]}
            allowDecimals={false}
            tickCount={4}
            tickFormatter={(v: number) => `${v}`}
            tick={{ fontSize: 11, fill: 'rgb(var(--c-faint))' }}
            stroke="rgb(var(--c-border))"
            tickLine={false}
            axisLine={false}
            width={34}
          />
          <Tooltip
            contentStyle={{
              background: 'rgb(var(--c-surface))',
              border: '1px solid rgb(var(--c-border))',
              borderRadius: 12,
              fontSize: 12,
              color: 'rgb(var(--c-text))',
            }}
            formatter={(v: number) => [`${v.toLocaleString('de-DE')} kg`, 'Gewicht']}
          />
          <Line
            type="monotone"
            dataKey="kg"
            stroke="rgb(var(--c-accent))"
            strokeWidth={2.5}
            dot={{ r: 3, fill: 'rgb(var(--c-accent))' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
