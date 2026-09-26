/**
 * URL of the Dexie Cloud database used for syncing between devices. It is
 * not a secret (it only identifies the database; access needs a login).
 * Empty = sync disabled, the app then works purely locally.
 */
export const CLOUD_DATABASE_URL: string =
  (import.meta.env.VITE_DEXIE_CLOUD_URL as string | undefined) ?? '';
