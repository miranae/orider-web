export interface PhysicalRideIdentity {
  id: string;
  startTime?: number | null;
  distanceKm?: number | null;
  movingSec?: number | null;
}

/** 공급자별로 중복 저장된 동일 실주행을 식별한다. */
export function isSamePhysicalRide(
  reference: PhysicalRideIdentity,
  candidate: PhysicalRideIdentity,
): boolean {
  if (candidate.id === reference.id) return true;
  if (!reference.startTime || !candidate.startTime) return false;
  const startDelta = Math.abs(reference.startTime - candidate.startTime);
  if (startDelta > 2 * 60 * 1000) return false;

  const refDistance = reference.distanceKm;
  const candidateDistance = candidate.distanceKm;
  const distanceMatches = refDistance != null && candidateDistance != null && refDistance > 0
    ? Math.abs(refDistance - candidateDistance) <= Math.max(0.2, refDistance * 0.005)
    : startDelta <= 5_000;
  if (!distanceMatches) return false;

  const refMoving = reference.movingSec;
  const candidateMoving = candidate.movingSec;
  return refMoving == null || candidateMoving == null ||
    Math.abs(refMoving - candidateMoving) <= Math.max(120, refMoving * 0.03);
}

// 활동 문서는 비교 목적으로 공급자별(orider/strava) 이중 보존하지만, 부하·체력
// 파생지표는 물리적 실주행 1건 기준으로 집계한다.
//
// **정본은 앱의 공용 로직이다** — 홈·기록 화면이 아직 업로드되지 않은 로컬 세션과 계정
// 활동을 함께 보여주므로 판정이 기기에서 일어나야 한다. 이 파일은 그 미러다.
// @sync-with orider-g1-app:shared/.../domain/usecase/SamePhysicalRide.kt
// @sync-with orider-g1-web:functions/src/training/same-physical-ride.ts
// (임계를 한쪽에서만 고치면 같은 계정이 플랫폼마다 다른 활동 수를 본다.)
export interface PhysicalRideActivity extends PhysicalRideIdentity {
  source?: string | null;
  hasLoad?: boolean;
}

const SOURCE_PRIORITY_RANK: Readonly<Record<string, number>> = {
  strava: 0,
  apple_health: 1,
  health_connect: 1,
};

export function physicalRideSource(row: PhysicalRideActivity): string | null {
  if (typeof row.source === "string" && row.source.length > 0) return row.source;
  if (row.id.startsWith("strava_")) return "strava";
  return null;
}

export function physicalRideSourceRank(row: PhysicalRideActivity): number {
  const source = physicalRideSource(row);
  if (source == null) return 2;
  return SOURCE_PRIORITY_RANK[source] ?? 2;
}

/**
 * 겹침 판정에서 허용하는 평균 속도 차 비율.
 *
 * 겹침만 보면 **거리를 전혀 보지 않아** 시간이 겹치는 77km 기록과 3km 기록을 한 건으로
 * 합치고, 대표로 3km 를 남겨 **77km 를 버린다.** 거리 차 자체를 막으면 1:N 분할(30km
 * 1시간 + 전체 77km 2.5시간)을 놓치므로 **평균 속도**를 본다 — 같은 실주행이면 어떻게
 * 쪼개도 평균 속도는 비슷하다.
 */
const OVERLAP_SPEED_TOLERANCE = 0.25;

/**
 * **출처가 다를 때만** 쓰는 넓은 시작 시각 창.
 *
 * 실기 사례: 같은 주행이 orider(17:06 · 77.78km)·strava(18:07 · 70.42km) 두 벌로 들어와
 * 주간 거리가 약 2배(467km)로 떴다. 둘 다 이동시간 약 1시간이라 **구간이 겹치지도 않아**
 * 좁은 판정과 겹침 판정 모두 이 쌍을 놓친다.
 *
 * 출처가 다를 때만 발화한다 — 같은 출처의 연속 주행을 삼키지 않기 위해서다.
 *
 * 남은 위험: 90분 안에 거리가 비슷한 **별개** 주행 두 건 중 한쪽만 Strava 에 있으면 한
 * 건을 잃는다. 진짜 해결은 업로드 시 orider 문서에 Strava 트윈 id 를 남겨 추측 대신
 * 정확한 링크로 판정하는 것이다(현재 역링크 미기록).
 */
const CROSS_SOURCE_START_WINDOW_MS = 90 * 60 * 1000;

/** 교차출처 절의 거리 허용 오차 비율. 실측 차이가 9% 였다. */
const CROSS_SOURCE_DISTANCE_TOLERANCE = 0.15;

/**
 * 두 기록의 평균 속도가 같은 주행으로 볼 만큼 가까운가.
 *
 * 한쪽 거리를 모르면 판단하지 않고 통과시킨다 — 모르는 값을 불일치로 취급하면 중복이
 * 그대로 남는다.
 */
function speedsAgree(
  a: PhysicalRideActivity, b: PhysicalRideActivity, aDur: number, bDur: number,
): boolean {
  const aDistance = a.distanceKm;
  const bDistance = b.distanceKm;
  if (aDistance == null || bDistance == null) return true;
  const aSpeed = aDistance / aDur;
  const bSpeed = bDistance / bDur;
  const faster = Math.max(aSpeed, bSpeed);
  if (faster <= 0) return true;
  return (faster - Math.min(aSpeed, bSpeed)) / faster <= OVERLAP_SPEED_TOLERANCE;
}

/** 출처가 다른 두 기록이 같은 주행인가 — 넓은 창. 근거는 위 상수 주석. */
export function isCrossSourcePhysicalRideDuplicate(
  a: PhysicalRideActivity, b: PhysicalRideActivity,
): boolean {
  const aSource = physicalRideSource(a);
  const bSource = physicalRideSource(b);
  // 출처를 모르면 판정하지 않는다 — 모르는 둘을 다르다고 보면 연속 주행을 삼킨다.
  if (aSource == null || bSource == null || aSource === bSource) return false;
  if (!a.startTime || !b.startTime) return false;
  if (Math.abs(a.startTime - b.startTime) > CROSS_SOURCE_START_WINDOW_MS) return false;
  const longer = Math.max(a.distanceKm ?? 0, b.distanceKm ?? 0);
  if (longer <= 0) return false;
  const shorter = Math.min(a.distanceKm ?? 0, b.distanceKm ?? 0);
  return (longer - shorter) / longer <= CROSS_SOURCE_DISTANCE_TOLERANCE;
}

/** 짧은 활동 이동시간의 50% 이상이 겹치는 1:N 분할 기록도 동일 실주행으로 본다. */
export function isOverlappingPhysicalRide(a: PhysicalRideActivity, b: PhysicalRideActivity): boolean {
  if (!a.startTime || !b.startTime) return false;
  const aDur = a.movingSec != null && a.movingSec > 0 ? a.movingSec : null;
  const bDur = b.movingSec != null && b.movingSec > 0 ? b.movingSec : null;
  if (aDur == null || bDur == null) return false;
  const aEnd = a.startTime + aDur * 1000;
  const bEnd = b.startTime + bDur * 1000;
  const overlapSec = (Math.min(aEnd, bEnd) - Math.max(a.startTime, b.startTime)) / 1000;
  if (overlapSec < 120 || overlapSec < Math.min(aDur, bDur) * 0.5) return false;
  return speedsAgree(a, b, aDur, bDur);
}

export function groupSamePhysicalRides<T extends PhysicalRideActivity>(rows: T[]): T[][] {
  const parent = rows.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]!]!;
      index = parent[index]!;
    }
    return index;
  };
  const union = (left: number, right: number) => { parent[find(left)] = find(right); };
  for (let left = 0; left < rows.length; left++) {
    for (let right = left + 1; right < rows.length; right++) {
      if (isSamePhysicalRide(rows[left]!, rows[right]!) ||
        isOverlappingPhysicalRide(rows[left]!, rows[right]!) ||
        isCrossSourcePhysicalRideDuplicate(rows[left]!, rows[right]!)) {
        union(left, right);
      }
    }
  }
  const groups = new Map<number, T[]>();
  rows.forEach((row, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group) group.push(row);
    else groups.set(root, [row]);
  });
  return [...groups.values()];
}

export function pickPhysicalRideRepresentative<T extends PhysicalRideActivity>(group: T[]): T {
  return group.reduce((best, row) => {
    const bestRank = physicalRideSourceRank(best);
    const rowRank = physicalRideSourceRank(row);
    if (bestRank !== rowRank) return bestRank < rowRank ? best : row;
    const bestLoad = best.hasLoad === true;
    const rowLoad = row.hasLoad === true;
    if (bestLoad !== rowLoad) return bestLoad ? best : row;
    const bestMoving = best.movingSec ?? 0;
    const rowMoving = row.movingSec ?? 0;
    if (bestMoving !== rowMoving) return bestMoving > rowMoving ? best : row;
    return best.id <= row.id ? best : row;
  });
}

export function dedupeSamePhysicalRides<T extends PhysicalRideActivity>(rows: T[]): T[] {
  if (rows.length <= 1) return rows;
  const keep = new Set<string>();
  for (const group of groupSamePhysicalRides(rows)) {
    keep.add(pickPhysicalRideRepresentative(group).id);
  }
  return rows.filter((row) => keep.has(row.id));
}
