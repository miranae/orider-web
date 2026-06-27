/**
 * Firebase mock state & helpers.
 * Import this in tests to control Firebase behavior.
 */
import { vi } from "vitest";

// ─── Auth State ───────────────────────────────────────────
type AuthCallback = (user: MockUser | null) => void;

export interface MockUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

let _currentUser: MockUser | null = null;
const _authListeners: Set<AuthCallback> = new Set();

export function simulateLogin(user?: Partial<MockUser>) {
  _currentUser = {
    uid: user?.uid ?? "test-uid",
    displayName: user?.displayName ?? "Test User",
    email: user?.email ?? "test@example.com",
    photoURL: user?.photoURL ?? null,
  };
  _authListeners.forEach((cb) => cb(_currentUser));
}

export function simulateLogout() {
  _currentUser = null;
  _authListeners.forEach((cb) => cb(null));
}

export function getCurrentUser() {
  return _currentUser;
}

// Used by mock onAuthStateChanged
export function addAuthListener(cb: AuthCallback) {
  _authListeners.add(cb);
  // Immediately fire with current state
  cb(_currentUser);
  return () => _authListeners.delete(cb);
}

// ─── Firestore State ──────────────────────────────────────
/** Map of "collection/docId" → document data */
export const mockDocData = new Map<string, Record<string, unknown>>();

/** Map of "collection" → array of { id, ...data } */
export const mockCollectionData = new Map<string, Array<Record<string, unknown> & { id: string }>>();

type SnapshotCallback = (snap: unknown) => void;
const _snapshotListeners = new Map<string, Set<SnapshotCallback>>();

export function setDocData(path: string, data: Record<string, unknown>) {
  mockDocData.set(path, data);
  // Notify snapshot listeners for this doc
  const listeners = _snapshotListeners.get(path);
  if (listeners) {
    const snap = createDocSnapshot(path, data);
    listeners.forEach((cb) => cb(snap));
  }
}

export function clearDocData(path: string) {
  mockDocData.delete(path);
  const listeners = _snapshotListeners.get(path);
  if (listeners) {
    const snap = createDocSnapshot(path, null);
    listeners.forEach((cb) => cb(snap));
  }
}

export function setCollectionDocs(collectionPath: string, docs: Array<Record<string, unknown> & { id: string }>) {
  mockCollectionData.set(collectionPath, docs);
  // Notify listeners
  const listeners = _snapshotListeners.get(collectionPath);
  if (listeners) {
    const snap = createCollectionSnapshot(docs);
    listeners.forEach((cb) => cb(snap));
  }
}

export function addSnapshotListener(path: string, cb: SnapshotCallback) {
  if (!_snapshotListeners.has(path)) {
    _snapshotListeners.set(path, new Set());
  }
  _snapshotListeners.get(path)!.add(cb);
  return () => _snapshotListeners.get(path)?.delete(cb);
}

// ─── Firestore Snapshot Helpers ───────────────────────────
function createDocSnapshot(path: string, data: Record<string, unknown> | null) {
  return {
    exists: () => data !== null,
    data: () => data,
    id: path.split("/").pop() ?? "",
    ref: { path },
  };
}

function createCollectionSnapshot(docs: Array<Record<string, unknown> & { id: string }>) {
  return {
    docs: docs.map((d) => ({
      id: d.id,
      data: () => d,
      exists: () => true,
      ref: { path: d.id },
    })),
    size: docs.length,
    empty: docs.length === 0,
    forEach: (cb: (doc: unknown) => void) => {
      docs.forEach((d) =>
        cb({
          id: d.id,
          data: () => d,
          exists: () => true,
          ref: { path: d.id },
        }),
      );
    },
  };
}

// ─── Cloud Functions ──────────────────────────────────────
const _callableResults = new Map<string, unknown>();

export function setCallableResult(name: string, data: unknown) {
  _callableResults.set(name, data);
}

export function getCallableResult(name: string) {
  return _callableResults.get(name) ?? { data: {} };
}

// ─── Reset ────────────────────────────────────────────────
export function resetAllMocks() {
  _currentUser = null;
  _authListeners.clear();
  mockDocData.clear();
  mockCollectionData.clear();
  _snapshotListeners.clear();
  _callableResults.clear();
}

// ─── Exported mock functions (for assertions) ─────────────
export const mockSetDoc = vi.fn().mockResolvedValue(undefined);
export const mockDeleteDoc = vi.fn().mockResolvedValue(undefined);
export const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
export const mockSignInWithPopup = vi.fn().mockResolvedValue({ user: null });
export const mockSignOut = vi.fn().mockResolvedValue(undefined);
export const mockWriteBatch = vi.fn(() => ({
  update: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
}));
