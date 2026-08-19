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
import { Button, Card, Field, Input, SegmentedControl, cx } from '@/components/ui';
import { useSettings, updateSettings } from '@/hooks/useSettings';
import { exportData, importData } from '@/lib/backup';
import type { ThemeMode } from '@/db/types';

const ACCENT_PRESETS = [
  '#3b6e4f', // muted green (default)
  '#4c6ea8', // slate blue
  '#9c6e4f', // clay
  '#7a5bb0', // muted violet
  '#b5791e', // amber
  '#46807a', // teal
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
  const [keyInput, setKeyInput] = useState(settings.spoonacularApiKey ?? '');
  const [keySaved, setKeySaved] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  // Importing replaces everything, so it goes through an explicit confirmation.
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const saveKey = async () => {
    await updateSettings({ spoonacularApiKey: keyInput.trim() || undefined });
    setKeySaved(true);
    window.setTimeout(() => setKeySaved(false), 1500);
  };

  const runImport = async () => {
    if (!pendingImport) return;
    setImporting(true);
    try {
      const text = await pendingImport.text();
      await importData(text);
      setImportMsg('Daten erfolgreich importiert.');
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
        {/* Spoonacular */}
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <KeyRound size={18} className="text-muted" />
            <h2 className="text-[15px] font-semibold text-text">Spoonacular API-Key</h2>
          </div>
          <Field
            label="API-Key"
            hint="Für Rezeptsuche. Kostenlos auf spoonacular.com/food-api. Wird nur lokal gespeichert."
          >
            <Input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="z. B. a1b2c3…"
            />
          </Field>
          <Button onClick={saveKey} variant="secondary" className="mt-3 w-full">
            {keySaved ? (
              <>
                <Check size={16} /> Gespeichert
              </>
            ) : (
              'Key speichern'
            )}
          </Button>
        </Card>

        {/* Appearance */}
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Palette size={18} className="text-muted" />
            <h2 className="text-[15px] font-semibold text-text">Darstellung</h2>
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
          <h2 className="mb-1 text-[15px] font-semibold text-text">Backup</h2>
          <p className="mb-3 text-[13px] text-muted">
            Alle Daten liegen lokal in diesem Browser. Exportiere regelmäßig –
            das schützt vor Datenverlust, falls Safari-Daten gelöscht werden.
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
                Einkaufsliste und Profil vollständig. Das lässt sich nicht
                rückgängig machen – am besten vorher exportieren.
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
            <p className="mt-3 text-[13px] text-muted">{importMsg}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
