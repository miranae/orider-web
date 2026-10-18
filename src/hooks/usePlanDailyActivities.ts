/**
 * 계획 화면 날짜 칸에 붙이는 "그날 실제로 한 활동" — 서버 일별 활동 문서를 읽기만 한다.
 *
 * 문서: `users/{uid}/daily_activities/{discipline}_{YYYY-MM}` (본인 read 전용, 서버 write).
 * 같은 주행 중복 제거·TSS 산출은 서버가 끝낸 값이다. 웹은 다시 계산하지 않는다(지표 정본 원칙).
 *
 * 읽기 비용: 계획 범위(첫날~오늘)의 월 문서만 onSnapshot 으로 구독한다(보통 2~4개). 서버 허용 범위
 * [이번 달-12, 이번 달] 안의 달만 구독하고(최대 13개), 더 오래된 계획 달은 "확인 불가"로 둔다.
 * 활동이 추가·삭제되면 서버가 문서를 갱신하므로 재조회·캐시 로직은 두지 않는다.
 * 문서가 없거나 미완성(complete!==true)·스키마 불일치일 때만 `ensureDailyActivities` 를 부르고,
 * 같은 세션에서 같은 달은 한 번만 부른다(성공한 요청은 기억, 실패하면 다음 마운트에서 다시 시도).
 * 문서가 완성으로 보이면 기억을 지우므로, 나중에 서버가 그 달을 다시 무효화하면 다시 부른다.
 * 호출은 6개월씩 나눈다.
 * 트리거는 문서가 없는 달을 만들지 않으므로 문서가 없는 달은 반드시 ensure 로 만든다.
 * 응답이 basis_changed(생성 중 스키마 버전이 바뀐 경우)인 달은 한 번 더 부른다(같은 달 최대 2회).
 * 서버가 받는 달은 사용자 시간대 기준 [이번 달-12, 이번 달] 뿐이라 그 밖의 달은 요청에서 뺀다.
 *
 * 날짜 매칭: 문서의 날짜 키는 사용자 시간대(timezone 필드) 기준 로컬 날짜다. 계획 칸 날짜는
 * PlanDay.date(KST 00:00 ms)를 planDayKey 로 바꾼 달력 날짜 문자열(YYYY-MM-DD)이다. 둘을 같은
 * "달력 날짜"로 보고 문자열 그대로 맞춘다 — 사용자 시간대에서의 하루 = 그 달력 날짜라는 가정이다.
 * KST 가 아닌 사용자는 계획 칸 경계(KST)와 문서 경계(사용자 시간대)가 다르지만, 칸이 뜻하는
 * 달력 날짜에 사용자가 그 시간대에서 한 활동을 붙이는 것이 의도다. (miranae/orider-g1-web#3252)
 */
import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from "firebase/functions";
import type { PlanWeek } from "@shared/types/goal";
import { planDayKey } from "@shared/training/planDate";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { debugLog, logClientError } from "../services/errorLogger";
import { getRuntimeConfig, isEmulatorRuntime } from "../services/runtimeConfig";
import type { PlanDiscipline } from "./usePlanModel";

/** @sync-with orider-g1-web functions daily_activities schemaVersion */
export const DAILY_ACTIVITIES_SCHEMA_VERSION = 1;

export interface DailyActivity {
  id: string;
  startTime: number | null;
  /** m */
  distance: number | null;
  movingSec: number | null;
  tss: number | null;
  estimated: boolean;
  source: string | null;
}

export interface DailyActivityDay {
  tss: number | null;
  tssEstimated: boolean;
  activities: DailyActivity[];
}

export interface TssSum {
  /** 반올림한 합계. 활동은 있는데 TSS 를 아는 날이 하나도 없으면 null. */
  value: number | null;
  estimated: boolean;
}

export interface PlanDailyActivities {
  discipline: PlanDiscipline;
  /** 문서의 사용자 시간대(IANA). 아직 문서가 없으면 null. */
  timezone: string | null;
  /** 사용자 시간대 기준 오늘(달력 날짜). 시간대를 모르면 KST. */
  todayKey: string;
  /** 달력 날짜 → 그날 활동. 활동 없는 날은 키가 없다. */
  days: ReadonlyMap<string, DailyActivityDay>;
  /** 구독 중인 달 가운데 아직 첫 응답·생성 요청을 기다리는 달이 있다. */
  loading: boolean;
  /** 확인할 수 없는 달(YYYY-MM): 읽기·생성 실패 또는 서버 허용 범위보다 오래된 계획 달. */
  failedMonths: ReadonlySet<string>;
  /** 계획 첫날~오늘(계획 마지막 날까지) 실제 TSS 합계. 로딩 중이거나 확인 불가 달이 있으면 null. */
  total: TssSum | null;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY_DAYS: ReadonlyMap<string, DailyActivityDay> = new Map();

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function millis(value: unknown): number | null {
  const direct = finite(value);
  if (direct != null) return direct;
  if (value && typeof value === "object" && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return finite((value as { toMillis: () => unknown }).toMillis());
  }
  return null;
}

/** 서버 문서의 `days` 맵을 화면용으로 읽는다. 모양이 틀린 항목은 버린다(값을 채우지 않는다). */
export function parseDailyActivityDays(raw: unknown): Map<string, DailyActivityDay> {
  const days = new Map<string, DailyActivityDay>();
  if (!raw || typeof raw !== "object") return days;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!DATE_KEY.test(key) || !value || typeof value !== "object") continue;
    const day = value as Record<string, unknown>;
    const activities = Array.isArray(day.activities) ? day.activities.flatMap((item): DailyActivity[] => {
      if (!item || typeof item !== "object") return [];
      const activity = item as Record<string, unknown>;
      if (typeof activity.id !== "string" || activity.id === "") return [];
      return [{
        id: activity.id,
        startTime: millis(activity.startTime),
        distance: finite(activity.distance),
        movingSec: finite(activity.movingSec),
        tss: finite(activity.tss),
        estimated: activity.estimated === true,
        source: typeof activity.source === "string" ? activity.source : null,
      }];
    }) : [];
    days.set(key, { tss: finite(day.tss), tssEstimated: day.tssEstimated === true, activities });
  }
  return days;
}

/** YYYY-MM 문자열을 delta 달만큼 옮긴다. */
function shiftMonth(month: string, delta: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function planRange(weeks: readonly PlanWeek[]): { first: string; last: string } | null {
  let first: string | null = null;
  let last: string | null = null;
  for (const week of weeks) for (const day of week.days) {
    const key = planDayKey(day.date);
    if (!key) continue;
    if (first == null || key < first) first = key;
    if (last == null || key > last) last = key;
  }
  return first && last ? { first, last } : null;
}

/** ensureDailyActivities 가 받는 달 범위: 사용자 시간대 기준 [이번 달-12, 이번 달]. */
export const ENSURE_MONTH_WINDOW = 12;
/** ensureDailyActivities 한 번 호출에 담는 최대 달 수. */
export const MAX_ENSURE_MONTHS_PER_CALL = 6;
/** basis_changed 재요청 포함 같은 달 최대 호출 수. */
export const MAX_ENSURE_ATTEMPTS = 2;

/**
 * 계획 첫날~min(계획 마지막 날, 오늘) 이 걸친 달을 구독할 달(서버 허용 범위 [이번 달-12, 이번 달],
 * 최대 13개)과 그보다 오래돼 확인할 수 없는 달로 나눈다.
 */
export function planActivityMonths(weeks: readonly PlanWeek[], todayKey: string): { months: string[]; uncovered: string[] } {
  const range = planRange(weeks);
  if (!range) return { months: [], uncovered: [] };
  const end = range.last < todayKey ? range.last : todayKey;
  if (range.first > end) return { months: [], uncovered: [] };
  const oldest = shiftMonth(todayKey.slice(0, 7), -ENSURE_MONTH_WINDOW);
  const months: string[] = [];
  const uncovered: string[] = [];
  for (let month = range.first.slice(0, 7); month <= end.slice(0, 7); month = shiftMonth(month, 1)) {
    (month < oldest ? uncovered : months).push(month);
  }
  return { months, uncovered };
}

/**
 * 주어진 달력 날짜들의 실제 TSS 합계(서버 일별 값 그대로 더한다).
 * 활동은 있는데 TSS 를 모르는 날이 빠지면 합계가 실제보다 작으므로 estimated 로 표시한다.
 */
export function sumDailyTss(days: ReadonlyMap<string, DailyActivityDay>, keys: Iterable<string>): TssSum {
  let sum = 0;
  let known = 0;
  let unknown = 0;
  let estimated = false;
  for (const key of keys) {
    const day = days.get(key);
    if (!day) continue;
    if (day.tss == null) {
      if (day.activities.length > 0) unknown++;
      continue;
    }
    sum += day.tss;
    known++;
    estimated ||= day.tssEstimated;
  }
  if (known === 0) return { value: unknown > 0 ? null : 0, estimated: false };
  return { value: Math.round(sum), estimated: estimated || unknown > 0 };
}

/** from~to(포함) 달력 날짜 범위의 실제 TSS 합계. */
export function sumDailyTssInRange(days: ReadonlyMap<string, DailyActivityDay>, from: string, to: string): TssSum {
  return sumDailyTss(days, [...days.keys()].filter(key => key >= from && key <= to));
}

/** 이 날짜 칸의 활동을 확인하지 못했는가(그 달 읽기 실패 또는 확인 범위 밖 + 오늘까지). */
export function dailyActivitiesUnavailable(actual: PlanDailyActivities, dateKey: string): boolean {
  return dateKey <= actual.todayKey && actual.failedMonths.has(dateKey.slice(0, 7));
}

/**
 * "한 날" 판단에 쓸 만큼 문서를 읽었는가. 비활성(null·미지정)이면 활동 표시가 없는 화면으로 보고 true.
 * 계획 화면 데스크톱·모바일이 같은 기준을 쓴다.
 */
export function dailyActivitiesSettled(actual: PlanDailyActivities | null | undefined): boolean {
  return actual == null || !actual.loading;
}

/** 다음 운동 카드를 보여도 되는가: 문서를 읽었고 오늘 날짜를 확인할 수 있다. */
export function canShowNextWorkout(actual: PlanDailyActivities | null | undefined, todayKey: string): boolean {
  return dailyActivitiesSettled(actual) && !(actual != null && dailyActivitiesUnavailable(actual, todayKey));
}

export function localDateKey(epochMs: number, timeZone: string | null): string | null {
  if (!timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(epochMs));
    const part = (type: string) => parts.find(item => item.type === type)?.value;
    const key = `${part("year")}-${part("month")}-${part("day")}`;
    return DATE_KEY.test(key) ? key : null;
  } catch {
    return null;
  }
}

/** 서버가 받는 달만 남긴다(사용자 시간대 오늘 기준). */
export function ensurableMonths(months: readonly string[], userTodayKey: string): string[] {
  const current = userTodayKey.slice(0, 7);
  const oldest = shiftMonth(current, -ENSURE_MONTH_WINDOW);
  return months.filter(month => month >= oldest && month <= current);
}

/** 어떤 시간대(UTC-12~UTC+14)여도 서버가 받는 달만 남긴다 — invalid-argument 재시도용. */
export function ensurableMonthsInAnyTimeZone(months: readonly string[], epochMs: number): string[] {
  const earliest = localDateKey(epochMs, "Etc/GMT+12");
  const latest = localDateKey(epochMs, "Etc/GMT-14");
  if (!earliest || !latest) return [];
  return ensurableMonths(ensurableMonths(months, earliest), latest);
}

interface EnsureResponse {
  timezone: string | null;
  basisChanged: string[];
}

/** 응답의 사용자 시간대와 basis_changed 인 달. */
export function readEnsureResponse(data: unknown): EnsureResponse {
  const record = data && typeof data === "object" ? data as { timezone?: unknown; months?: unknown } : {};
  const months = Array.isArray(record.months) ? record.months : [];
  return {
    timezone: typeof record.timezone === "string" && record.timezone !== "" ? record.timezone : null,
    basisChanged: months.flatMap(item => item && typeof item === "object"
      && (item as { status?: unknown }).status === "basis_changed"
      && typeof (item as { month?: unknown }).month === "string" ? [(item as { month: string }).month] : []),
  };
}

function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function isInvalidArgument(error: unknown): boolean {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : null;
  return code === "functions/invalid-argument" || code === "invalid-argument";
}

/** ensureDailyActivities 배포 리전. */
export const DAILY_ACTIVITIES_REGION = "asia-northeast3";
const emulatorConnected = new WeakSet<Functions>();

/**
 * ensureDailyActivities 는 asia-northeast3 에 있다. 주입된(임베드 포함) functions 의 앱에서 그 리전
 * 인스턴스를 얻는다. stage 는 기본 인스턴스가 이미 그 리전이고, 에뮬레이터는 accountDeletion 관례를 따른다.
 */
export function dailyActivitiesFunctions(base: Functions): Functions {
  if (getRuntimeConfig().appEnvironment === "stage") return base;
  const regional = getFunctions(base.app, DAILY_ACTIVITIES_REGION);
  if (isEmulatorRuntime() && regional !== base && !emulatorConnected.has(regional)) {
    connectFunctionsEmulator(regional, "localhost", 5001);
    emulatorConnected.add(regional);
  }
  return regional;
}

// 세션 동안 같은 (uid, 종목, 달) 생성 요청을 한 번만 보낸다. 값은 성공 여부.
// 그 달 문서가 완성(complete·스키마 일치)으로 보이면 항목을 지워, 나중에 서버가 다시 무효화하면 다시 부른다.
const ensureRequests = new Map<string, Promise<boolean>>();

/** 테스트 격리용. */
export function __resetDailyActivitiesEnsureForTests(): void {
  ensureRequests.clear();
}

interface MonthState {
  received: boolean;
  needsEnsure: boolean;
  ensured: boolean;
  failed: boolean;
  days: ReadonlyMap<string, DailyActivityDay>;
  timezone: string | null;
}

const INITIAL_MONTH: MonthState = { received: false, needsEnsure: false, ensured: false, failed: false, days: EMPTY_DAYS, timezone: null };

function monthStatus(month: MonthState | undefined): "loading" | "ready" | "error" {
  if (!month) return "loading";
  if (month.failed) return "error";
  if (!month.received || (month.needsEnsure && !month.ensured)) return "loading";
  return "ready";
}

/** 계획 진행률(%) = 실제 부하(계획 첫날~오늘) ÷ 계획 TSS. 계획 화면·목표 화면 공용. 모르면 null. */
export function planActualProgressPct(totalTSS: number, actual: PlanDailyActivities | null | undefined): number | null {
  const value = actual?.total?.value;
  return totalTSS > 0 && value != null ? Math.round((value / totalTSS) * 100) : null;
}

/** 다음 정각(최대 1시간)까지 — 어느 시간대의 자정이든 1시간 안에 "오늘"이 바뀐다. */
function msUntilNextHour(now: number): number {
  return Math.max(1_000, 3_600_000 - (now % 3_600_000));
}

interface Options {
  uid: string | null | undefined;
  discipline: PlanDiscipline;
  weeks: readonly PlanWeek[];
  enabled: boolean;
}

/** 계획 범위의 일별 활동 문서를 구독한다. 비활성(목표 없음·종목 불일치·비로그인)이면 null. */
export function usePlanDailyActivities({ uid, discipline, weeks, enabled }: Options): PlanDailyActivities | null {
  const { firestore, functions } = useFirebaseServices();
  // 자정을 넘기면 "오늘"·구독 달·합계 끝 날짜가 바뀌도록 정각마다 다시 그린다.
  const [clock, setClock] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => setClock(value => value + 1), msUntilNextHour(Date.now()));
    return () => clearTimeout(timer);
  }, [clock, enabled]);
  const kstToday = planDayKey(Date.now());
  // 사용자 시간대: 문서에서 알게 되면 그것, 그 전에는 브라우저 시간대. 구독 키가 바뀌어도 유지한다.
  const [userTimeZone, setUserTimeZone] = useState<string | null>(browserTimeZone);
  const userToday = localDateKey(Date.now(), userTimeZone) ?? kstToday;
  // 구독 끝 달 = max(KST 기준 오늘, 사용자 시간대 기준 오늘) 이 속한 달.
  const subscriptionToday = userToday > kstToday ? userToday : kstToday;
  const { months, uncovered } = useMemo(() => planActivityMonths(weeks, subscriptionToday), [weeks, subscriptionToday]);
  const range = useMemo(() => planRange(weeks), [weeks]);
  const monthsKey = months.join(",");
  const subscriptionKey = enabled && uid ? `${uid}|${discipline}|${monthsKey}` : "";
  const [state, setState] = useState<{ key: string; months: Record<string, MonthState> }>({ key: "", months: {} });

  useEffect(() => {
    if (!enabled || !uid || !monthsKey) return;
    const key = `${uid}|${discipline}|${monthsKey}`;
    const monthList = monthsKey.split(",");
    let cancelled = false;
    // 달 → 지금 기다리는 생성 요청. 문서가 완성되면 지운다.
    const awaiting = new Map<string, Promise<boolean>>();
    // 생성 요청 대기열. 세션 기억(ensureRequests)에는 대기열에 넣는 순간 등록해, 같은 틱에 같은 달을
    // 구독한 다른 화면(계획·목표 화면 동시 마운트, StrictMode 재마운트)이 중복 호출하지 않게 한다.
    const pending: Array<{ month: string; resolve: (ok: boolean) => void }> = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    // 허용 달 범위 계산용 사용자 시간대. 문서·응답에서 알게 되기 전에는 브라우저 시간대로 근사한다.
    let knownTimezone: string | null = null;
    const requestKey = (month: string) => `${uid}|${discipline}|${month}`;

    const update = (month: string, patch: Partial<MonthState>) => {
      if (cancelled) return;
      setState(prev => {
        const base = prev.key === key ? prev.months : {};
        return { key, months: { ...base, [month]: { ...(base[month] ?? INITIAL_MONTH), ...patch } } };
      });
    };
    const settle = (month: string, request: Promise<boolean>) => {
      if (awaiting.has(month)) return;
      awaiting.set(month, request);
      void request.then(ok => {
        // 기다리는 사이 문서가 완성돼 대기가 풀렸거나 새 요청으로 바뀌었으면 반영하지 않는다.
        if (awaiting.get(month) !== request) return;
        update(month, ok ? { ensured: true } : { failed: true });
      });
    };
    const ensure = httpsCallable<{ discipline: PlanDiscipline; months: string[] }, unknown>(dailyActivitiesFunctions(functions), "ensureDailyActivities");
    /** 한 묶음(≤6개월): basis_changed 는 같은 달 최대 2회, invalid-argument 는 범위를 좁혀 1회 재시도. */
    const ensureChunk = async (chunk: string[]): Promise<boolean> => {
      let targets = chunk;
      let narrowed = false;
      for (let attempt = 1; attempt <= MAX_ENSURE_ATTEMPTS && targets.length > 0;) {
        try {
          const result = await ensure({ discipline, months: targets });
          const response = readEnsureResponse(result.data);
          if (response.timezone) knownTimezone = response.timezone;
          debugLog("PlanPage.ensureDailyActivities", { discipline, months: targets, attempt, result: result.data });
          const requested = targets;
          targets = response.basisChanged.filter(month => requested.includes(month));
          attempt++;
        } catch (error) {
          const safe = ensurableMonthsInAnyTimeZone(targets, Date.now());
          if (!narrowed && isInvalidArgument(error) && safe.length < targets.length) {
            narrowed = true;
            debugLog("PlanPage.ensureDailyActivities.narrow", { discipline, months: targets, retry: safe });
            targets = safe;
            continue;
          }
          logClientError("PlanPage.ensureDailyActivities", error, { discipline, months: targets });
          return false;
        }
      }
      // 두 번째도 basis_changed 면 더 부르지 않는다. 문서 갱신은 구독이 받는다.
      return true;
    };
    const flush = () => {
      timer = null;
      const pendingBatch = pending.splice(0);
      if (pendingBatch.length === 0) return;
      const resolvers = new Map(pendingBatch.map(item => [item.month, item.resolve]));
      const months = [...resolvers.keys()];
      const requestToday = localDateKey(Date.now(), knownTimezone ?? browserTimeZone()) ?? planDayKey(Date.now());
      const batch = ensurableMonths(months, requestToday);
      // 서버가 받지 않는 달(invalid-argument)은 요청하지 않고 있는 문서 그대로 둔다.
      const outOfRange = months.filter(month => !batch.includes(month));
      if (outOfRange.length > 0) debugLog("PlanPage.ensureDailyActivities.skip", { discipline, months: outOfRange, requestToday });
      // 사용자 시간대로 아직 오지 않은 달은 빈 달, 허용 범위보다 오래된 달은 확인 불가로 둔다.
      for (const month of outOfRange) resolvers.get(month)?.(month > requestToday.slice(0, 7));
      for (let index = 0; index < batch.length; index += MAX_ENSURE_MONTHS_PER_CALL) {
        const chunk = batch.slice(index, index + MAX_ENSURE_MONTHS_PER_CALL);
        void ensureChunk(chunk).then(ok => { for (const month of chunk) resolvers.get(month)?.(ok); });
      }
    };
    const enqueue = (month: string) => {
      let resolve: (ok: boolean) => void = () => undefined;
      const deferred = new Promise<boolean>(done => { resolve = done; });
      const request = deferred.then(ok => {
        if (!ok && ensureRequests.get(requestKey(month)) === request) ensureRequests.delete(requestKey(month));
        return ok;
      });
      ensureRequests.set(requestKey(month), request);
      settle(month, request);
      pending.push({ month, resolve });
      // 같은 틱에 도착하는 여러 달의 첫 응답을 한 번의 호출로 묶는다.
      timer ??= setTimeout(flush, 0);
    };

    const unsubscribes = monthList.map(month => onSnapshot(
      doc(firestore, "users", uid, "daily_activities", `${discipline}_${month}`),
      snapshot => {
        const data = snapshot.exists() ? snapshot.data() as Record<string, unknown> : null;
        const needsEnsure = !data || data.complete !== true || data.schemaVersion !== DAILY_ACTIVITIES_SCHEMA_VERSION;
        const timezone = typeof data?.timezone === "string" && data.timezone !== "" ? data.timezone : null;
        if (timezone) knownTimezone = timezone;
        const days = data ? parseDailyActivityDays(data.days) : EMPTY_DAYS;
        if (!needsEnsure) {
          // 완성 문서: 실패·대기 상태를 풀고 세션 기억도 지운다. 나중에 무효화되면 다시 부른다.
          ensureRequests.delete(requestKey(month));
          awaiting.delete(month);
          update(month, { received: true, needsEnsure: false, ensured: false, failed: false, days, timezone });
          return;
        }
        update(month, { received: true, needsEnsure: true, days, timezone });
        const existing = ensureRequests.get(requestKey(month));
        if (existing) {
          settle(month, existing);
          return;
        }
        if (!awaiting.has(month)) enqueue(month);
      },
      error => {
        logClientError("PlanPage.dailyActivities", error, { discipline, month });
        update(month, { failed: true });
      },
    ));

    return () => {
      cancelled = true;
      // 대기열은 취소하지 않는다: 이미 세션 기억에 올린 요청을 다른 화면이 기다릴 수 있다(화면 갱신은 cancelled 로 막힌다).
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [discipline, enabled, firestore, functions, monthsKey, uid]);

  const monthStates = state.key === subscriptionKey ? state.months : null;
  const result = useMemo((): PlanDailyActivities | null => {
    if (!subscriptionKey) return null;
    const days = new Map<string, DailyActivityDay>();
    // 확인 불가 달: 읽기·생성 실패 + 서버 허용 범위보다 오래된 계획 달.
    const failedMonths = new Set<string>(uncovered);
    let loading = false;
    let timezone: string | null = null;
    for (const month of months) {
      const current = monthStates?.[month];
      const status = monthStatus(current);
      if (status === "loading") loading = true;
      if (status === "error") failedMonths.add(month);
      if (current) {
        timezone ??= current.timezone;
        for (const [key, day] of current.days) days.set(key, day);
      }
    }
    const todayKey = localDateKey(Date.now(), timezone) ?? kstToday;
    // 확인하지 못한 달이 하나라도 있으면 합계를 정상처럼 보이지 않게 비운다.
    let total: TssSum | null = null;
    if (!loading && failedMonths.size === 0) {
      total = range ? sumDailyTssInRange(days, range.first, range.last < todayKey ? range.last : todayKey) : { value: 0, estimated: false };
    }
    return { discipline, timezone, todayKey, days, loading, failedMonths, total };
    // clock: 정각마다 todayKey(Date.now 기반)를 다시 계산한다.
  }, [clock, discipline, kstToday, monthStates, months, range, subscriptionKey, uncovered]);
  const documentTimeZone = result?.timezone ?? null;
  useEffect(() => {
    if (documentTimeZone && documentTimeZone !== userTimeZone) setUserTimeZone(documentTimeZone);
  }, [documentTimeZone, userTimeZone]);
  return result;
}
