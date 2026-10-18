/**
 * 피트니스 시계열 일별 버킷 날짜키 — **클라/서버 단일 규약(#539)**.
 *
 * CTL/ATL·일별 TSS 버킷팅은 클라 폴백(web)과 서버 정본(functions)이 같은 날짜키를 써야
 * 같은 활동이 같은 날 버킷에 들어간다. 기존엔 클라가 로컬 TZ(`toLocalDate`), 서버 정본이
 * UTC(`new Date(ms).toISOString().slice(0,10)`)라, 정본 doc 미배포/신규유저/tri 폴백 시
 * 곡선이 서버값과 1일 시프트됐다.
 *
 * 정본(fitness-timeseries.ts·projection-update.ts·training-summary 의 daily map)이 이미 UTC 라,
 * 마이그레이션 없이 **클라를 UTC 정본 규약에 맞춘다.** 본 함수가 그 단일 규약이다.
 *
 * ⚠️ 서버 functions 의 `utcKey`(fitness-timeseries.ts) 와 **동일 출력**이어야 한다.
 * (functions tsconfig 가 shared/training 직접 import 를 강제하지 않아 서버는 동일 구현을
 *  자체 보유 — 한쪽 변경 시 양쪽 동기화. 향후 monorepo 정리 시 단일화.)
 */
export function fitnessDateKey(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/**
 * 사용자 시간대 날짜키 기준 (#3252) — `loadSnapshot.dateKeyBasis`·부하 원장의 `dateKeyBasis`.
 *
 * 순간 시각 → 날짜키를 정하는 구간 목록이다. 각 구간은 `fromMs` 부터 다음 구간 전까지 `tz` 의 현지 날짜를 쓴다.
 * `fromMs: null` 은 처음부터(−∞). 오름차순. 필드가 없으면 `{ segments: [{ fromMs: null, tz: "UTC" }] }` 로 본다 —
 * 전환 전에 계산한 과거 날짜는 UTC 키 그대로 두고, 전환 시각(새 시간대의 다음 다음 자정) 이후만 현지 날짜를 쓴다.
 * 한 순간은 항상 키 하나라 같은 활동이 두 날짜에 들어가거나 빠지지 않는다.
 *
 * functions·web 이 같은 파일 사본을 쓴다 — 순수 함수와 Intl 만 쓴다(한쪽 변경 시 양쪽 동기화).
 */
export interface FitnessDateKeySegment {
  fromMs: number | null;
  tz: string;
}
export interface FitnessDateKeyBasis {
  segments: FitnessDateKeySegment[];
}

export const UTC_FITNESS_DATE_KEY_BASIS: FitnessDateKeyBasis = Object.freeze({
  segments: Object.freeze([Object.freeze({ fromMs: null, tz: "UTC" })]) as unknown as FitnessDateKeySegment[],
}) as FitnessDateKeyBasis;

/** 어떤 IANA 시간대의 자정도 UTC 자정보다 이 이상 이르지 않다(최대 오프셋 UTC+14). */
const MAX_TIMEZONE_AHEAD_MS = 14 * 3_600_000;

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = dateFormatterCache.get(timezone);
  if (cached) return cached;
  const next = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, calendar: "iso8601", numberingSystem: "latn",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  dateFormatterCache.set(timezone, next);
  return next;
}

function validTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  try {
    dateFormatter(value).format(0);
    return true;
  } catch {
    return false;
  }
}

/** 해당 시간대의 현지 날짜 'YYYY-MM-DD'. */
export function fitnessLocalDateKey(epochMs: number, timezone: string): string {
  if (timezone === "UTC") return fitnessDateKey(epochMs);
  const values: Record<string, string> = {};
  for (const part of dateFormatter(timezone).formatToParts(new Date(epochMs))) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * 저장값을 기준으로 바꾼다. 없거나 형식이 깨졌으면 UTC 기준(전환 전 동작)이다.
 * 형식: 첫 구간은 `fromMs: null`(숫자여도 −∞ 로 읽는다), 나머지는 유한한 오름차순 ms, `tz` 는 유효한 IANA.
 */
export function normalizeFitnessDateKeyBasis(value: unknown): FitnessDateKeyBasis {
  if (!value || typeof value !== "object") return UTC_FITNESS_DATE_KEY_BASIS;
  // 활동마다 부르므로 같은 객체의 검증 결과를 재사용한다(Intl 검증 반복 방지).
  const cached = normalizedCache.get(value);
  if (cached) return cached;
  const normalized = parseFitnessDateKeyBasis(value);
  normalizedCache.set(value, normalized);
  return normalized;
}

const normalizedCache = new WeakMap<object, FitnessDateKeyBasis>();

function parseFitnessDateKeyBasis(value: object): FitnessDateKeyBasis {
  const segments = (value as { segments?: unknown }).segments;
  if (!Array.isArray(segments) || segments.length === 0) return UTC_FITNESS_DATE_KEY_BASIS;
  const out: FitnessDateKeySegment[] = [];
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index] as Partial<FitnessDateKeySegment> | null;
    if (!segment || typeof segment !== "object" || !validTimezone(segment.tz)) return UTC_FITNESS_DATE_KEY_BASIS;
    if (index === 0) {
      // 첫 구간은 처음부터(−∞)다. 숫자여도(정리 후 등) 그보다 이른 순간은 첫 구간 시간대로 본다 — null 로 읽는다.
      if (segment.fromMs !== null && (typeof segment.fromMs !== "number" || !Number.isFinite(segment.fromMs))) return UTC_FITNESS_DATE_KEY_BASIS;
    } else {
      const previous = index === 1 ? (segments[0] as FitnessDateKeySegment).fromMs : out[index - 1]!.fromMs;
      if (typeof segment.fromMs !== "number" || !Number.isFinite(segment.fromMs)
        || previous !== null && segment.fromMs <= previous) return UTC_FITNESS_DATE_KEY_BASIS;
    }
    out.push({ fromMs: index === 0 ? null : segment.fromMs as number, tz: segment.tz as string });
  }
  return { segments: out };
}

/** 그 순간에 적용되는 시간대 — `fromMs <= ms` 인 마지막 구간. */
export function fitnessDateKeyTimezoneAt(epochMs: number, basis: unknown): string {
  const { segments } = normalizeFitnessDateKeyBasis(basis);
  let timezone = segments[0]!.tz;
  for (const segment of segments) {
    if (segment.fromMs === null || segment.fromMs <= epochMs) timezone = segment.tz;
    else break;
  }
  return timezone;
}

/** 순간 시각의 날짜키. 활동 → 일자 변환은 항상 이 함수로 한다. */
export function fitnessDateKeyFor(epochMs: number, basis: unknown): string {
  return fitnessLocalDateKey(epochMs, fitnessDateKeyTimezoneAt(epochMs, basis));
}

/** 오늘 날짜키 — 저장된 구간만으로 정한다(새 구간은 항상 미래에 시작하므로 오늘을 바꾸지 않는다). */
export function fitnessTodayKey(nowMs: number, basis: unknown): string {
  return fitnessDateKeyFor(nowMs, basis);
}

/** 날짜키 달력 산술. 순간 시각에서 `DAY_MS` 를 빼는 방식은 DST 날에 틀리므로 날짜끼리만 셈한다. */
export function addFitnessDateKeyDays(dateKey: string, amount: number): string {
  const [year, month, day] = dateKey.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

/**
 * 이 날짜키를 가질 수 있는 가장 이른 순간의 하한 — 조회 하한용(넉넉하게).
 * 어떤 시간대로도 현지 날짜 D 는 `D 00:00Z − 14시간` 보다 일찍 시작하지 않는다.
 */
export function fitnessDateKeyEarliestMs(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00.000Z`) - MAX_TIMEZONE_AHEAD_MS;
}
