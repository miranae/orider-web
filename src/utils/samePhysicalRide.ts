/**
 * 같은 실주행 판정 — **정본은 앱의 공용 로직**(`orider-g1-app:shared/.../SamePhysicalRide.kt`)이고
 * 이 파일은 그 미러다. `orider-g1-web:functions/src/training/same-physical-ride.ts` 도 같은 미러.
 *
 * ## 규칙은 하나다: 식별 키가 겹치면 같은 주행이다
 *
 * ```
 * 키 = { doc:<문서id>, session:<로컬세션id>, strava:<Strava활동id> }
 * 같은 주행 ⟺ 두 기록의 키 집합이 겹친다
 * ```
 *
 * 임계가 없다. 시작 시각·거리·이동시간을 비교하지 않는다.
 *
 * ## 왜 추측을 버렸나
 *
 * 이전 판본은 시작 ±2분·거리 0.5%·이동 3% 와 구간 겹침으로 추측했고, 앱은 각자 다른
 * 창을 썼다. 같은 계정이 플랫폼마다 다른 활동 수를 봤다. 추측은 어느 상수를 골라도
 * 오류를 옮길 뿐이다 — 넓히면 별개 주행을 삼키고, 좁히면 같은 주행을 두 번 센다.
 *
 * 연결 사실은 이미 있다: 앱이 업로드 시 `localSessionId` 를 쓰고, Strava 업로드 성공
 * 응답의 활동 id 를 orider 문서 `stravaActivityId` 에 남긴다. Strava 임포트 문서는
 * 처음부터 그 필드를 갖는다.
 *
 * ## 링크가 없는 기록은 다른 주행이다
 *
 * **모르는 것을 같다고 하지 않는다.** 링크 이전 문서는 서버 백필이 한 번 채운다. 이 미러의
 * 전환은 그 백필 뒤에 배포해야 한다 — 먼저 배포하면 기존 orider·strava 쌍이 부하 집계에서
 * 다시 이중 계산된다.
 */

/** 판정에 쓰는 식별 필드. 모르는 값은 null/undefined — 빈 문자열·0 으로 채우지 않는다. */
export interface PhysicalRideIdentity {
  id: string;
  localSessionId?: string | null;
  stravaActivityId?: number | null;
  /** 판정에 쓰지 않는다. 호출부가 다른 용도로 함께 들고 다니는 값. */
  startTime?: number | null;
  distanceKm?: number | null;
  movingSec?: number | null;
}

/** 두 기록을 잇는 키. 접두사가 있어야 세션 id 와 문서 id 가 우연히 같아도 섞이지 않는다. */
export function physicalRideIdentityKeys(row: PhysicalRideIdentity): string[] {
  const keys: string[] = [];
  if (typeof row.id === "string" && row.id.length > 0) keys.push(`doc:${row.id}`);
  if (typeof row.localSessionId === "string" && row.localSessionId.length > 0) keys.push(`session:${row.localSessionId}`);
  if (typeof row.stravaActivityId === "number" && Number.isFinite(row.stravaActivityId)) keys.push(`strava:${row.stravaActivityId}`);
  return keys;
}

/** 같은 주행인가 — 키가 하나라도 겹치는가. */
export function isSamePhysicalRide(reference: PhysicalRideIdentity, candidate: PhysicalRideIdentity): boolean {
  const keys = new Set(physicalRideIdentityKeys(reference));
  return physicalRideIdentityKeys(candidate).some((key) => keys.has(key));
}

export interface PhysicalRideActivity extends PhysicalRideIdentity {
  source?: string | null;
  hasLoad?: boolean;
}

/** 출처 우선순위 — 낮을수록 대표. 표에 없는 값은 2. */
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

/** 같은 주행끼리 묶는다. 키 → 첫 등장 인덱스 표로 union — 전이적, 키 개수에 비례. 입력 순서 보존. */
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
