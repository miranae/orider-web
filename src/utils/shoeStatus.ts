/**
 * 신발 교체 임박 판정 (설계 문서 §3.6).
 *
 * 신발 카드 자체는 이미 존재한다(`RunDetailCards` 의 `GearCard`) — 서버가 활동 문서에
 * 비정규화해 넣는 `Activity.gear` 스냅샷을 읽는다. 이번 범위는 **신규 구현이 아니라 노출 확대**다.
 *
 * ## 캐비엇 (백엔드 확인 필요)
 * `Activity.gear` 는 optional 이고 백엔드가 채운다. 사용자가 Strava 에서 신발을 지정한 활동에만
 * 붙을 수 있다. 사용자별 gear 집계 문서가 없으므로 **가장 최근 러닝의 스냅샷**에 의존한다 —
 * 신발을 지정하지 않은 활동이 가장 최근이면 배지가 사라진다. 이 한계는 감수하고, 없으면 렌더하지 않는다
 * (틀린 누적 거리를 보여주느니 아무것도 안 보여주는 편이 낫다).
 */
import type { Activity } from "@shared/types";

/** 잔여 수명이 이 비율 아래로 떨어지면 교체를 안내한다. */
const REPLACEMENT_THRESHOLD_RATIO = 0.15;

export interface ShoeStatus {
  name: string;
  totalDistanceKm: number;
  maxDistanceKm: number;
  remainingKm: number;
  /** 잔여 비율 (0~1). */
  remainingRatio: number;
  /** 교체 임박 — 잔여 15% 미만. */
  replacementDue: boolean;
}

/**
 * @param runs 최신순 정렬을 가정하지 않는다 — 가장 최근 러닝을 직접 고른다.
 */
export function latestShoeStatus(runs: Activity[]): ShoeStatus | null {
  const withShoes = runs.filter((a) => a.gear?.type === "shoes" && (a.gear?.maxDistanceKm ?? 0) > 0);
  if (withShoes.length === 0) return null;

  const latest = withShoes.reduce((a, b) => (b.startTime > a.startTime ? b : a));
  const gear = latest.gear!;
  const maxDistanceKm = gear.maxDistanceKm!;
  const totalDistanceKm = gear.totalDistanceKm ?? 0;
  const remainingKm = Math.max(0, maxDistanceKm - totalDistanceKm);
  const remainingRatio = remainingKm / maxDistanceKm;

  return {
    name: gear.name,
    totalDistanceKm: Math.round(totalDistanceKm),
    maxDistanceKm: Math.round(maxDistanceKm),
    remainingKm: Math.round(remainingKm),
    remainingRatio,
    replacementDue: remainingRatio < REPLACEMENT_THRESHOLD_RATIO,
  };
}
