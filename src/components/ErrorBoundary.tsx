import { Component, type ErrorInfo, type ReactNode } from 'react';
import { exportData } from '@/lib/backup';
import { Button } from './ui';

const RELOAD_GUARD = 'vorrat:chunk-reload-at';
const RELOAD_COOLDOWN_MS = 30_000;

/**
 * A lazily loaded file could not be fetched. Typical right after an update:
 * the running page still asks for the previous build's files, which the new
 * service worker has already replaced. A reload fixes it.
 */
export function isChunkLoadError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /ChunkLoadError|dynamically imported module|Importing a module script failed|module script|Unable to preload CSS/i.test(
    text,
  );
}

/** One automatic reload per cooldown, so a real outage cannot loop. */
function claimAutoReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_GUARD, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

interface Props {
  children: ReactNode;
  /** Inside the app shell: the navigation stays, only the page is replaced. */
  compact?: boolean;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence against a render error. Without it React unmounts the
 * whole tree and an installed app is left with a blank white screen and no
 * browser controls to recover.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unerwarteter Fehler:', error, info.componentStack);
    if (isChunkLoadError(error) && claimAutoReload()) {
      window.location.reload();
    }
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkLoadError(error);

    return (
      <div
        role="alert"
        className={
          this.props.compact
            ? 'mx-auto max-w-md px-6 py-16 text-center'
            : 'mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6 py-10 text-center'
        }
      >
        <h1 className="font-serif text-[26px] font-semibold leading-tight tracking-[-0.01em] text-text">
          {chunk ? 'Die App wurde aktualisiert' : 'Da ist etwas schiefgelaufen'}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          {chunk
            ? 'Ein Teil der App konnte nicht geladen werden. Bitte lade sie neu – ohne Internetverbindung klappt das eventuell erst später.'
            : 'Dieser Bereich konnte nicht angezeigt werden. Deine Daten sind gespeichert. Lade die App neu – hilft das nicht, sichere deine Daten als Datei.'}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button block onClick={() => window.location.reload()}>
            App neu laden
          </Button>
          {!chunk && (
            <Button
              block
              variant="secondary"
              onClick={() => {
                exportData().catch((err) => console.error('Export fehlgeschlagen:', err));
              }}
            >
              Daten als Datei sichern
            </Button>
          )}
        </div>
        {!chunk && (
          <details className="mt-6 text-left text-[12px] text-faint">
            <summary className="cursor-pointer text-center">Technische Details</summary>
            <p className="mt-2 break-words">
              {error.name}: {error.message}
            </p>
          </details>
        )}
      </div>
    );
  }
}
