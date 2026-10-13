import type { CalculationWeightCounts } from "./power-curve-periods";
import type { StagePowerDurationKernelResult } from "./stage-activity-power-duration";

export type StagePowerHistoryOrigin = "measured" | "stored_native_watts_unverified";
export interface StagePowerHistoryOriginCoverage { weightCounts?: CalculationWeightCounts; sourcePowerOrigin: StagePowerHistoryOrigin; inspectedActivityCount: number; computedActivityCount: number; missingSnapshotCount: number; noContinuousWindowCount: number }

export interface StagePowerHistoryRange { fromInclusive: number; toExclusive: number }
export interface StagePowerHistorySession {
  readTime: { seconds: number; nanoseconds: number };
  expiresAt: number;
  /** 무서명 일관성 digest. 인증/서버 누적 budget 증거가 아니다. */
  requestBinding: string;
}
/** 조회 순회 경계: 범위 내 finite 시각(소수 허용), Firestore 문서 ID UTF8≤1500bytes. 계산 대상 계약과 별개다. */
export interface StagePowerHistoryCursor { after: { startTime: number; activityId: string } }
export interface StagePowerHistorySelection {
  unit: "W"; durationSeconds: number;
  periods: StagePowerHistoryRange[]; periodIndex: number;
  includeWeightNormalized?: boolean;
}
export interface StagePowerHistoryPageRequest extends StagePowerHistorySelection {
  mode: "stage_power_duration_history_page";
  session?: StagePowerHistorySession; cursor?: StagePowerHistoryCursor;
}
export interface StagePowerHistoryCandidate {
  activityId: string; startTime: number; activityIncarnation: string; activityRevision: string;
  baseMetricsRevision: string | null;
  sourcePowerOrigin: StagePowerHistoryOrigin | null;
  analysisState: "ready" | "missing" | "pending" | "stale" | "outdated" | "invalid" | "unsupported";
  snapshotState: "missing" | "present_unverified" | "invalid_header";
  snapshotRevision: string | null;
  /** 현재 source와 요청 기간을 다시 확인한다. 이 digest만으로 membership을 인증하지 않는다. */
  candidateBinding: string;
  physicalIdentity: { source: string | null; localSessionId: string | null; stravaActivityId: number | null; stravaTwinActivityId: number | null };
}
export interface StagePowerHistoryPageResponse extends StagePowerHistorySelection {
  version: 1; mode: "stage_power_duration_history_page"; scope: "observed_manual_history_page";
  queryScope: "owner_activities_with_valid_start_time";
  session: StagePowerHistorySession;
  page: { limit: 20; scannedActivityCount: number; candidateActivityCount: number; skippedActivityCount: number;
    exhausted: boolean; enumerationState: "partial" | "exhausted"; nextCursor: StagePowerHistoryCursor | null };
  activities: StagePowerHistoryCandidate[];
  collectionCompleteness: "unknown"; originalClockVerified: false;
  /** known-reference reads와 query limit21을 IO 전에 선예약한 logical capacity. 실제 billing count가 아니다. */
  costs: { documents: number; metadata: 0; snapshotBodies: 0; queries: 1; rawPayloads: 0; writes: 0 };
}
export interface StagePowerHistoryComputeRequest extends StagePowerHistorySelection {
  mode: "stage_power_duration_history_compute";
  session: StagePowerHistorySession;
  candidates: StagePowerHistoryCandidate[];
}
/** native 정수 ms·W만 지원한다.Float64 평균으로 기간 winner를 비교하지 않는다. */
export interface StagePowerExactComparison { sourcePowerOrigin: StagePowerHistoryOrigin; energyWattMilliseconds: string; durationMilliseconds: number }
export interface StagePowerHistoryWeightNormalized {
  unit: "W/kg"; basis: "calculation_profile_snapshot";
  state: "available" | "missing" | "invalid" | "incompatible";
  weightKg: number | null; weightRevision: string; computedAt: number | null;
  maxAveragePowerWPerKg: number | null;
  /** 서로소 양의 분모 exact ratio. Float64 표시값으로 winner를 비교하지 않는다. */
  comparison: { numerator: string; denominator: string } | null;
}
export interface StagePowerHistoryComputedCandidate extends StagePowerHistoryCandidate {
  weightNormalized?: StagePowerHistoryWeightNormalized;
  state: "available" | "unavailable";
  reason: "snapshot_missing" | "no_continuous_window" | null;
  result: StagePowerDurationKernelResult | null;
  comparison: StagePowerExactComparison | null;
  sourceDigest: string | null;
  timingBasis: "stored_native_one_second_slot_policy";
  sensorBucketOriginVerified: false; originalClockVerified: false; quality: "unknown"; collectionCompleteness: "unknown";
}
export interface StagePowerHistoryComputeResponse extends StagePowerHistorySelection {
  version: 1; mode: "stage_power_duration_history_compute"; scope: "observed_explicit_history_candidates";
  session: StagePowerHistorySession;
  candidates: StagePowerHistoryComputedCandidate[];
  analysisCoverage: { origins: StagePowerHistoryOriginCoverage[]; inspectedActivityCount: number; computedActivityCount: number; missingSnapshotCount: number; noContinuousWindowCount: number };
  /** known-reference reads와 query limit21을 IO 전에 선예약한 logical capacity. 실제 billing count가 아니다. */
  costs: { documents: number; metadata: number; snapshotBodies: number; queries: 0; rawPayloads: 0; writes: 0 };
  /** 조회 종료·전체 후보 계산 완료·전체계정 PR와 별개다. */
  enumerationState: "not_certified";
  collectionCompleteness: "unknown"; originalClockVerified: false;
}
