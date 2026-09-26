import { type ReactNode, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Vaul-style bottom sheet for input flows. Spring-based, touch-friendly,
 * only animates transform/opacity. Honours prefers-reduced-motion via CSS.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}): ReactNode {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="absolute inset-0 bg-[rgb(24_18_10/0.5)]"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl bg-surface shadow-sheet sm:rounded-3xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <div
                className="absolute left-1/2 top-2 h-1 w-9 -translate-x-1/2 rounded-full bg-border"
                aria-hidden
              />
              <h2 className="font-serif text-[23px] font-semibold tracking-[-0.01em] text-text">{title}</h2>
              <button
                onClick={onClose}
                aria-label="Schließen"
                className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-muted active:bg-surface-2"
              >
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
