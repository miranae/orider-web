import type { FirebaseServices } from "../../contexts/FirebaseServicesContext";
import { logClientError } from '../../services/errorLogger';
import { Timestamp, type Firestore, type DocumentSnapshot } from 'firebase/firestore';

const PREFIX = 'orider:board-cursors:v1:';
const TTL = 5 * 60_000;
const MAX_ENTRIES = 200;
type StoredCursor = { page: number; id: string; value: number | { seconds: number; nanoseconds: number }; expiresAt: number };
const memory = new Map<string, StoredCursor>();
const namespace = (firestore: Firestore, scope: string) => `${PREFIX}${JSON.stringify([firestore.app?.options?.projectId, firestore.app?.name, scope])}:`;
const storage = (services?: FirebaseServices) => { try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch (error) { logClientError('board:cursor:storage_access', error, undefined, services); return null; } };

export function clearBoardPageCursors(services?: FirebaseServices) {
  memory.clear();
  const store = storage(services);
  try { if (store) for (const key of Object.keys(store)) if (key.startsWith(PREFIX)) store.removeItem(key); } catch (error) { logClientError('board:cursor:clear', error, undefined, services); }
}

export function saveBoardPageCursor(firestore: Firestore, scope: string, page: number, snapshot: DocumentSnapshot, services?: FirebaseServices) {
  const raw: unknown = snapshot.data()?.createdAt;
  const value = typeof raw === 'number' && Number.isFinite(raw) ? raw
    : raw instanceof Timestamp ? { seconds: raw.seconds, nanoseconds: raw.nanoseconds } : null;
  if (value === null) return;
  const entry: StoredCursor = { page, id: snapshot.id, value, expiresAt: Date.now() + TTL }, key = namespace(firestore, scope) + page;
  memory.delete(key); memory.set(key, entry);
  while (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value!);
  try {
    const store = storage(services); store?.setItem(key, JSON.stringify(entry));
    const keys = store ? Object.keys(store).filter(key => key.startsWith(PREFIX)) : [];
    if (keys.length > MAX_ENTRIES) keys.slice(0, keys.length - MAX_ENTRIES).forEach(key => store?.removeItem(key));
  } catch (error) { logClientError('board:cursor:save', error, undefined, services); }
}

/** 계정·Firebase 앱·필터가 같은 가장 가까운 앞 페이지 앵커만 재사용한다. */
export function nearestBoardPageCursor(firestore: Firestore, scope: string, beforePage: number, services?: FirebaseServices) {
  const prefix = namespace(firestore, scope), store = storage(services);
  try {
    if (store) for (const key of Object.keys(store)) {
      if (!key.startsWith(prefix)) continue;
      const entry = JSON.parse(store.getItem(key) ?? 'null') as StoredCursor | null;
      if (entry) memory.set(key, entry);
    }
  } catch (error) { logClientError('board:cursor:restore', error, undefined, services); }
  let best: StoredCursor | null = null;
  for (const [key, entry] of memory) {
    if (!key.startsWith(prefix) || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now() || !Number.isSafeInteger(entry.page) || entry.page < 1 || entry.page >= beforePage
      || typeof entry.id !== 'string' || !entry.id || entry.id.includes('/')) continue;
    const validValue = typeof entry.value === 'number' ? Number.isFinite(entry.value)
      : entry.value && Number.isSafeInteger(entry.value.seconds) && entry.value.seconds >= -62135596800 && entry.value.seconds <= 253402300799
        && Number.isInteger(entry.value.nanoseconds) && entry.value.nanoseconds >= 0 && entry.value.nanoseconds < 1e9;
    if (validValue && (!best || entry.page > best.page)) best = entry;
  }
  if (!best) return null;
  return { page: best.page, id: best.id, value: typeof best.value === 'number' ? best.value : new Timestamp(best.value.seconds, best.value.nanoseconds) };
}
