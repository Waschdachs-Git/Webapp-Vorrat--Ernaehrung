import { type ReactNode, useState } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import { Trash2, Check } from 'lucide-react';
import { cx } from './ui';

/**
 * A list row that reveals an action when swiped horizontally.
 * Swipe left -> destructive action (delete). Optional swipe right -> confirm.
 */
export function SwipeRow({
  children,
  onSwipeLeft,
  onSwipeRight,
  rightLabel,
  className,
}: {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  rightLabel?: string;
  /** Override the default rounding, e.g. for rows inside a flat list. */
  className?: string;
}): ReactNode {
  const x = useMotionValue(0);
  const [removing, setRemoving] = useState(false);
  const threshold = 96;

  return (
    <div className={cx('relative overflow-hidden', className ?? 'rounded-2xl')}>
      {/* Left action (revealed by swiping right) */}
      {onSwipeRight && (
        <div className="absolute inset-y-0 left-0 flex items-center gap-1.5 bg-accent px-5 text-white">
          <Check size={18} />
          <span className="text-[13px] font-medium">{rightLabel ?? 'OK'}</span>
        </div>
      )}
      {/* Right action (revealed by swiping left) */}
      {onSwipeLeft && (
        <div className="absolute inset-y-0 right-0 flex items-center gap-1.5 bg-danger px-5 text-white">
          <span className="text-[13px] font-medium">Löschen</span>
          <Trash2 size={18} />
        </div>
      )}
      <motion.div
        drag="x"
        style={{ x }}
        dragConstraints={{
          left: onSwipeLeft ? -threshold * 1.3 : 0,
          right: onSwipeRight ? threshold * 1.3 : 0,
        }}
        dragElastic={0.12}
        animate={removing ? { opacity: 0, height: 0 } : undefined}
        onDragEnd={(_, info) => {
          if (onSwipeLeft && info.offset.x < -threshold) {
            setRemoving(true);
            window.setTimeout(onSwipeLeft, 160);
          } else if (onSwipeRight && info.offset.x > threshold) {
            animate(x, 0, { type: 'spring', stiffness: 400, damping: 36 });
            onSwipeRight();
          } else {
            animate(x, 0, { type: 'spring', stiffness: 400, damping: 36 });
          }
        }}
        className="relative bg-surface"
      >
        {children}
      </motion.div>
    </div>
  );
}
