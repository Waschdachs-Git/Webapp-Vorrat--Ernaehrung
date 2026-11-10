import { useSyncExternalStore } from 'react';

/**
 * Service worker registration and app updates.
 *
 * The worker activates a new version as soon as it is installed (skipWaiting +
 * clientsClaim) and drops the previous build's files. A page that keeps
 * running the old code would then fail on the first file it loads late (the
 * scanner, the chart). So the page reloads onto the new version – but only
 * at a moment that costs the user nothing: right at launch, or while the app
 * is in the background. In between a small banner offers the reload.
 */

const CHECK_EVERY_MS = 30 * 60_000;
/** A reload this soon after launch is not noticed as an interruption. */
const LAUNCH_WINDOW_MS = 15_000;

type Listener = () => void;

let started = false;
let updateReady = false;
let interacted = false;
let registration: ServiceWorkerRegistration | undefined;
let lastCheck = Date.now();
const startedAt = Date.now();
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((l) => l());
}

/**
 * Whether a reload would throw something away: an open sheet, or text the
 * user has typed into a field.
 */
export function userIsBusy(): boolean {
  if (document.querySelector('[role="dialog"]')) return true;
  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input, textarea',
  );
  for (const el of fields) {
    if (
      el instanceof HTMLInputElement &&
      ['checkbox', 'radio', 'file', 'hidden', 'button', 'submit'].includes(el.type)
    ) {
      continue;
    }
    if (el.value.trim() !== '') return true;
  }
  return false;
}

function reloadIfIdle(): void {
  if (updateReady && !userIsBusy()) window.location.reload();
}

function onNewVersionActive(): void {
  updateReady = true;
  emit();
  const justLaunched = !interacted && Date.now() - startedAt < LAUNCH_WINDOW_MS;
  if (document.visibilityState === 'hidden' || justLaunched) reloadIfIdle();
}

/** Register the service worker and keep the app up to date. Call once. */
export function startAppUpdates(): void {
  if (started || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  started = true;

  // On the very first visit there is no worker yet; it taking control then
  // is the installation, not an update.
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    onNewVersionActive();
  });

  const register = () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        registration = reg;
      })
      .catch((err) => console.error('Service Worker konnte nicht registriert werden:', err));
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });

  const markInteracted = () => {
    interacted = true;
  };
  window.addEventListener('pointerdown', markInteracted, { once: true, capture: true });
  window.addEventListener('keydown', markInteracted, { once: true, capture: true });

  // An installed app can stay open for days and never navigates, so the
  // browser's own update check (on page load) would rarely run.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      reloadIfIdle();
    } else if (Date.now() - lastCheck > CHECK_EVERY_MS) {
      void checkForUpdate();
    }
  });
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > CHECK_EVERY_MS) {
      void checkForUpdate();
    }
  }, 5 * 60_000);
}

function untilSettled(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(done, 30_000);
    function done(): void {
      window.clearTimeout(timer);
      worker.removeEventListener('statechange', onChange);
      resolve();
    }
    function onChange(): void {
      if (worker.state === 'activated' || worker.state === 'redundant') done();
    }
    worker.addEventListener('statechange', onChange);
    onChange();
  });
}

export type UpdateCheck = 'ready' | 'current' | 'unavailable';

/** Ask the server for a newer version (used by the settings page too). */
export async function checkForUpdate(): Promise<UpdateCheck> {
  lastCheck = Date.now();
  if (updateReady) return 'ready';
  if (!registration) return 'unavailable';
  try {
    await registration.update();
  } catch {
    return 'unavailable'; // offline
  }
  const worker = registration.installing ?? registration.waiting;
  if (worker) await untilSettled(worker);
  // Give the controllerchange event a moment to arrive.
  await new Promise((resolve) => window.setTimeout(resolve, 400));
  return updateReady ? 'ready' : 'current';
}

export function reloadNow(): void {
  window.location.reload();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True once a new version is active and waits for a reload. */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => updateReady,
    () => false,
  );
}

/** "1.1.0 · 10.11.2026" – shown in the settings so support questions are easy. */
export function appVersionLabel(): string {
  const built = new Date(__BUILD_TIME__);
  const date = Number.isNaN(built.getTime())
    ? ''
    : built.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
  return [`Version ${__APP_VERSION__}`, __BUILD_COMMIT__ && `(${__BUILD_COMMIT__})`, date && `· Stand ${date}`]
    .filter(Boolean)
    .join(' ');
}
