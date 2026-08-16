/**
 * 데이터 페이지 저장의 durable outbox (#1943 §9.1).
 *
 * local head 와 immutable pending intent 를 **같은 IndexedDB 트랜잭션**에 커밋한다.
 * 둘을 따로 쓰면 새로고침이 그 사이를 갈라 놓고, 반쪽 상태를 전송하면 다른 기기의 구성을 덮어쓴다.
 * 커밋에 실패하면 callable 은 0건이어야 한다(수용기준 31).
 */

const DB_NAME = "orider-bike-profile-layouts";
const DB_VERSION = 1;
const HEAD_STORE = "heads";
const INTENT_STORE = "intents";

export type LayoutHeadRecord = {
  /** `${ownerKey}|${profileId}` — 계정 전환 시 서로 섞이지 않게 owner 를 키에 넣는다. */
  key: string;
  ownerKey: string;
  profileId: string;
  revision: number;
  canonicalPayload: string;
  payloadHash: string;
  updatedAtMs: number;
};

export type LayoutIntentState = "pending" | "inFlight" | "blockedConflict" | "quarantined";

export type LayoutIntentRecord = {
  mutationId: string;
  ownerKey: string;
  profileId: string;
  expectedRevision: number;
  /** 재전송 때 **한 글자도 바꾸지 않고** 그대로 보낸다. */
  canonicalPayload: string;
  payloadHash: string;
  createdAtMs: number;
  state: LayoutIntentState;
};

export function headKey(ownerKey: string, profileId: string): string {
  return `${ownerKey}|${profileId}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HEAD_STORE)) {
        db.createObjectStore(HEAD_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(INTENT_STORE)) {
        const store = db.createObjectStore(INTENT_STORE, { keyPath: "mutationId" });
        store.createIndex("ownerKey", "ownerKey", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function awaitTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

/**
 * head 와 intent 를 **한 트랜잭션**에 커밋한다. 하나라도 실패하면 둘 다 롤백된다.
 *
 * @throws quota 초과·커밋 실패 시. 호출부는 이 예외를 잡아 draft 를 유지하고 callable 을 부르지 않는다.
 */
export async function commitHeadAndIntent(
  head: LayoutHeadRecord,
  intent: LayoutIntentRecord,
): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction([HEAD_STORE, INTENT_STORE], "readwrite");
    tx.objectStore(HEAD_STORE).put(head);
    tx.objectStore(INTENT_STORE).put(intent);
    await awaitTransaction(tx);
  } finally {
    db.close();
  }
}

/** 원격이 확정한 head 로 로컬을 맞춘다(revision/hash 동기화). */
export async function putHead(head: LayoutHeadRecord): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(HEAD_STORE, "readwrite");
    tx.objectStore(HEAD_STORE).put(head);
    await awaitTransaction(tx);
  } finally {
    db.close();
  }
}

export async function readHead(ownerKey: string, profileId: string): Promise<LayoutHeadRecord | null> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(HEAD_STORE, "readonly");
    const value = await promisify(tx.objectStore(HEAD_STORE).get(headKey(ownerKey, profileId)));
    return (value as LayoutHeadRecord | undefined) ?? null;
  } finally {
    db.close();
  }
}

export async function updateIntentState(mutationId: string, state: LayoutIntentState): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(INTENT_STORE, "readwrite");
    const store = tx.objectStore(INTENT_STORE);
    const existing = (await promisify(store.get(mutationId))) as LayoutIntentRecord | undefined;
    if (existing) store.put({ ...existing, state });
    await awaitTransaction(tx);
  } finally {
    db.close();
  }
}

/** 전송 성공한 **바로 그 intent** 만 제거한다(수용기준 26). */
export async function removeIntent(mutationId: string): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(INTENT_STORE, "readwrite");
    tx.objectStore(INTENT_STORE).delete(mutationId);
    await awaitTransaction(tx);
  } finally {
    db.close();
  }
}

/**
 * 이 owner 의 pending intent 목록. **다른 owner/profile 의 intent 와 합치지 않는다** —
 * 계정 전환 뒤 이전 namespace 의 draft 가 새 계정으로 전송되면 계정 간 유출이다(§9.1).
 */
export async function listIntents(ownerKey: string): Promise<LayoutIntentRecord[]> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(INTENT_STORE, "readonly");
    const index = tx.objectStore(INTENT_STORE).index("ownerKey");
    const all = (await promisify(index.getAll(ownerKey))) as LayoutIntentRecord[];
    return all.sort((a, b) => a.createdAtMs - b.createdAtMs);
  } finally {
    db.close();
  }
}
