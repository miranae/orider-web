import { collection, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";

import type { AppSettings } from "@shared/types/deviceSettings";

import { firestore } from "./firebase";
import {
  fetchAllDeviceSettings,
  putDeviceSettings,
} from "./deviceSettingsClient";
import { parseBikeProfile } from "../types/bikeProfile";

/**
 * 운동 프로필(`users/{uid}` 루트)의 maxHr/weightKg를 변경할 때, 모바일 앱이
 * 보는 두 군데도 함께 갱신해 일관성을 유지한다:
 *
 * 1. `users/{uid}/settings/{deviceId}.data` JSON의
 *    `maxHeartRate` / `riderWeightKg` 필드 (기기별)
 * 2. `users/{uid}/bikeProfiles/{profileId}.virtualPower.riderWeightKg` (자전거별)
 *
 * App `SettingsRepositoryImpl.syncLegacyKeys`가 활성 자전거 프로필의 라이더
 * 체중을 AppSettings의 슬롯과 동기화하지만, 그 흐름은 모바일에서 자전거 프로필을
 * 변경할 때만 발동한다 — 웹에서 운동 프로필만 바꾸는 케이스를 위해 명시적 동기화.
 */

export interface RiderMetricsSync {
  maxHr?: number | null;
  weightKg?: number | null;
}

/**
 * 라이더 심박/체중을 기기 설정에 반영하고 사용자 루트에도 즉시 기록한다.
 * FTP는 updateCanonicalFtp만 사용하며 이 호환 동기화 경로에서 취급하지 않는다.
 * 기기 미러 트리거의 지연/실패와 무관하게 웹 프로필 정본이 유지된다.
 * 호출 전에는 어떤 변경도 일어나지 않는다.
 */
export async function persistRiderMetrics(
  uid: string,
  patch: RiderMetricsSync,
): Promise<RiderMetricsSyncResult> {
  let result: RiderMetricsSyncResult;
  try {
    result = await syncRiderMetricsToDevices(uid, patch);
  } catch (error) {
    result = {
      updatedDevices: 0,
      failures: [{
        deviceId: "*",
        deviceName: "",
        error: error instanceof Error ? error.message : String(error),
      }],
    };
  }
  const rootPatch = Object.fromEntries(
    Object.entries(patch).filter((entry): entry is [string, number] => (
      typeof entry[1] === "number" && Number.isFinite(entry[1])
    )),
  );
  if (Object.keys(rootPatch).length > 0) {
    await updateDoc(doc(firestore, "users", uid), rootPatch);
  }
  return result;
}

export interface RiderMetricsSyncResult {
  updatedDevices: number;
  /** 부분 실패 — 실패한 디바이스 식별자와 에러. 호출 측에서 사용자에게 노출. */
  failures: { deviceId: string; deviceName: string; error: string }[];
}

export async function syncRiderMetricsToDevices(
  uid: string,
  patch: RiderMetricsSync,
): Promise<RiderMetricsSyncResult> {
  const records = await fetchAllDeviceSettings(uid);
  if (!records.length) return { updatedDevices: 0, failures: [] };

  // Promise.allSettled로 각 디바이스를 독립적으로 처리. 한 디바이스 실패해도
  // 다른 디바이스는 계속 진행하고, 호출 측이 실패한 디바이스 목록을 받아 사용자에게 노출.
  const settled = await Promise.allSettled(
    records.map(async (record) => {
      const next: AppSettings & Record<string, unknown> = { ...record.settings };
      let dirty = false;
      if (typeof patch.maxHr === "number" && Number.isFinite(patch.maxHr)) {
        next.maxHeartRate = patch.maxHr;
        dirty = true;
      }
      if (typeof patch.weightKg === "number" && Number.isFinite(patch.weightKg)) {
        next.riderWeightKg = patch.weightKg;
        dirty = true;
      }
      if (!dirty) return { record, applied: false };
      await putDeviceSettings(
        uid,
        record.deviceId,
        record.deviceName,
        next,
        record.version,
      );
      return { record, applied: true };
    }),
  );

  let updated = 0;
  const failures: RiderMetricsSyncResult["failures"] = [];
  settled.forEach((result, i) => {
    const record = records[i]!;
    if (result.status === "fulfilled") {
      if (result.value.applied) updated += 1;
    } else {
      failures.push({
        deviceId: record.deviceId,
        deviceName: record.deviceName,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });
  return { updatedDevices: updated, failures };
}

/**
 * 모든 자전거 프로필의 virtualPower.riderWeightKg를 사용자 몸무게로 갱신.
 * 각 프로필의 다른 필드(bikeWeightKg, cdA, rollingResistance)는 보존.
 */
export async function syncRiderWeightToBikeProfiles(
  uid: string,
  weightKg: number,
): Promise<{ updatedProfiles: number }> {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return { updatedProfiles: 0 };
  }
  const snap = await getDocs(collection(firestore, "users", uid, "bikeProfiles"));
  let updated = 0;
  await Promise.all(
    snap.docs.map(async (d) => {
      const profile = parseBikeProfile(d.id, d.data());
      if (profile.virtualPower.riderWeightKg === weightKg) return;
      const ref = doc(firestore, "users", uid, "bikeProfiles", profile.id);
      await setDoc(
        ref,
        {
          virtualPower: {
            ...profile.virtualPower,
            riderWeightKg: weightKg,
          },
          updatedAt: Date.now(),
        },
        { merge: true },
      );
      updated += 1;
    }),
  );
  return { updatedProfiles: updated };
}
