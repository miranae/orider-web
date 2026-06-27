import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import {
  type AppSettings,
  type NavigationPreferences,
  parseAppSettings,
  parseNavigationPreferences,
  serializeAppSettings,
  serializeNavigationPreferences,
} from "@shared/types/deviceSettings";

import { firestore } from "./firebase";

/**
 * Firestore users/{uid}/settings/{deviceId} 및 users/{uid}/navigation_preferences/{deviceId}
 * 읽기/쓰기. 모바일 SettingsFirestoreClient.kt와 같은 스키마.
 *
 * 익명 사용자는 모바일과 동일하게 동기화 대상이 아니므로, 호출 측에서 uid를 미리 검증해서 넘긴다.
 */

export interface DeviceSettingsRecord {
  deviceId: string;
  deviceName: string;
  updatedAt: number; // millis
  /** schema version. 미지의 미래 버전을 다운그레이드하지 않도록 putDeviceSettings에 그대로 전달 */
  version: number;
  /** 파싱된 설정 — 미지의 키는 raw에 보존됨 */
  settings: AppSettings & Record<string, unknown>;
}

export interface DeviceNavigationPrefsRecord {
  deviceId: string;
  deviceName: string;
  updatedAt: number;
  version: number;
  prefs: NavigationPreferences & Record<string, unknown>;
}

const DEFAULT_DEVICE_SETTINGS_VERSION = 1;
const DEFAULT_NAV_PREFS_VERSION = 1;

function readVersion(raw: unknown, fallback: number): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function timestampToMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return 0;
}

function parseSettingsSnapshot(
  docSnap: QueryDocumentSnapshot<DocumentData>,
): DeviceSettingsRecord | null {
  const data = docSnap.data();
  const jsonStr = data.data as string | undefined;
  if (!jsonStr) return null;
  return {
    deviceId: (data.deviceId as string) ?? docSnap.id,
    deviceName: (data.deviceName as string) ?? "",
    updatedAt: timestampToMillis(data.updatedAt),
    version: readVersion(data.version, DEFAULT_DEVICE_SETTINGS_VERSION),
    settings: parseAppSettings(jsonStr),
  };
}

function parseNavPrefsSnapshot(
  docSnap: QueryDocumentSnapshot<DocumentData>,
): DeviceNavigationPrefsRecord | null {
  const data = docSnap.data();
  const jsonStr = data.data as string | undefined;
  if (!jsonStr) return null;
  return {
    deviceId: (data.deviceId as string) ?? docSnap.id,
    deviceName: (data.deviceName as string) ?? "",
    updatedAt: timestampToMillis(data.updatedAt),
    version: readVersion(data.version, DEFAULT_NAV_PREFS_VERSION),
    prefs: parseNavigationPreferences(jsonStr),
  };
}

// ── snapshot subscriptions ───────────────────────────────────────────────

export function subscribeLatestDeviceSettings(
  uid: string,
  onChange: (record: DeviceSettingsRecord | null) => void,
  onError?: (err: Error) => void,
): () => void {
  const q = query(
    collection(firestore, "users", uid, "settings"),
    orderBy("updatedAt", "desc"),
    limit(1),
  );
  return onSnapshot(
    q,
    (snap) => {
      const docSnap = snap.docs[0];
      onChange(docSnap ? parseSettingsSnapshot(docSnap) : null);
    },
    (err) => onError?.(err),
  );
}

export function subscribeAllDeviceSettings(
  uid: string,
  onChange: (records: DeviceSettingsRecord[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const q = query(
    collection(firestore, "users", uid, "settings"),
    orderBy("updatedAt", "desc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs.flatMap((docSnap) => {
        const r = parseSettingsSnapshot(docSnap);
        return r ? [r] : [];
      });
      onChange(records);
    },
    (err) => onError?.(err),
  );
}

export function subscribeLatestDeviceNavigationPrefs(
  uid: string,
  onChange: (record: DeviceNavigationPrefsRecord | null) => void,
  onError?: (err: Error) => void,
): () => void {
  const q = query(
    collection(firestore, "users", uid, "navigation_preferences"),
    orderBy("updatedAt", "desc"),
    limit(1),
  );
  return onSnapshot(
    q,
    (snap) => {
      const docSnap = snap.docs[0];
      onChange(docSnap ? parseNavPrefsSnapshot(docSnap) : null);
    },
    (err) => onError?.(err),
  );
}

// ── settings ─────────────────────────────────────────────────────────────

export async function fetchDeviceSettings(
  uid: string,
  deviceId: string,
): Promise<DeviceSettingsRecord | null> {
  const ref = doc(firestore, "users", uid, "settings", deviceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  const jsonStr = data.data as string | undefined;
  if (!jsonStr) return null;
  return {
    deviceId: (data.deviceId as string) ?? deviceId,
    deviceName: (data.deviceName as string) ?? "",
    updatedAt: timestampToMillis(data.updatedAt),
    version: readVersion(data.version, DEFAULT_DEVICE_SETTINGS_VERSION),
    settings: parseAppSettings(jsonStr),
  };
}

/** 가장 최근에 업데이트된 기기의 설정 (단일 기기 모드용 — 모바일 fetchLatestSettings와 동일) */
export async function fetchLatestDeviceSettings(
  uid: string,
): Promise<DeviceSettingsRecord | null> {
  const col = collection(firestore, "users", uid, "settings");
  const q = query(col, orderBy("updatedAt", "desc"), limit(1));
  const snap = await getDocs(q);
  const docSnap = snap.docs[0];
  if (!docSnap) return null;
  const data = docSnap.data();
  const jsonStr = data.data as string | undefined;
  if (!jsonStr) return null;
  return {
    deviceId: (data.deviceId as string) ?? docSnap.id,
    deviceName: (data.deviceName as string) ?? "",
    updatedAt: timestampToMillis(data.updatedAt),
    version: readVersion(data.version, DEFAULT_DEVICE_SETTINGS_VERSION),
    settings: parseAppSettings(jsonStr),
  };
}

/** 사용자가 동기화한 모든 기기 목록 (다중 기기 UI용) */
export async function fetchAllDeviceSettings(
  uid: string,
): Promise<DeviceSettingsRecord[]> {
  const col = collection(firestore, "users", uid, "settings");
  const q = query(col, orderBy("updatedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.flatMap((docSnap) => {
    const data = docSnap.data();
    const jsonStr = data.data as string | undefined;
    if (!jsonStr) return [];
    return [
      {
        deviceId: (data.deviceId as string) ?? docSnap.id,
        deviceName: (data.deviceName as string) ?? "",
        updatedAt: timestampToMillis(data.updatedAt),
        version: readVersion(data.version, DEFAULT_DEVICE_SETTINGS_VERSION),
        settings: parseAppSettings(jsonStr),
      },
    ];
  });
}

/**
 * 디바이스 설정 저장. Firestore 서버 타임스탬프 사용.
 * `settings`는 {@link fetchDeviceSettings}에서 받은 객체를 수정한 결과여야 한다 — 미지의 키 보존.
 *
 * `version`을 명시적으로 받아 모바일 앱이 향후 schema migration으로 version 2 이상의 문서를
 * 만들었을 때 web이 매번 1로 다운그레이드하지 않도록 한다. 호출 측은 `record.version`을
 * 그대로 전달.
 */
export async function putDeviceSettings(
  uid: string,
  deviceId: string,
  deviceName: string,
  settings: AppSettings & Record<string, unknown>,
  version: number = DEFAULT_DEVICE_SETTINGS_VERSION,
): Promise<void> {
  const ref = doc(firestore, "users", uid, "settings", deviceId);
  await setDoc(
    ref,
    {
      data: serializeAppSettings(settings),
      deviceId,
      deviceName,
      updatedAt: serverTimestamp(),
      version,
    },
    { merge: true },
  );
}

/**
 * 디바이스 이름만 변경 (data JSON 은 건드리지 않음).
 * Firestore 보안 규칙은 `users/{uid}/settings/{deviceId}` 의 쓰기 권한을 owner 에게 허용.
 */
export async function renameDevice(
  uid: string,
  deviceId: string,
  deviceName: string,
): Promise<void> {
  const trimmed = deviceName.trim();
  if (!trimmed) throw new Error("디바이스 이름을 입력하세요");
  if (trimmed.length > 64) throw new Error("디바이스 이름은 64자 이하여야 합니다");
  const ref = doc(firestore, "users", uid, "settings", deviceId);
  await updateDoc(ref, {
    deviceName: trimmed,
    updatedAt: serverTimestamp(),
  });
}

/**
 * 디바이스 settings 문서 삭제 (앱이 다시 로그인하면 새 deviceId 로 재생성됨).
 * 활동/세션 등 다른 컬렉션의 디바이스 참조는 건드리지 않음 — 설정 동기화 대상에서만 제외.
 */
export async function deleteDevice(uid: string, deviceId: string): Promise<void> {
  const ref = doc(firestore, "users", uid, "settings", deviceId);
  await deleteDoc(ref);
}

// ── navigation preferences ───────────────────────────────────────────────

export async function fetchDeviceNavigationPrefs(
  uid: string,
  deviceId: string,
): Promise<DeviceNavigationPrefsRecord | null> {
  const ref = doc(firestore, "users", uid, "navigation_preferences", deviceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  const jsonStr = data.data as string | undefined;
  if (!jsonStr) return null;
  return {
    deviceId: (data.deviceId as string) ?? deviceId,
    deviceName: (data.deviceName as string) ?? "",
    updatedAt: timestampToMillis(data.updatedAt),
    version: readVersion(data.version, DEFAULT_NAV_PREFS_VERSION),
    prefs: parseNavigationPreferences(jsonStr),
  };
}

export async function fetchLatestDeviceNavigationPrefs(
  uid: string,
): Promise<DeviceNavigationPrefsRecord | null> {
  const col = collection(firestore, "users", uid, "navigation_preferences");
  const q = query(col, orderBy("updatedAt", "desc"), limit(1));
  const snap = await getDocs(q);
  const docSnap = snap.docs[0];
  if (!docSnap) return null;
  const data = docSnap.data();
  const jsonStr = data.data as string | undefined;
  if (!jsonStr) return null;
  return {
    deviceId: (data.deviceId as string) ?? docSnap.id,
    deviceName: (data.deviceName as string) ?? "",
    updatedAt: timestampToMillis(data.updatedAt),
    version: readVersion(data.version, DEFAULT_NAV_PREFS_VERSION),
    prefs: parseNavigationPreferences(jsonStr),
  };
}

export async function putDeviceNavigationPrefs(
  uid: string,
  deviceId: string,
  deviceName: string,
  prefs: NavigationPreferences & Record<string, unknown>,
  version: number = DEFAULT_NAV_PREFS_VERSION,
): Promise<void> {
  const ref = doc(firestore, "users", uid, "navigation_preferences", deviceId);
  await setDoc(
    ref,
    {
      data: serializeNavigationPreferences(prefs),
      deviceId,
      deviceName,
      updatedAt: serverTimestamp(),
      version,
    },
    { merge: true },
  );
}
