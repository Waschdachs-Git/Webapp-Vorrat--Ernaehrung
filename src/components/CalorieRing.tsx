import { type ReactNode } from 'react';
import { motion } from 'framer-motion';

/**
 * Calorie progress ring (consumed vs. goal). Animates the stroke as a small,
 * meaningful micro-interaction. transform/opacity-friendly.
 */
export function CalorieRing({
  consumed,
  goal,
  size = 184,
  stroke = 14,
}: {
  consumed: number;
  goal: number;
  size?: number;
  stroke?: number;
}): ReactNode {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = goal > 0 ? Math.min(1.2, consumed / goal) : 0;
  const remaining = Math.round(goal - consumed);
  const over = remaining < 0;

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(consumed)} von ${Math.round(goal)} kcal`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-2"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={over ? 'stroke-warn' : 'stroke-accent'}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - Math.min(1, pct)) }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum text-[30px] font-semibold leading-none text-text">
          {Math.abs(remaining)}
        </span>
        <span className="mt-1 text-[13px] text-muted">
          {over ? 'kcal über Ziel' : 'kcal übrig'}
        </span>
        <span className="tnum mt-0.5 text-[12px] text-faint">
          {Math.round(consumed)} von {Math.round(goal)} gegessen
        </span>
      </div>
    </div>
  );
}
