/**
 * URL of the Dexie Cloud database used for syncing between devices. It is
 * not a secret (it only identifies the database; access needs a login and
 * the app's origin must be whitelisted). Override with VITE_DEXIE_CLOUD_URL;
 * set it to an empty string to build a purely local app.
 */
export const CLOUD_DATABASE_URL: string =
  (import.meta.env.VITE_DEXIE_CLOUD_URL as string | undefined) ??
  'https://zz8j5exwx.dexie.cloud';
