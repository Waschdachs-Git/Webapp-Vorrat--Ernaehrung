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
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-border))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'rgb(var(--c-faint))' }}
            stroke="rgb(var(--c-border))"
          />
          <YAxis
            domain={['dataMin - 1', 'dataMax + 1']}
            tick={{ fontSize: 11, fill: 'rgb(var(--c-faint))' }}
            stroke="rgb(var(--c-border))"
            width={36}
          />
          <Tooltip
            contentStyle={{
              background: 'rgb(var(--c-surface))',
              border: '1px solid rgb(var(--c-border))',
              borderRadius: 12,
              fontSize: 12,
              color: 'rgb(var(--c-text))',
            }}
            formatter={(v: number) => [`${v} kg`, 'Gewicht']}
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
