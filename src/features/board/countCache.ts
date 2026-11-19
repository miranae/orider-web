import type { FirebaseServices } from '../../contexts/FirebaseServicesContext';

type Entry = { expiresAt: number; request: Promise<number> };
type Scope = { viewer: FirebaseServices['auth']['currentUser']; entries: Map<string, Entry> };
const scopes = new WeakMap<FirebaseServices, Scope>();
const TTL_MS = 60_000;
const MAX_ENTRIES = 128;

/** Counts are display metadata. Share identical in-flight reads across mounted lists and
 * short-lived navigation, but never across Firebase sessions. Explicit refresh/mutations clear it. */
export function readBoardCount(services: FirebaseServices, key: string, read: () => Promise<number>): Promise<number> {
  const viewer = services.auth.currentUser;
  let scope = scopes.get(services);
  if (!scope || scope.viewer !== viewer) { scope = { viewer, entries: new Map() }; scopes.set(services, scope); }
  const entries = scope.entries;
  const existing = entries.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.request;
  entries.delete(key);
  const entry: Entry = { expiresAt: Date.now() + 30_000, request: Promise.resolve(0) };
  entry.request = Promise.resolve().then(read).then(value => {
    if (services.auth.currentUser !== viewer) throw new Error('account_changed');
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid_board_count');
    if (entries.get(key) === entry) entry.expiresAt = Date.now() + TTL_MS;
    return value;
  }).catch(error => { if (entries.get(key) === entry) entries.delete(key); throw error; });
  entries.set(key, entry);
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  return entry.request;
}

export function clearBoardCountCache(services: FirebaseServices) { scopes.delete(services); }
