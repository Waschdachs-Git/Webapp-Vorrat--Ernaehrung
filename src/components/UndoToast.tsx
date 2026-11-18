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
            // Sits just above the tab bar so it never covers the primary nav,
            // and above sheets (z-50): a sheet that is still closing must not
            // hide the one chance to undo.
            className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+68px)] z-[60] flex justify-center px-5 md:bottom-6 md:left-[88px] lg:left-60"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          >
            <div
              role="status"
              // Inverted – ink on the paper ground – so it cannot be missed.
              className="pointer-events-auto flex w-full max-w-sm items-center justify-between gap-3 rounded-[14px] bg-text py-2 pl-4 pr-2 shadow-pop"
            >
              <span className="truncate text-[14px] text-bg">
                {toast.message}
              </span>
              <button
                type="button"
                onClick={runUndo}
                className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[14px] font-semibold text-bg underline decoration-bg/40 underline-offset-4 active:bg-bg/15"
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
