/**
 * 같은 실주행 판정 — **정본은 앱의 공용 로직**(`orider-g1-app:shared/.../SamePhysicalRide.kt`)이고
 * 이 파일은 그 미러다. `orider-g1-web:functions/src/training/same-physical-ride.ts` 도 같은 미러.
 *
 * ## 판정 규칙
 *
 * ```
 * 키 = { doc:<문서id>, session:<로컬세션id>, strava:<Strava활동id> }
 * 같은 주행 ⟺ 식별 키가 겹치거나 운동 시간 구간이 실질적으로 겹친다
 * ```
 *
 * 명시적 링크가 가장 강한 근거지만, 링크 이전 기록과 한 주행이 여러 조각으로 저장된
 * 기록도 있다. 같은 사용자의 같은 종목 목록 안에서는 짧은 쪽 구간의 절반 이상이 겹치면
 * 같은 물리 주행으로 묶는다. 2분 미만의 우연한 경계 겹침은 제외한다.
 *
 * 연결 사실은 이미 있다: 앱이 업로드 시 `localSessionId` 를 쓰고, Strava 업로드 성공
 * 응답의 활동 id 를 orider 문서 `stravaTwinActivityId` 에 남긴다. Strava 임포트 문서는
 * 처음부터 그 필드를 갖는다.
 *
 * 그룹은 전이적으로 합쳐진다. 따라서 Strava 전체 기록 하나가 여러 ORider 분할 기록과
 * 각각 겹치면 모두 한 그룹이 되고, 대표 우선순위에 따라 Strava 한 건만 남는다.
 */

/** 판정에 쓰는 식별 필드. 모르는 값은 null/undefined — 빈 문자열·0 으로 채우지 않는다. */
export interface PhysicalRideIdentity {
  id: string;
  localSessionId?: string | null;
  /** Strava 임포트 문서 자신의 Strava 활동 id. */
  stravaActivityId?: number | null;
  /** orider 문서가 가리키는 쌍둥이 Strava 활동 id — 링크 전용 필드(`stravaActivityId` 는 스트림 위치 의미라 재사용 금지). */
  stravaTwinActivityId?: number | null;
  /** 판정에 쓰지 않는다. 호출부가 다른 용도로 함께 들고 다니는 값. */
  startTime?: number | null;
  endTime?: number | null;
  distanceKm?: number | null;
  movingSec?: number | null;
  /** 정규화된 종목 축. 시간 중첩 판정은 같은 축끼리만 허용한다. */
  sportFamily?: string | null;
}

/** 두 기록을 잇는 키. 접두사가 있어야 세션 id 와 문서 id 가 우연히 같아도 섞이지 않는다. */
export function physicalRideIdentityKeys(row: PhysicalRideIdentity): string[] {
  const keys: string[] = [];
  if (typeof row.id === "string" && row.id.length > 0) keys.push(`doc:${row.id}`);
  if (typeof row.localSessionId === "string" && row.localSessionId.length > 0) keys.push(`session:${row.localSessionId}`);
  if (typeof row.stravaActivityId === "number" && Number.isFinite(row.stravaActivityId)) keys.push(`strava:${row.stravaActivityId}`);
  if (typeof row.stravaTwinActivityId === "number" && Number.isFinite(row.stravaTwinActivityId)) keys.push(`strava:${row.stravaTwinActivityId}`);
  return keys;
}

/** 같은 주행인가 — 키가 하나라도 겹치는가. */
export function isSamePhysicalRide(reference: PhysicalRideIdentity, candidate: PhysicalRideIdentity): boolean {
  const keys = new Set(physicalRideIdentityKeys(reference));
  return physicalRideIdentityKeys(candidate).some((key) => keys.has(key))
    || isOverlappingPhysicalRide(reference, candidate);
}

const MIN_OVERLAP_MS = 2 * 60 * 1000;
const MIN_SHORTER_OVERLAP_RATIO = 0.5;

function rideInterval(row: PhysicalRideIdentity): { start: number; end: number } | null {
  const start = row.startTime;
  if (typeof start !== "number" || !Number.isFinite(start) || start <= 0) return null;
  const explicitEnd = row.endTime;
  if (typeof explicitEnd === "number" && Number.isFinite(explicitEnd) && explicitEnd > start) {
    return { start, end: explicitEnd };
  }
  const movingSec = row.movingSec;
  if (typeof movingSec !== "number" || !Number.isFinite(movingSec) || movingSec <= 0) return null;
  return { start, end: start + movingSec * 1000 };
}

/** 짧은 활동 시간의 절반 이상이 겹치는 전체 기록·분할 기록을 같은 주행으로 본다. */
export function isOverlappingPhysicalRide(a: PhysicalRideIdentity, b: PhysicalRideIdentity): boolean {
  if (typeof a.sportFamily !== "string" || a.sportFamily.length === 0 || a.sportFamily !== b.sportFamily) return false;
  const left = rideInterval(a);
  const right = rideInterval(b);
  if (!left || !right) return false;
  const overlapMs = Math.min(left.end, right.end) - Math.max(left.start, right.start);
  const shorterMs = Math.min(left.end - left.start, right.end - right.start);
  return overlapMs >= MIN_OVERLAP_MS && overlapMs >= shorterMs * MIN_SHORTER_OVERLAP_RATIO;
}

export interface PhysicalRideActivity extends PhysicalRideIdentity {
  source?: string | null;
  hasLoad?: boolean;
}

/** 출처 우선순위 — 낮을수록 대표. 사용자 정책은 Strava > ORider > Health. */
const SOURCE_PRIORITY_RANK: Readonly<Record<string, number>> = {
  strava: 0,
  orider: 1,
  apple_health: 2,
  health_connect: 2,
};

export function physicalRideSource(row: PhysicalRideActivity): string | null {
  if (typeof row.source === "string" && row.source.length > 0) return row.source;
  if (row.id.startsWith("strava_")) return "strava";
  return null;
}

export function physicalRideSourceRank(row: PhysicalRideActivity): number {
  const source = physicalRideSource(row);
  if (source == null) return 3;
  return SOURCE_PRIORITY_RANK[source] ?? 3;
}

/** 같은 주행끼리 묶는다. 키와 구간 겹침을 union 하며 입력 순서를 보존한다. */
export function groupSamePhysicalRides<T extends PhysicalRideActivity>(rows: T[]): T[][] {
  const parent = rows.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]!]!;
      index = parent[index]!;
    }
    return index;
  };
  const firstByKey = new Map<string, number>();
  rows.forEach((row, index) => {
    for (const key of physicalRideIdentityKeys(row)) {
      const earlier = firstByKey.get(key);
      if (earlier === undefined) firstByKey.set(key, index);
      else parent[find(index)] = find(earlier);
    }
  });
  for (let left = 0; left < rows.length; left++) {
    for (let right = left + 1; right < rows.length; right++) {
      if (isOverlappingPhysicalRide(rows[left]!, rows[right]!)) {
        parent[find(right)] = find(left);
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

/** 대표 — 출처 우선순위 → 부하 보유 → 긴 이동시간 → id. 마지막 id 비교가 있어야 결정형이다. */
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

/** 중복을 제거한다. 입력 순서를 유지한다. */
export function dedupeSamePhysicalRides<T extends PhysicalRideActivity>(rows: T[]): T[] {
  if (rows.length <= 1) return rows;
  const keep = new Set<string>();
  for (const group of groupSamePhysicalRides(rows)) keep.add(pickPhysicalRideRepresentative(group).id);
  return rows.filter((row) => keep.has(row.id));
}
