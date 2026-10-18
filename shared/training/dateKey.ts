/**
 * 피트니스(PMC) 일별 부하 날짜 키 규약 — 서버(orider-g1-web shared/training/dateKey.ts)와 같은 출력.
 *
 * 서버는 `users/{uid}/fitness/timeseries_{d}.loadSnapshot.dateKeyBasis` 에 날짜 키를 만든
 * 시간대 구간을 기록한다. 각 순간은 `fromMs <= ms` 인 마지막 구간의 IANA 시간대로 본
 * 'YYYY-MM-DD' 하나에 속한다. 필드가 없으면 처음부터 UTC — 전환 전 문서와 같은 동작이다.
 *
 * 날짜 문자열끼리의 달력 산술(전날, N일 전)은 시간대와 무관하므로 `addFitnessDateKeyDays` 를 쓴다.
 * 순간(ms)에서 N일을 빼서 키를 만들면 DST·구간 경계에서 틀린다.
 */

export interface FitnessDateKeySegment {
  /** 이 구간이 시작되는 순간(ms). null 은 처음부터. */
  fromMs: number | null
  /** IANA 시간대 (예: "Asia/Seoul", "UTC"). */
  tz: string
}

export interface FitnessDateKeyBasis {
  /** fromMs 오름차순. */
  segments: FitnessDateKeySegment[]
}

/** dateKeyBasis 필드가 없는 문서의 의미. 읽기 전용으로 다룬다. */
export const UTC_FITNESS_DATE_KEY_BASIS: FitnessDateKeyBasis = { segments: [{ fromMs: null, tz: "UTC" }] }

const DAY_MS = 86_400_000
const formatters = new Map<string, Intl.DateTimeFormat | null>()

function formatterFor(tz: string): Intl.DateTimeFormat | null {
  if (formatters.has(tz)) return formatters.get(tz)!
  let formatter: Intl.DateTimeFormat | null = null
  try {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
  } catch {
    formatter = null
  }
  formatters.set(tz, formatter)
  return formatter
}

/** 저장된 값을 검증한다. 없거나 형식이 깨졌으면 UTC(기존 동작)로 본다. */
export function normalizeFitnessDateKeyBasis(value: unknown): FitnessDateKeyBasis {
  if (!value || typeof value !== "object" || Array.isArray(value)) return UTC_FITNESS_DATE_KEY_BASIS
  const segments = (value as Record<string, unknown>).segments
  if (!Array.isArray(segments) || segments.length === 0) return UTC_FITNESS_DATE_KEY_BASIS
  let previous = Number.NEGATIVE_INFINITY
  for (const [index, candidate] of segments.entries()) {
    if (!candidate || typeof candidate !== "object") return UTC_FITNESS_DATE_KEY_BASIS
    const { fromMs, tz } = candidate as Record<string, unknown>
    if (typeof tz !== "string" || !formatterFor(tz)) return UTC_FITNESS_DATE_KEY_BASIS
    if (fromMs === null) {
      if (index !== 0) return UTC_FITNESS_DATE_KEY_BASIS
      continue
    }
    if (typeof fromMs !== "number" || !Number.isFinite(fromMs) || fromMs < previous) return UTC_FITNESS_DATE_KEY_BASIS
    previous = fromMs
  }
  return value as FitnessDateKeyBasis
}

/** 이 순간에 적용되는 시간대. 첫 구간보다 이른 순간은 첫 구간 시간대로 본다. */
export function fitnessDateKeyTimeZone(epochMs: number, basis?: unknown): string {
  const { segments } = normalizeFitnessDateKeyBasis(basis)
  let tz = segments[0]!.tz
  for (const segment of segments) {
    if (segment.fromMs === null || segment.fromMs <= epochMs) tz = segment.tz
    else break
  }
  return tz
}

/** 순간(ms) → 그 basis 의 일별 부하 날짜 키. basis 가 없으면 UTC 날짜. */
export function fitnessDateKeyFor(epochMs: number, basis?: unknown): string {
  const tz = fitnessDateKeyTimeZone(epochMs, basis)
  if (tz === "UTC") return new Date(epochMs).toISOString().slice(0, 10)
  const parts = formatterFor(tz)!.formatToParts(new Date(epochMs))
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

/** 정본 시계열 기준 오늘 키. */
export function fitnessTodayKey(nowMs: number, basis?: unknown): string {
  return fitnessDateKeyFor(nowMs, basis)
}

/** 날짜 키 달력 산술 — 시간대·DST 와 무관하게 하루씩 이동한다. */
export function addFitnessDateKeyDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10)
}
