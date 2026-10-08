import type { LapData } from "../types";

/** 소유자 전용 확정 분석 요약. 누락된 레거시 랩 필드는 만들지 않는다. */
export interface ActivityAnalysisSummary {
  schemaVersion: 1;
  laps: Array<Partial<LapData>>;
  caloriesFallbackKcal: number | null;
  hasAnalysisStreams: boolean;
  sensors: {
    hasHeartRateStream: boolean; hasRejectedHeartRateStream: boolean;
    hasCadenceStream: boolean; hasRejectedCadenceStream: boolean;
    hasPowerStream: boolean; hasRejectedPowerStream: boolean;
    hasReliablePower: boolean;
    averageHeartRate: number | null; maxHeartRate: number | null;
    averageCadence: number | null; maxCadence: number | null;
    averagePower: number | null; maxPower: number | null;
    heartRateSource: "sensorStreamsV1" | "heartrate" | null;
    powerSource: "sensorStreamsV1" | "virtualPowerOverride" | "watts" | "watts_calc" | null;
    rejections: Array<{
      channel: "power" | "heart_rate" | "cadence";
      source: "sensorStreamsV1" | "virtualPowerOverride" | "legacy";
      reason: "invalid_channel" | "invalid_metadata" | "invalid_axis" | "missing_duration"
        | "duration_mismatch" | "origin_mismatch" | "insufficient_coverage"
        | "insufficient_measurements" | "sparse_axis";
      axisLength?: number; channelLength?: number;
    }>;
  } | null;
  correctedAverages: {
    averageHeartRate: number | null; maxHeartRate: number | null;
    averageCadence: number | null; maxCadence: number | null;
    averagePower: number | null; maxPower: number | null;
    normalizedPower: number | null; tss: number | null;
  };
}
