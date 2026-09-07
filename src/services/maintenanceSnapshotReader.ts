/**
 * 자전거 정비 스냅샷 정본 reader (#887 — 에픽 app#2237 의 stage 4).
 *
 * 서버 원본은 `orider-g1-web/shared/types/maintenance-canonical.ts` +
 * `functions/src/maintenance-snapshot.ts`, 문서는
 * `users/{uid}/bikeProfiles/{bikeProfileId}/maintenance/snapshot` 이다.
 *
 * ## 지금 웹에는 소비 화면이 없다
 *
 * 정비·부품 수명 UI 는 앱에만 있다(웹은 `odometer`/`componentStatus` 를 어디서도 그리지 않는다).
 * 그래서 이 파일은 **읽기 계층만** 둔다 — 웹에 정비 화면이 생길 때 클라이언트가 odometer 로
 * 부품 상태를 다시 판정하지 않도록, 정본 경로를 미리 하나로 고정해 두는 것이 목적이다.
 * 클라이언트 재판정을 새로 쓰는 대신 이 reader 를 쓰면 앱·웹이 같은 답을 낸다.
 *
 * 이 함수는 던지지 않는다. 실패는 봉투 상태로 내려간다.
 */
import { doc, getDoc } from "firebase/firestore";

import {
  CANONICAL_SCHEMA_VERSION, CANONICAL_STATUSES,
  type CanonicalEnvelope, type CanonicalStatus,
} from "@shared/types/canonical";
import { firestore } from "./firebase";
import { debugLog, logClientError } from "./errorLogger";
import { knownEnumValue } from "./trainingDecisionCanonicalContract";

/** 부품 어휘 — 서버 `MAINTENANCE_COMPONENTS` 와 같다. */
export const MAINTENANCE_COMPONENTS = ["CHAIN", "TYRE", "BRAKE_PAD"] as const;
export type MaintenanceComponent = (typeof MAINTENANCE_COMPONENTS)[number];

export interface ComponentStatus {
  component: MaintenanceComponent;
  distanceSinceServiceKm: number;
  remainingKm: number;
  /** 0~1. 1 이상은 교체 시기. */
  progress: number;
  due: boolean;
}

export interface MaintenanceSnapshot {
  /** 서버가 canonical 활동 거리로 합산한 누적 거리. 클라이언트 odometer 를 대체한다. */
  odometerKm: number;
  movingTimeSec: number;
  components: ComponentStatus[];
  dueCount: number;
  /** 아직 canonical 이 아닌 귀속 활동 수. 0 이 아니면 곧 값이 바뀔 수 있다. */
  pendingActivityCount: number;
}

export type MaintenanceEnvelope = CanonicalEnvelope<MaintenanceSnapshot>;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function emptyEnvelope(status: CanonicalStatus, code?: string): MaintenanceEnvelope {
  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    algorithmVersion: "client_read",
    status,
    computedAt: null,
    inputRevision: null,
    inputDigest: null,
    period: null,
    data: null,
    error: status === "failed" ? { code: code ?? "read_failed", retryable: true } : null,
  };
}

/** 모르는 부품은 버린다 — 이름을 모르면 라벨도 주기도 없으므로 그릴 수 없다. */
function parseComponents(value: unknown): ComponentStatus[] {
  if (!Array.isArray(value)) return [];
  const parsed: ComponentStatus[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const component = knownEnumValue(
      MAINTENANCE_COMPONENTS,
      typeof record.component === "string" ? record.component : null,
    );
    const distance = num(record.distanceSinceServiceKm);
    const remaining = num(record.remainingKm);
    const progress = num(record.progress);
    if (component === null || distance === null || remaining === null || progress === null) continue;
    parsed.push({
      component, distanceSinceServiceKm: distance, remainingKm: remaining, progress,
      due: record.due === true,
    });
  }
  return parsed;
}

export async function fetchMaintenanceSnapshot(
  uid: string,
  bikeProfileId: string,
): Promise<MaintenanceEnvelope> {
  if (!uid || !bikeProfileId) return emptyEnvelope("unavailable");
  let raw: Record<string, unknown> | null;
  try {
    const snap = await getDoc(
      doc(firestore, "users", uid, "bikeProfiles", bikeProfileId, "maintenance", "snapshot"),
    );
    raw = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
  } catch (error) {
    logClientError("fetchMaintenanceSnapshot", error, { bikeProfileId });
    return emptyEnvelope("failed", "read_failed");
  }
  if (!raw) return emptyEnvelope("unavailable");

  const status = knownEnumValue(CANONICAL_STATUSES, typeof raw.status === "string" ? raw.status : null);
  const source = (raw.data && typeof raw.data === "object" ? raw.data : raw) as Record<string, unknown>;
  const inputs = (source.inputs && typeof source.inputs === "object" ? source.inputs : {}) as Record<string, unknown>;
  const odometerKm = num(source.odometerKm);

  // 누적 거리가 없으면 0 km 로 채우지 않는다 — 부품 수명 판정이 통째로 어긋난다.
  if (odometerKm === null) {
    const envelope = emptyEnvelope(status && status !== "canonical" && status !== "stale" ? status : "processing");
    debugLog("maintenanceSnapshot.read", { bikeProfileId, status: envelope.status, hasValue: false });
    return envelope;
  }

  const components = parseComponents(source.components);
  const envelope: MaintenanceEnvelope = {
    schemaVersion: typeof raw.schemaVersion === "number" ? raw.schemaVersion : CANONICAL_SCHEMA_VERSION,
    algorithmVersion: typeof raw.algorithmVersion === "string" ? raw.algorithmVersion : "maintenance@1",
    status: status ?? "canonical",
    computedAt: num(raw.computedAt),
    inputRevision: typeof raw.inputRevision === "string" ? raw.inputRevision : null,
    inputDigest: typeof raw.inputDigest === "string" ? raw.inputDigest : null,
    period: null,
    data: {
      odometerKm,
      movingTimeSec: num(source.movingTimeSec) ?? 0,
      components,
      dueCount: num(source.dueCount) ?? components.filter((item) => item.due).length,
      pendingActivityCount: num(inputs.pendingActivityCount) ?? 0,
    },
    error: null,
  };
  debugLog("maintenanceSnapshot.read", {
    bikeProfileId, status: envelope.status,
    odometerKm: envelope.data?.odometerKm ?? null, dueCount: envelope.data?.dueCount ?? null,
  });
  return envelope;
}
