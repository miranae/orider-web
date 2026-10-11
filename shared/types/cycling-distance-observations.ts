import type { BikeDistanceKey } from "../activity-bike-distance-evidence";

export type DeclaredCyclingActivitySource = "orider" | "strava" | "apple_health" | "health_connect";
/** 저장 축의 근거만 설명한다. 기기 원본 시계나 GPS 적격성을 입증하지 않는다. */
export interface CyclingDistanceProvenance {
  provenanceVersion: 2;
  sourceBasis: "stored_distance_parts";
  timingBasis: "stored_explicit_activity_elapsed";
  originalClockVerified: false;
  declaredActivitySource: DeclaredCyclingActivitySource | null;
}
export interface NormalizedCyclingDistanceProvenance extends CyclingDistanceProvenance {
  status: "stored_explicit" | "legacy_normalized";
}
/** 소유자 전용. 평가된 저장 관측 축이며 전체 활동·계정 PR을 뜻하지 않는다. */
export interface CyclingDistanceObservations extends CyclingDistanceProvenance {
  targetsVersion: 1;
  scope: "observed_measured_axis";
  quality: "unknown";
  coverage: "unknown";
  /** 표식과 함께 빈 map이면 이 측정 입력에서 13거리 노력이 관측되지 않았다. */
  records: Partial<Record<BikeDistanceKey, number>>;
}
