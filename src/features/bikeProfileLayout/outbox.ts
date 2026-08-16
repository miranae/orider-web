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
  /** [headKey] 가 만든 owner+profile 복합 키. 계정 전환 시 서로 섞이지 않게 owner 를 키에 넣는다. */
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

/**
 * owner + profile 복합 키.
 *
 * 두 조각 모두 문자열 제약이 없어 그냥 이어 붙이면 서로 다른 (owner, profile) 쌍이 **같은 키**를
 * 만들 수 있다(예: owner `a|b` + profile `c` 와 owner `a` + profile `b|c`). 그러면 계정 간 head 가
 * 덮어써지고 남의 레이아웃이 보인다. 각 조각을 인코딩해 구분자를 escape 한다.
 */
export function headKey(ownerKey: string, profileId: string): string {
  return `${encodeURIComponent(ownerKey)}|${encodeURIComponent(profileId)}`;
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

/**
 * head 가 아직 [expectedPayloadHash] 일 때만 갱신한다. **읽기와 쓰기가 한 트랜잭션**이다.
 *
 * 따로 읽고 쓰면 그 사이에 새 저장이 head 를 갱신할 수 있고(TOCTOU), 늦게 도착한 이전 응답이
 * 최신 draft 를 도로 덮어써 사용자의 편집이 사라진 것처럼 보인다.
 *
 * @returns 갱신했으면 true, 더 새 draft 가 있어 건너뛰었으면 false.
 */
export async function putHeadIfUnchanged(
  head: LayoutHeadRecord,
  expectedPayloadHash: string,
): Promise<boolean> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(HEAD_STORE, "readwrite");
    const store = tx.objectStore(HEAD_STORE);
    const current = (await promisify(store.get(head.key))) as LayoutHeadRecord | undefined;
    const unchanged = !current || current.payloadHash === expectedPayloadHash;
    if (unchanged) store.put(head);
    await awaitTransaction(tx);
    return unchanged;
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

/**
 * 이 프로필에 사용자가 아직 해소하지 않은 **차단 intent** 가 있는지.
 *
 * 차단은 프로필 단위로 전파돼야 한다 — drain 지역 변수에만 두면, 같은 owner 큐에서 뒤이어 실행되는
 * 신규 저장이 그대로 CAS 를 통과해 사용자의 충돌 선택 없이 원격 구성을 덮어쓴다.
 */
export async function hasBlockedIntent(ownerKey: string, profileId: string): Promise<boolean> {
  const intents = await listIntents(ownerKey);
  // **사용자 결정 대기** 상태만 센다. `inFlight`/`pending` 은 "결과를 모른다 = 다시 보내라" 라
  // 여기 포함하면 안 된다 — 포함하면 새 저장이 스스로를 blocked 로 만들고, 그러면 큐 전체가
  // 멈춰 원래의 `inFlight` 도 영영 재전송되지 않는다(실제 충돌 없이 동기화 영구 정지).
  // 순서 안전은 `sendProfileQueue` 가 담당한다: revision 순으로 보내고 첫 비동기화에서 멈춘다.
  return intents.some(
    (i) => i.profileId === profileId && (i.state === "blockedConflict" || i.state === "quarantined"),
  );
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
    // 프로필 안에서는 **논리적 revision** 이 순서다. `createdAtMs`(= `Date.now()`)는 단조가 아니라
    // 시계가 뒤로 조정되면 나중 편집이 먼저 전송돼 거짓 충돌로 그 프로필 큐가 막힌다.
    // 프로필끼리는 순서에 의미가 없으므로 묶어서 안정적으로만 정렬한다.
    return all.sort(
      (a, b) =>
        (a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0) ||
        a.expectedRevision - b.expectedRevision ||
        a.createdAtMs - b.createdAtMs ||
        (a.mutationId < b.mutationId ? -1 : a.mutationId > b.mutationId ? 1 : 0),
    );
  } finally {
    db.close();
  }
}
