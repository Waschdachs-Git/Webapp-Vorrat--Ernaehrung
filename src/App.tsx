import { type ReactNode, useEffect, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, PROFILE_ID, ensureSeeded } from '@/db/database';
import { useTheme } from '@/hooks/useTheme';
import { TabBar } from '@/components/TabBar';
import { UndoToastProvider } from '@/components/UndoToast';
import { Today } from '@/pages/Today';
import { Inventory } from '@/pages/Inventory';
import { Shopping } from '@/pages/Shopping';
import { Recipes } from '@/pages/Recipes';
import { Profile } from '@/pages/Profile';
import { Settings } from '@/pages/Settings';
import { Onboarding } from '@/pages/Onboarding';

export function App(): ReactNode {
  useTheme();
  const [seeded, setSeeded] = useState(false);
  // Coalesce the "no profile row yet" case to null so we can tell it apart
  // from the "query still loading" case (both would otherwise be undefined).
  const profile = useLiveQuery(
    async () => (await db.profile.get(PROFILE_ID)) ?? null,
    [],
  );

  useEffect(() => {
    // Always release the splash, even if seeding fails, so the UI never hangs.
    ensureSeeded()
      .catch((err) => console.error('Seeding fehlgeschlagen:', err))
      .finally(() => setSeeded(true));
  }, []);

  // Wait for seeding + the first profile read before deciding what to render.
  if (!seeded || profile === undefined) {
    return <SplashScreen />;
  }

  if (profile === null) {
    return <Onboarding onDone={() => { /* live query re-renders automatically */ }} />;
  }

  return <AppShell />;
}

function AppShell(): ReactNode {
  const location = useLocation();

  return (
    <UndoToastProvider>
      <div className="mx-auto flex h-[100dvh] max-w-3xl flex-col">
        <main className="flex-1 overflow-y-auto pt-safe">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
            >
              <Routes location={location}>
                <Route path="/" element={<Navigate to="/heute" replace />} />
                <Route path="/heute" element={<Today />} />
                <Route path="/vorrat" element={<Inventory />} />
                <Route path="/einkauf" element={<Shopping />} />
                <Route path="/rezepte" element={<Recipes />} />
                <Route path="/profil" element={<Profile />} />
                <Route path="/einstellungen" element={<Settings />} />
                <Route path="*" element={<Navigate to="/heute" replace />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </main>
        <TabBar />
      </div>
    </UndoToastProvider>
  );
}

function SplashScreen(): ReactNode {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-3">
      <div className="h-12 w-12 animate-pulse rounded-2xl bg-accent" />
      <p className="text-[14px] text-muted">Vorrat &amp; Ernährung</p>
    </div>
  );
}
