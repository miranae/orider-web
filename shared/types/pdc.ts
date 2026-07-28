/**
 * Power-Duration Curve (PDC) 모델 — `users/{uid}/fitness/pdc_bike` 단일 doc.
 *
 * Phase C — 2026-05-28
 *
 * 90일 윈도우 활동 mmp 누적 → MMP per duration + CP/W' fit + Stamina + Power Profile + Race Predictor.
 *
 * 갱신:
 *   - 주 1회 cron (scheduledPdcRecompute) — 전 사용자 catch-all
 *   - 사용자 요청 시 callable (recomputeMyPdc)
 */

import type { PowerDurationKey, PrEntry } from "./personal-records";

export type PowerProfile =
  | "sprinter"
  | "pursuiter"
  | "tt_specialist"
  | "all_rounder"
  | "climber"
  | "unclassified";

export type PdcPowerSource =
  | "strava_api"
  | "direct_file"
  | "orider_native"
  | "apple_health"
  | "health_connect"
  | "unknown";

export interface PdcDurationProvenance {
  source: PdcPowerSource;
  cohortEligible: boolean;
}

export type RiderType =
  | "RoadSprinter"
  | "TrackSprinter"
  | "AllRounder"
  | "Puncher"
  | "Climber"
  | "TimeTrialist"
  | "Unclassified";

export interface PdcPrEntry extends PrEntry {
  source: PdcPowerSource;
  cohortEligible: boolean;
}

/** P = CP + W'/T 곡선의 키 duration sample.
 *  리뷰 PR #143 HIGH 수정 후 — 이전 PdcRaceEstimate (distance/predictedMin/predictedW)
 *  는 모든 athlete 에 동일 평속 가정으로 misleading. "T 분 평균 유지 가능한 W" 로
 *  의미 정직화. race ETA 는 별도 모델 필요. */
export interface PdcSustainablePoint {
  minutes: number;
  watts: number;
  basis: "cp_w_prime";
}

export interface PdcDoc {
  discipline: "bike";

  /** 90일 윈도우 best per duration. PrEntry 형태 유지 (activityId/date 추적). */
  mmpAll: Partial<Record<PowerDurationKey, PdcPrEntry>>;

  /** 90일 윈도우 CP/W' 모델 fit. */
  cp: { value: number; wPrime: number; r2: number; computedAt: number } | null;

  /** Allen-Coggan mPDC 단순화 — pmax/frc/ftpEst/cpEst/tteMin. */
  pdcModel: {
    pmax: number;        // W — 1s MMP
    frc: number;         // J — W' (Functional Reserve Capacity)
    ftpEst: number;      // W — CP × 0.97 (Coggan) 또는 20m × 0.95
    cpEst: number;       // W — CP fit 결과
    tteMin: number;      // min — Time to Exhaustion at FTP
  } | null;

  /** P5/P20 비율 — 끝까지 짤 수 있는 정도. 0..1. */
  stamina: number | null;

  /** 분류 (Coggan power profile chart). weight 있을 때만 신뢰. */
  powerProfile: PowerProfile;

  /** 주요 duration 의 W/kg (분류 근거). weight 없으면 null. */
  wPerKgAtKey: Partial<Record<"5s" | "1m" | "5m" | "20m", number>> | null;

  /** 라이더 6타입 분류 + 2축 성향(폭발↔지속 / 절대파워↔W/kg). shared/training/riderType.ts mirror. weight 없거나 데이터 부족이면 null/Unclassified. */
  riderType: { type: RiderType; axisX: number; axisY: number; confidence: number } | null;

  /** Ability — Coggan 남성 power-profile 분위표 대비 duration 별 W/kg 백분위 (v1, 코호트 분위는 #285). 비교 가능한 duration 없으면 null. */
  ability: {
    overallPercentile: number;
    byDuration: Array<{ duration: "5s" | "1m" | "5m" | "20m"; wPerKg: number; percentile: number }>;
  } | null;

  /** P = CP + W'/T 곡선의 키 duration sample. race ETA 아님. */
  sustainablePower: PdcSustainablePoint[];

  /** 월별 history snapshot — 최근 12개월. */
  history: Array<{
    period: string;  // 'YYYY-MM'
    mmp: Partial<Record<PowerDurationKey, number>>;
  }>;

  /** VO2max 추정치 (ml/kg/min) — CP 또는 5분 최대파워 + 체중 기반 Storer/ACSM 공식. 체중 없거나 합리성 범위(20~95) 벗어나면 null. */
  vo2maxEst: number | null;

  /** v5 정본은 실측 파워만 사용하며 duration별 유입 경로를 함께 고정한다.
   * v1 마이그레이션은 비정본 provenance로 표시해 기존 CP/MMP만 안전하게 사용한다. */
  provenance: {
    version: 2;
    power: "measured";
    excludesVirtualPower: true;
    byDuration: Partial<Record<PowerDurationKey, PdcDurationProvenance>>;
    derived: { ftpEst: boolean; vo2maxEst: boolean };
  } | {
    version: 2;
    power: "unknown";
    excludesVirtualPower: false;
    migration: "legacy_v1";
    byDuration: Partial<Record<PowerDurationKey, PdcDurationProvenance>>;
    derived: { ftpEst: false; vo2maxEst: false };
  };

  /** 입력 활동 수 (90d 윈도우). 5 미만 시 fit 신뢰도 낮음. */
  activityCount: number;
  /** 사용된 weight 스냅샷 (W/kg 계산 시). */
  weightKgSnapshot: number | null;
  computedAt: number;
  version: 5;
}

export const PDC_VERSION = 5;
/** PDC 계산 윈도우 (일). */
export const PDC_WINDOW_DAYS = 90;
/** History 보존 개월. */
export const PDC_HISTORY_MONTHS = 12;
