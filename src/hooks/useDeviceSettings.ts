import { useCallback, useEffect, useState } from "react";

import {
  type AppSettings,
  type NavigationPreferences,
} from "@shared/types/deviceSettings";

import {
  type DeviceNavigationPrefsRecord,
  type DeviceSettingsRecord,
  fetchDeviceSettings,
  putDeviceNavigationPrefs,
  putDeviceSettings,
  subscribeAllDeviceSettings,
  subscribeLatestDeviceNavigationPrefs,
  subscribeLatestDeviceSettings,
} from "../services/deviceSettingsClient";
import {
  mergeUserScopedIntoSettings,
  pickUserScoped,
  validateAppSettings,
} from "../shared/deviceSettings/schema";

/**
 * Zod 검증을 통과한 settings 만 Firestore 에 쓴다.
 * 잘못된 범위/타입이 디바이스로 흘러가 앱이 못 읽는 사고를 막는 마지막 안전망.
 */
function assertValid(settings: AppSettings & Record<string, unknown>): void {
  const result = validateAppSettings(settings);
  if (!result.ok) {
    const msg = result.errors
      .slice(0, 3)
      .map((e) => `${e.path.join(".") || "<root>"}: ${e.message}`)
      .join(" / ");
    throw new Error(`설정 검증 실패 — ${msg}`);
  }
}

/**
 * 가장 최근에 업데이트된 기기의 AppSettings를 onSnapshot으로 구독.
 *
 * 동시성 처리:
 * - read 측은 onSnapshot으로 모바일 동시 변경을 즉시 반영.
 * - write 측은 read-modify-write — `update(patch)`가 현재 record.settings에 patch를 머지해
 *   put. 동일 record를 빠르게 두 번 호출하면 lost-update 가능성이 있어, put 직후 hook 내부의
 *   record를 optimistic으로 즉시 갱신해 race window를 좁힌다 (onSnapshot이 도착하면 자연스럽게
 *   최신 server 값으로 수렴).
 */
export function useLatestDeviceSettings(uid: string | null) {
  const [record, setRecord] = useState<DeviceSettingsRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!uid) {
      setRecord(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeLatestDeviceSettings(
      uid,
      (next) => {
        setRecord(next);
        setError(null);
        setLoading(false);
      },
      (e) => {
        setError(e);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [uid]);

  const reload = useCallback(() => Promise.resolve(), []);

  const update = useCallback(
    async (patch: Partial<AppSettings>) => {
      if (!uid || !record) throw new Error("로그인 또는 동기화된 기기가 필요합니다");
      const next = { ...record.settings, ...patch };
      assertValid(next);
      await putDeviceSettings(uid, record.deviceId, record.deviceName, next, record.version);
      // optimistic: onSnapshot이 도착하기 전에 다음 update 호출이 stale base를 쓰지 않도록.
      setRecord((cur) =>
        cur && cur.deviceId === record.deviceId
          ? { ...cur, settings: next, updatedAt: Date.now() }
          : cur,
      );
    },
    [uid, record],
  );

  return { record, loading, error, reload, update };
}

/**
 * 사용자의 모든 기기 설정 목록 — onSnapshot 구독 + optimistic update.
 */
export function useAllDeviceSettings(uid: string | null) {
  const [records, setRecords] = useState<DeviceSettingsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!uid) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeAllDeviceSettings(
      uid,
      (next) => {
        setRecords(next);
        setError(null);
        setLoading(false);
      },
      (e) => {
        setError(e);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [uid]);

  const reload = useCallback(() => Promise.resolve(), []);

  /**
   * 특정 기기에 patch 적용. read-modify-write + optimistic local merge로
   * onSnapshot latency 동안 동일 record를 base로 쓰는 lost-update 방지.
   */
  const update = useCallback(
    async (deviceId: string, patch: Partial<AppSettings>) => {
      if (!uid) throw new Error("로그인 필요");
      const target = records.find((r) => r.deviceId === deviceId);
      if (!target) throw new Error("선택한 기기가 목록에 없습니다");
      const next = { ...target.settings, ...patch };
      assertValid(next);
      await putDeviceSettings(
        uid,
        target.deviceId,
        target.deviceName,
        next,
        target.version,
      );
      setRecords((prev) =>
        prev.map((r) =>
          r.deviceId === deviceId
            ? { ...r, settings: next, updatedAt: Date.now() }
            : r,
        ),
      );
    },
    [uid, records],
  );

  /**
   * patch 의 user-scoped 부분만 추출해 디바이스들에 적용.
   *
   * - `excludeDeviceId`: 이미 별도로 update 한 디바이스를 제외 (중복 쓰기/stale-version 충돌 방지).
   *   commit 흐름에서 currentDevice 는 `update()` 로 device-scoped 부분까지 포함해 단일 쓰기되고,
   *   그 외 디바이스만 broadcast 의 user-scoped 머지 대상이 된다.
   * - 디바이스 고유 필드(센서 주소, GPS 모드, soundSettings 파일 경로 등)는 `pickUserScoped`
   *   + `mergeUserScopedIntoSettings` 가 보존.
   * - lost-update 윈도우 축소: 각 디바이스에 대해 `fetchDeviceSettings` 로 최신 doc 을 re-fetch
   *   한 뒤 그 위에 user patch 를 머지. 모바일이 동시에 쓰고 있어도 그 변경을 보존.
   * - 실패 분류: `kind: 'validation' | 'network'` 로 호출 측이 retry 가능 여부 구분 가능.
   * - Promise.allSettled — 한 디바이스 실패가 다른 디바이스를 막지 않음.
   */
  const broadcastUserScoped = useCallback(
    async (
      patch: Partial<AppSettings>,
      opts?: { excludeDeviceId?: string },
    ): Promise<{
      updated: number;
      failures: {
        deviceId: string;
        deviceName: string;
        kind: "validation" | "network";
        error: string;
      }[];
    }> => {
      if (!uid) throw new Error("로그인 필요");
      const userPatch = pickUserScoped(patch as Partial<AppSettings> & Record<string, unknown>);
      if (Object.keys(userPatch).length === 0) {
        return { updated: 0, failures: [] };
      }
      const targets = records.filter((r) => r.deviceId !== opts?.excludeDeviceId);
      console.info(
        "[deviceSettings] broadcastUserScoped:",
        "targets=",
        targets.length,
        "excluded=",
        opts?.excludeDeviceId,
        "keys=",
        Object.keys(userPatch),
      );
      const settled = await Promise.allSettled(
        targets.map(async (r) => {
          // 최신 doc 을 다시 읽어 lost-update 윈도우 축소.
          // 실패 시 in-memory record 로 폴백 (offline / 권한 일시 오류 흡수).
          let baseSettings: AppSettings & Record<string, unknown> =
            r.settings as AppSettings & Record<string, unknown>;
          let baseVersion = r.version;
          let baseDeviceName = r.deviceName;
          try {
            const latest = await fetchDeviceSettings(uid, r.deviceId);
            if (latest) {
              baseSettings = latest.settings as AppSettings & Record<string, unknown>;
              baseVersion = latest.version;
              baseDeviceName = latest.deviceName || r.deviceName;
            }
          } catch {
            // 폴백 — 캐시된 r.settings 사용. validation/put 단계에서 다시 실패 가능.
          }
          const next = mergeUserScopedIntoSettings(baseSettings, userPatch);
          try {
            assertValid(next);
          } catch (e) {
            const err = new Error(
              e instanceof Error ? e.message : String(e),
            ) as Error & { kind?: "validation" };
            err.kind = "validation";
            throw err;
          }
          await putDeviceSettings(uid, r.deviceId, baseDeviceName, next, baseVersion);
          return { deviceId: r.deviceId, next };
        }),
      );
      const failures: {
        deviceId: string;
        deviceName: string;
        kind: "validation" | "network";
        error: string;
      }[] = [];
      let updated = 0;
      const optimisticByDevice: Record<string, AppSettings & Record<string, unknown>> = {};
      settled.forEach((s, i) => {
        const r = targets[i]!;
        if (s.status === "fulfilled") {
          updated += 1;
          optimisticByDevice[s.value.deviceId] = s.value.next;
        } else {
          const reason = s.reason as (Error & { kind?: "validation" }) | unknown;
          const kind =
            reason && typeof reason === "object" && "kind" in reason && reason.kind === "validation"
              ? "validation"
              : "network";
          failures.push({
            deviceId: r.deviceId,
            deviceName: r.deviceName,
            kind,
            error: reason instanceof Error ? reason.message : String(reason),
          });
        }
      });
      if (updated > 0) {
        setRecords((prev) =>
          prev.map((r) =>
            optimisticByDevice[r.deviceId]
              ? { ...r, settings: optimisticByDevice[r.deviceId]!, updatedAt: Date.now() }
              : r,
          ),
        );
      }
      return { updated, failures };
    },
    [uid, records],
  );

  return { records, loading, error, reload, update, broadcastUserScoped };
}

/**
 * NavigationPreferences (가장 최근 기기) — onSnapshot 구독.
 */
export function useLatestDeviceNavigationPrefs(uid: string | null) {
  const [record, setRecord] = useState<DeviceNavigationPrefsRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!uid) {
      setRecord(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeLatestDeviceNavigationPrefs(
      uid,
      (next) => {
        setRecord(next);
        setError(null);
        setLoading(false);
      },
      (e) => {
        setError(e);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [uid]);

  const reload = useCallback(() => Promise.resolve(), []);

  const update = useCallback(
    async (patch: Partial<NavigationPreferences>) => {
      if (!uid || !record) throw new Error("로그인 또는 동기화된 기기가 필요합니다");
      const next = { ...record.prefs, ...patch };
      await putDeviceNavigationPrefs(
        uid,
        record.deviceId,
        record.deviceName,
        next,
        record.version,
      );
      setRecord((cur) =>
        cur && cur.deviceId === record.deviceId
          ? { ...cur, prefs: next, updatedAt: Date.now() }
          : cur,
      );
    },
    [uid, record],
  );

  return { record, loading, error, reload, update };
}
