/**
 * 같은 실주행 판정 — **서버(`orider-g1-web:functions/src/training/same-physical-ride.ts`)가 정본**이고
 * 이 파일은 그 미러다. 판정 표 `__fixtures__/same-physical-ride-cases.json` 은 서버 표와 같아야 한다.
 * (Mirror of the server implementation in orider-g1-web; the server is the source of truth.)
 *
 * 입력 차이: 서버는 종목을 `discipline`/`type` 으로 판정하고, 웹은 호출부가 같은 정본
 * (`@shared/sport/discipline` 의 `disciplineOfType`)으로 미리 계산한 `sportFamily` 로 판정한다.
 * 그 외 키·구간·출처 순위·덩어리 분할 규칙은 서버와 같다.
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
 *
 * ## 시간대별 출처 우선순위 1단계 — 순위별 덩어리 분할 (같은주행_분할조각_사양 §3.1·§3.2)
 *
 * 전이적 묶음을 그대로 "대표 1건" 으로 줄이면, 하위 출처 1건(앱 전체 기록)이 상위 출처 조각
 * 여러 건(Strava 오전·오후)을 잇는 날 상위 조각 하나만 남고 나머지가 버려진다.
 * 1. 묶음 안 최상위 순위 기록끼리만 같은 주행 관계로 다시 묶는다 → **덩어리**.
 *    연결 관계만 쓰므로 `hasLoad`·`movingSec` 와 입력 순서에 덩어리 수가 흔들리지 않는다.
 * 2. 덩어리가 1개면 묶음 그대로. 2개 이상이면 덩어리마다 하위 묶음을 만든다.
 * 3. 나머지 기록은 **배정 단위**(순위를 넘어 식별 키 공유로만 묶은 성분)로 배정한다:
 *    키를 하나의 덩어리와만 공유 → 그 덩어리, 아니면 구간 합집합끼리 겹침 길이가 가장 긴 덩어리,
 *    겹침·구간이 없으면 원 묶음 간선으로 다중 시작점 너비 우선 탐색해 가장 가까운 덩어리.
 *    동률은 덩어리 구성원 id 의 사전순 최솟값으로 깬다.
 * 결과는 여전히 "묶음 = 대표 1건" 이라 `pick`·`dedupe` 와 소비처는 바뀌지 않는다.
 * 서버는 분할 시 출처 조합·크기를 로그로 남기지만, 웹은 렌더 경로의 순수 함수라 로그를 남기지 않는다.
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
  if (typeof row.stravaActivityId === "number" && Number.isSafeInteger(row.stravaActivityId) && row.stravaActivityId > 0) keys.push(`strava:${row.stravaActivityId}`);
  if (typeof row.stravaTwinActivityId === "number" && Number.isSafeInteger(row.stravaTwinActivityId) && row.stravaTwinActivityId > 0) keys.push(`strava:${row.stravaTwinActivityId}`);
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
  samsung_health: 2,
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

/**
 * 같은 주행끼리 묶는다. 키와 구간 겹침을 union 한 뒤, 최상위 출처 덩어리가 둘 이상인 묶음은
 * 덩어리별 하위 묶음으로 나눈다(머리 주석 참조). 각 묶음 안 순서는 입력 순서를 보존한다.
 */
export function groupSamePhysicalRides<T extends PhysicalRideActivity>(rows: T[]): T[][] {
  return connectSamePhysicalRides(rows).flatMap(splitByTopRankClusters);
}

/** 전이적 연결 성분 — 키 공유 또는 실질 겹침을 union-find 한다. */
function connectSamePhysicalRides<T extends PhysicalRideActivity>(rows: T[]): T[][] {
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

type TimeSpan = { start: number; end: number };

/** 구간 합집합 — 정렬 후 겹치거나 맞닿은 구간을 합친다. 중복 사본이 시간을 두 번 세지 않게 한다. */
function mergeTimeSpans(spans: TimeSpan[]): TimeSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: TimeSpan[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

/** 두 합집합(각각 정렬·병합됨)의 교집합 길이(ms). */
function intersectionLength(a: TimeSpan[], b: TimeSpan[]): number {
  let total = 0; let i = 0; let j = 0;
  while (i < a.length && j < b.length) {
    const overlap = Math.min(a[i]!.end, b[j]!.end) - Math.max(a[i]!.start, b[j]!.start);
    if (overlap > 0) total += overlap;
    if (a[i]!.end < b[j]!.end) i++; else j++;
  }
  return total;
}

/** 인덱스 기반 union-find. 연결 성분을 가장 작은 인덱스 순으로 돌려준다(결정형). */
function components(linked: (a: number, b: number) => boolean, members: number[]): number[][] {
  const parent = new Map(members.map((index) => [index, index]));
  const find = (index: number): number => {
    let root = index;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(index, root);
    return root;
  };
  for (let x = 0; x < members.length; x++) {
    for (let y = x + 1; y < members.length; y++) {
      if (!linked(members[x]!, members[y]!)) continue;
      const a = find(members[x]!); const b = find(members[y]!);
      if (a !== b) parent.set(Math.max(a, b), Math.min(a, b));
    }
  }
  const byRoot = new Map<number, number[]>();
  for (const index of [...members].sort((a, b) => a - b)) {
    const root = find(index);
    const list = byRoot.get(root);
    if (list) list.push(index); else byRoot.set(root, [index]);
  }
  return [...byRoot.values()];
}

/**
 * 묶음 하나를 최상위 출처 덩어리별 하위 묶음으로 나눈다 (SPC-4-1·4-2).
 * 덩어리가 1개면 묶음을 그대로 돌려준다. 하위 묶음 안 순서는 원래 묶음 순서를 유지한다.
 */
function splitByTopRankClusters<T extends PhysicalRideActivity>(group: T[]): T[][] {
  if (group.length <= 1) return [group];
  const ranks = group.map(physicalRideSourceRank);
  const topRank = Math.min(...ranks);
  const all = group.map((_, index) => index);
  const top = all.filter((index) => ranks[index] === topRank);
  if (top.length <= 1) return [group];
  const keys = group.map((row) => new Set(physicalRideIdentityKeys(row)));
  const sharesKey = (a: number, b: number) => [...keys[a]!].some((key) => keys[b]!.has(key));
  // SPC-4-1: 같은 순위끼리만, 같은 주행 관계(키 공유 또는 실질 겹침)로 덩어리를 만든다.
  const clusters = components(
    (a, b) => sharesKey(a, b) || isOverlappingPhysicalRide(group[a]!, group[b]!), top);
  if (clusters.length <= 1) return [group];

  const spanOf = (members: number[]) => mergeTimeSpans(members.flatMap((index) => {
    const interval = rideInterval(group[index]!);
    return interval ? [interval] : [];
  }));
  const clusterKeys = clusters.map((members) => new Set(members.flatMap((index) => [...keys[index]!])));
  const clusterSpans = clusters.map(spanOf);
  // 동률 깨기 — 소비처마다 달라질 수 있는 대표 id 가 아니라 구성원 id 의 사전순 최솟값.
  const clusterMinId = clusters.map((members) => members.map((index) => group[index]!.id).sort()[0]!);
  const better = (a: number, b: number) => clusterMinId[a]! < clusterMinId[b]! ? a : b;
  const assigned = new Map<number, number>();
  clusters.forEach((members, cluster) => members.forEach((index) => assigned.set(index, cluster)));

  // SPC-4-2-3: 배정 단위 — 최상위가 아닌 기록을 순위를 넘어 키 공유로만 묶는다(겹침은 쓰지 않음).
  const units = components(sharesKey, all.filter((index) => ranks[index] !== topRank));
  const deferred: number[][] = [];
  for (const unit of units) {
    const unitKeys = unit.flatMap((index) => [...keys[index]!]);
    const keyed = clusters.map((_, cluster) => cluster)
      .filter((cluster) => unitKeys.some((key) => clusterKeys[cluster]!.has(key)));
    let chosen: number | null = keyed.length === 1 ? keyed[0]! : null;
    if (chosen == null) {
      // 키 후보가 둘 이상이면 그 안에서, 없으면 전체 덩어리에서 겹침 길이가 가장 긴 쪽.
      const pool = keyed.length > 1 ? keyed : clusters.map((_, cluster) => cluster);
      const unitSpan = spanOf(unit);
      let bestLength = 0;
      for (const cluster of pool) {
        const length = intersectionLength(unitSpan, clusterSpans[cluster]!);
        if (length > bestLength) { bestLength = length; chosen = cluster; }
        else if (length === bestLength && length > 0 && chosen != null) chosen = better(chosen, cluster);
      }
      // 키 후보가 여럿인데 겹침이 없으면 후보 모두 거리 1 이라 동률 규칙으로 정한다.
      if (chosen == null && keyed.length > 1) chosen = keyed.reduce(better);
    }
    if (chosen == null) deferred.push(unit);
    else unit.forEach((index) => assigned.set(index, chosen!));
  }

  if (deferred.length > 0) {
    // SPC-4-2-3-3: 원 묶음 간선으로 이미 배정된 기록들에서 다중 시작점 너비 우선 탐색.
    // 같은 거리면 덩어리 id 동률 규칙으로 고른 이름표를 전파한다.
    const label = new Map(assigned);
    const distance = new Map([...assigned.keys()].map((index) => [index, 0]));
    let frontier = [...label.keys()];
    for (let step = 1; frontier.length > 0; step++) {
      const next = new Map<number, number>();
      for (const from of frontier) {
        for (const to of all) {
          if (label.has(to) || to === from) continue;
          if (!sharesKey(from, to) && !isOverlappingPhysicalRide(group[from]!, group[to]!)) continue;
          const current = next.get(to);
          next.set(to, current == null ? label.get(from)! : better(current, label.get(from)!));
        }
      }
      next.forEach((cluster, index) => { label.set(index, cluster); distance.set(index, step); });
      frontier = [...next.keys()];
    }
    for (const unit of deferred) {
      // 단위 안에서 가장 가까운 기록들의 이름표 중 동률 규칙으로 고른다.
      const reached = unit.filter((index) => label.has(index));
      const nearest = Math.min(...reached.map((index) => distance.get(index)!));
      // 원 묶음은 같은 간선으로 연결돼 있어 닿지 않는 기록은 없다 — 방어적으로 동률 규칙 첫 덩어리.
      const cluster = reached.length > 0
        ? reached.filter((index) => distance.get(index) === nearest).map((index) => label.get(index)!).reduce(better)
        : clusters.map((_, index) => index).reduce(better);
      unit.forEach((index) => assigned.set(index, cluster));
    }
  }

  const split = clusters.map(() => [] as T[]);
  group.forEach((row, index) => split[assigned.get(index)!]!.push(row));
  return split;
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
