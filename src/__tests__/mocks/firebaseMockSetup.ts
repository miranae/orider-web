/**
 * Module-level vi.mock() calls that intercept all Firebase imports.
 * This file is loaded via setup.ts before every test.
 */
import { vi } from "vitest";
import {
  addAuthListener,
  getCurrentUser,
  mockSetDoc,
  mockDeleteDoc,
  mockUpdateDoc,
  mockSignInWithPopup,
  mockSignOut,
  mockWriteBatch,
  mockDocData,
  mockCollectionData,
  addSnapshotListener,
  invokeCallable,
  recordCallableInvocation,
  resetAllMocks,
} from "./firebase";

// ─── services/firebase.ts ─────────────────────────────────
vi.mock("../../services/firebase", () => ({
  auth: {},
  firestore: {},
  storage: {},
  functions: {},
  googleProvider: {},
  analytics: null,
  initFirebase: vi.fn().mockResolvedValue(undefined),
  ensureAppCheckReady: vi.fn().mockResolvedValue(undefined),
}));

// ─── firebase/analytics ───────────────────────────────────
// Analytics 는 테스트 환경에서 null 이므로 호출 사이트에서 단락(short-circuit)됨.
// 그래도 import 자체가 throw 하지 않도록 stub 제공.
vi.mock("firebase/analytics", () => ({
  getAnalytics: vi.fn(() => null),
  logEvent: vi.fn(),
  setUserId: vi.fn(),
  setUserProperties: vi.fn(),
}));

// ─── firebase/auth ────────────────────────────────────────
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth: unknown, cb: (user: unknown) => void) => {
    return addAuthListener(cb);
  }),
  signInWithPopup: mockSignInWithPopup,
  signInWithRedirect: vi.fn().mockResolvedValue(undefined),
  getRedirectResult: vi.fn().mockResolvedValue(null),
  getAdditionalUserInfo: vi.fn(() => ({ isNewUser: false })),
  signOut: mockSignOut,
  GoogleAuthProvider: vi.fn(),
}));

// ─── firebase/firestore ──────────────────────────────────
vi.mock("firebase/firestore", () => {
  const doc = vi.fn((_fs: unknown, ...pathSegments: string[]) => {
    const path = pathSegments.join("/");
    return { path, id: pathSegments[pathSegments.length - 1] };
  });

  const collection = vi.fn((_fs: unknown, ...pathSegments: string[]) => {
    const path = pathSegments.join("/");
    return { path, type: "collection" };
  });

  const getDoc = vi.fn(async (ref: { path: string }) => {
    const data = mockDocData.get(ref.path) ?? null;
    return {
      exists: () => data !== null,
      data: () => data,
      id: ref.path.split("/").pop() ?? "",
      ref,
    };
  });

  const getDocs = vi.fn(async (q: { _collectionPath?: string }) => {
    const path = q._collectionPath ?? "";
    const docs = mockCollectionData.get(path) ?? [];
    return {
      docs: docs.map((d) => ({
        id: d.id,
        data: () => d,
        exists: () => true,
        ref: { path: `${path}/${d.id}` },
      })),
      size: docs.length,
      empty: docs.length === 0,
    };
  });

  const onSnapshot = vi.fn((ref: { path: string; type?: string }, cb: (snap: unknown) => void, _onError?: unknown) => {
    const path = ref.path;
    if (ref.type === "collection" || path.split("/").length % 2 === 1) {
      // Collection
      const docs = mockCollectionData.get(path) ?? [];
      cb({
        docs: docs.map((d) => ({
          id: d.id,
          data: () => d,
          exists: () => true,
          ref: { path: `${path}/${d.id}` },
        })),
        size: docs.length,
        empty: docs.length === 0,
      });
      return addSnapshotListener(path, cb);
    } else {
      // Document
      const data = mockDocData.get(path) ?? null;
      cb({
        exists: () => data !== null,
        data: () => data,
        id: path.split("/").pop() ?? "",
        ref: { path },
      });
      return addSnapshotListener(path, cb);
    }
  });

  const query = vi.fn((collectionRef: { path: string }, ..._constraints: unknown[]) => {
    return { ...collectionRef, _collectionPath: collectionRef.path };
  });

  const readPath = (obj: Record<string, unknown>, path: string) => (
    path.split(".").reduce<unknown>((current, key) => (
      current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined
    ), obj)
  );

  return {
    doc,
    collection,
    getDoc,
    getDocs,
    setDoc: mockSetDoc,
    deleteDoc: mockDeleteDoc,
    updateDoc: mockUpdateDoc,
    onSnapshot,
    query,
    where: vi.fn((...args: unknown[]) => ({ type: "where", args })),
    or: vi.fn((...args: unknown[]) => ({ type: "or", args })),
    and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
    orderBy: vi.fn((...args: unknown[]) => ({ type: "orderBy", args })),
    limit: vi.fn((...args: unknown[]) => ({ type: "limit", args })),
    startAfter: vi.fn((...args: unknown[]) => ({ type: "startAfter", args })),
    writeBatch: mockWriteBatch,
    serverTimestamp: vi.fn(() => Date.now()),
    Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
    getCountFromServer: vi.fn(async () => ({ data: () => ({ count: 0 }) })),
    count: vi.fn(() => ({ type: "count" })),
    sum: vi.fn((field: string) => ({ type: "sum", field })),
    getAggregateFromServer: vi.fn(async (
      q: { _collectionPath?: string },
      spec: Record<string, { type: string; field?: string }>,
    ) => {
      const docs = mockCollectionData.get(q._collectionPath ?? "") ?? [];
      const data: Record<string, number> = {};
      for (const [alias, aggregate] of Object.entries(spec)) {
        if (aggregate.type === "count") {
          data[alias] = docs.length;
        } else if (aggregate.type === "sum" && aggregate.field) {
          data[alias] = docs.reduce((total, docData) => {
            const value = readPath(docData, aggregate.field!);
            return total + (typeof value === "number" ? value : 0);
          }, 0);
        }
      }
      return { data: () => data };
    }),
  };
});

// ─── firebase/functions ──────────────────────────────────
vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn((_functions: unknown, name: string) => {
    return vi.fn(async (data?: unknown) => {
      recordCallableInvocation(name, data);
      return invokeCallable(name, data);
    });
  }),
}));

// ─── firebase/storage ─────────────────────────────────────
vi.mock("firebase/storage", () => ({
  ref: vi.fn(),
  getDownloadURL: vi.fn().mockResolvedValue("https://mock-storage.example.com/file"),
  uploadBytes: vi.fn().mockResolvedValue({}),
}));

// Reset mock state between tests
beforeEach(() => {
  resetAllMocks();
});
