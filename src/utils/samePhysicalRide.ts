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
// 파생지표는 물리적 실주행 1건 기준으로 집계한다. 서버 정본 미러:
// @sync-with functions/src/training/same-physical-ride.ts (변경 시 두 파일 모두 갱신).
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

/** 짧은 활동 이동시간의 50% 이상이 겹치는 1:N 분할 기록도 동일 실주행으로 본다. */
export function isOverlappingPhysicalRide(a: PhysicalRideActivity, b: PhysicalRideActivity): boolean {
  if (!a.startTime || !b.startTime) return false;
  const aDur = a.movingSec != null && a.movingSec > 0 ? a.movingSec : null;
  const bDur = b.movingSec != null && b.movingSec > 0 ? b.movingSec : null;
  if (aDur == null || bDur == null) return false;
  const aEnd = a.startTime + aDur * 1000;
  const bEnd = b.startTime + bDur * 1000;
  const overlapSec = (Math.min(aEnd, bEnd) - Math.max(a.startTime, b.startTime)) / 1000;
  return overlapSec >= 120 && overlapSec >= Math.min(aDur, bDur) * 0.5;
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
      if (isSamePhysicalRide(rows[left]!, rows[right]!) || isOverlappingPhysicalRide(rows[left]!, rows[right]!)) {
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
