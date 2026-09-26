import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { clampPct } from '@/lib/nutrition';
import type { Nutriments, Targets } from '@/db/types';

interface MacroDef {
  key: 'protein' | 'carbs' | 'fat';
  label: string;
  colorClass: string;
}

const MACROS: MacroDef[] = [
  { key: 'protein', label: 'Protein', colorClass: 'bg-protein' },
  { key: 'carbs', label: 'Kohlenhydrate', colorClass: 'bg-carbs' },
  { key: 'fat', label: 'Fett', colorClass: 'bg-fat' },
];

export function MacroBars({
  consumed,
  targets,
}: {
  consumed: Nutriments;
  targets: Targets;
}): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      {MACROS.map((m) => {
        const value = consumed[m.key];
        const goal = targets[m.key];
        const pct = clampPct(value, goal);
        const left = Math.round(goal - value);
        return (
          <div key={m.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium text-muted">
                {m.label}
                <span className="tnum ml-1.5 font-normal text-faint">
                  {Math.round(value)} / {Math.round(goal)} g
                </span>
              </span>
              <span
                className={`tnum text-[13px] font-medium ${left < 0 ? 'text-warn' : 'text-text'}`}
              >
                {left < 0 ? `${-left} g drüber` : `noch ${left} g`}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              {/* scaleX instead of width: animates on the compositor. */}
              <motion.div
                className={`h-full w-full origin-left rounded-full ${m.colorClass}`}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: pct / 100 }}
                transition={{ type: 'spring', stiffness: 140, damping: 22 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
