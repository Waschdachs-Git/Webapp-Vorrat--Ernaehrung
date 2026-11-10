import { type ReactNode, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Download,
  Upload,
  KeyRound,
  Palette,
  Check,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { SyncCard } from '@/components/SyncCard';
import { cloudEnabled } from '@/db/database';
import { Button, Card, Field, Input, SegmentedControl, cx } from '@/components/ui';
import { useSettings, updateSettings } from '@/hooks/useSettings';
import { exportData, importData } from '@/lib/backup';
import {
  type UpdateCheck,
  appVersionLabel,
  checkForUpdate,
  reloadNow,
  useUpdateReady,
} from '@/lib/appUpdate';
import type { ThemeMode } from '@/db/types';

const ACCENT_PRESETS = [
  '#247a4e', // herb green (default)
  '#2f6db5', // cobalt
  '#b4532f', // terracotta
  '#7b52ab', // plum
  '#0f7c80', // teal
  '#3d3d3a', // graphite
];

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

export function Settings(): ReactNode {
  const settings = useSettings();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const storedKey = settings.spoonacularApiKey ?? '';
  // null = untouched: the field follows the stored key, which arrives late
  // (the settings load asynchronously, or sync in from another device). An
  // initial value taken once would show an empty field although a key is
  // stored – and saving that would delete it.
  const [keyDraft, setKeyDraft] = useState<string | null>(null);
  const keyValue = keyDraft ?? storedKey;
  const keyChanged = keyValue.trim() !== storedKey;
  const removingKey = keyChanged && keyValue.trim() === '';
  const [keySaved, setKeySaved] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  // Importing replaces everything, so it goes through an explicit confirmation.
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const saveKey = async () => {
    await updateSettings({ spoonacularApiKey: keyValue.trim() || undefined });
    setKeyDraft(null);
    setKeySaved(true);
    window.setTimeout(() => setKeySaved(false), 1500);
  };

  const runImport = async () => {
    if (!pendingImport) return;
    setImporting(true);
    try {
      const text = await pendingImport.text();
      const { skipped } = await importData(text);
      setImportMsg(
        skipped === 0
          ? 'Daten erfolgreich importiert.'
          : `Daten importiert. ${skipped} ${
              skipped === 1 ? 'fehlerhafter Eintrag wurde' : 'fehlerhafte Einträge wurden'
            } übersprungen.`,
      );
    } catch (err) {
      setImportMsg(
        err instanceof Error ? err.message : 'Import fehlgeschlagen.',
      );
    } finally {
      setImporting(false);
      setPendingImport(null);
    }
  };

  return (
    <div className="pb-24">
      <PageHeader
        title="Einstellungen"
        action={
          <button
            onClick={() => navigate(-1)}
            aria-label="Zurück"
            className="flex h-10 items-center gap-1 rounded-full pl-1 pr-2 text-muted active:bg-surface-2"
          >
            <ChevronLeft size={22} /> Zurück
          </button>
        }
      />

      <div className="flex flex-col gap-5 px-5">
        {cloudEnabled && <SyncCard />}

        {/* Spoonacular */}
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <KeyRound size={18} className="text-muted" />
            <h2 className="font-serif text-[21px] font-semibold tracking-[-0.01em] text-text">Online-Rezeptsuche</h2>
          </div>
          <Field
            label="Schlüssel (API-Key)"
            hint={`Kostenloser Schlüssel von spoonacular.com/food-api. Er gehört zu deinen Einstellungen${
              cloudEnabled ? ' (mit Anmeldung auch auf deinen anderen Geräten)' : ''
            } und steht nicht in Backup-Dateien.`}
          >
            <Input
              type="password"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={keyValue}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="z. B. a1b2c3…"
            />
          </Field>
          <p className="mt-2 text-[13px] text-muted">
            {storedKey ? 'Ein Schlüssel ist gespeichert.' : 'Noch kein Schlüssel gespeichert.'}
          </p>
          <Button
            onClick={saveKey}
            variant={removingKey ? 'danger' : 'secondary'}
            className="mt-3 w-full"
            disabled={!keyChanged && !keySaved}
          >
            {keySaved ? (
              <>
                <Check size={16} /> Gespeichert
              </>
            ) : removingKey ? (
              'Schlüssel entfernen'
            ) : (
              'Schlüssel speichern'
            )}
          </Button>
        </Card>

        {/* Appearance */}
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Palette size={18} className="text-muted" />
            <h2 className="font-serif text-[21px] font-semibold tracking-[-0.01em] text-text">Darstellung</h2>
          </div>

          <Field label="Modus">
            <SegmentedControl
              value={settings.theme}
              onChange={(theme) => updateSettings({ theme })}
              options={THEME_OPTIONS}
            />
          </Field>

          <p className="mb-2 mt-4 text-[13px] font-medium text-muted">
            Akzentfarbe
          </p>
          <div className="flex flex-wrap gap-3">
            {ACCENT_PRESETS.map((color) => (
              <button
                key={color}
                onClick={() => updateSettings({ accentColor: color })}
                aria-label={`Akzentfarbe ${color}`}
                className={cx(
                  'h-9 w-9 rounded-full transition-transform active:scale-95',
                  settings.accentColor === color
                    ? 'ring-2 ring-text ring-offset-2 ring-offset-surface'
                    : '',
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </Card>

        {/* Backup */}
        <Card>
          <h2 className="mb-1 font-serif text-[21px] font-semibold tracking-[-0.01em] text-text">Backup</h2>
          <p className="mb-3 text-[13px] text-muted">
            Ohne Anmeldung liegen alle Daten nur in diesem Browser. Exportiere
            regelmäßig – das schützt vor Datenverlust, falls Safari-Daten
            gelöscht werden.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={() => exportData()}>
              <Download size={16} /> Export
            </Button>
            <Button
              variant="secondary"
              block
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={16} /> Import
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setImportMsg(null);
                setPendingImport(file);
              }
              e.target.value = '';
            }}
          />

          {pendingImport && (
            <div className="mt-3 rounded-xl border border-danger/30 bg-danger/5 p-3">
              <p className="text-[14px] font-medium text-text">
                Import überschreibt alle Daten
              </p>
              <p className="mt-1 text-[13px] text-muted">
                „{pendingImport.name}“ ersetzt Vorrat, Tagebuch, Rezepte,
                Einkaufsliste und Profil vollständig – bei aktiver
                Synchronisierung auf allen Geräten. Das lässt sich nicht
                rückgängig machen, am besten vorher exportieren.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="secondary"
                  block
                  onClick={() => exportData()}
                  disabled={importing}
                >
                  <Download size={16} /> Erst sichern
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setPendingImport(null)}
                  disabled={importing}
                >
                  Abbrechen
                </Button>
              </div>
              <Button
                block
                className="mt-2 bg-danger"
                onClick={runImport}
                disabled={importing}
              >
                {importing ? 'Importiere…' : 'Jetzt ersetzen'}
              </Button>
            </div>
          )}

          {importMsg && (
            <p role="status" className="mt-3 text-[13px] text-muted">
              {importMsg}
            </p>
          )}
        </Card>

        <AppInfo />
      </div>
    </div>
  );
}

/** Which build runs here, and a manual way to fetch a newer one. */
function AppInfo(): ReactNode {
  const ready = useUpdateReady();
  const [state, setState] = useState<'idle' | 'checking' | UpdateCheck>('idle');

  const check = async () => {
    setState('checking');
    setState(await checkForUpdate());
  };

  const message =
    ready || state === 'ready'
      ? 'Eine neue Version ist geladen.'
      : state === 'current'
        ? 'Du hast die aktuelle Version.'
        : state === 'unavailable'
          ? 'Gerade nicht möglich – besteht eine Internetverbindung?'
          : null;

  return (
    <section className="px-1 pb-2">
      <p className="tnum text-[13px] text-faint">{appVersionLabel()}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
        {ready || state === 'ready' ? (
          <button
            type="button"
            onClick={reloadNow}
            className="min-h-[40px] text-[14px] font-semibold text-accent active:opacity-60"
          >
            Jetzt neu laden
          </button>
        ) : (
          <button
            type="button"
            onClick={check}
            disabled={state === 'checking'}
            className="min-h-[40px] text-[14px] font-medium text-accent active:opacity-60 disabled:opacity-50"
          >
            {state === 'checking' ? 'Suche …' : 'Nach Update suchen'}
          </button>
        )}
        {message && (
          <p role="status" className="text-[13px] text-muted">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
