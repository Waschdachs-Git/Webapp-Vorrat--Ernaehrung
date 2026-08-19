import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Undo2 } from 'lucide-react';

const VISIBLE_MS = 6000;

interface ToastState {
  id: number;
  message: string;
  undo: () => void | Promise<void>;
}

const UndoContext = createContext<
  (message: string, undo: () => void | Promise<void>) => void
>(() => {});

/** Show a transient "… gelöscht · Rückgängig" bar. */
export function useUndo(): (
  message: string,
  undo: () => void | Promise<void>,
) => void {
  return useContext(UndoContext);
}

export function UndoToastProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const nextId = useRef(0);

  const show = useCallback(
    (message: string, undo: () => void | Promise<void>) => {
      window.clearTimeout(timer.current);
      setToast({ id: nextId.current++, message, undo });
      timer.current = window.setTimeout(() => setToast(null), VISIBLE_MS);
    },
    [],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const runUndo = async () => {
    if (!toast) return;
    window.clearTimeout(timer.current);
    setToast(null);
    await toast.undo();
  };

  return (
    <UndoContext.Provider value={show}>
      {children}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            // Sits just above the tab bar so it never covers the primary nav.
            className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+68px)] z-40 flex justify-center px-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          >
            <div
              role="status"
              className="pointer-events-auto flex w-full max-w-sm items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-card"
            >
              <span className="truncate text-[14px] text-text">
                {toast.message}
              </span>
              <button
                type="button"
                onClick={runUndo}
                className="flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg px-2 text-[14px] font-medium text-accent active:bg-accent-soft"
              >
                <Undo2 size={16} /> Rückgängig
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </UndoContext.Provider>
  );
}
