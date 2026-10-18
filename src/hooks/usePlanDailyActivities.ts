/**
 * 계획 화면 날짜 칸에 붙이는 "그날 실제로 한 활동" — 서버 일별 활동 문서를 읽기만 한다.
 *
 * 문서: `users/{uid}/daily_activities/{discipline}_{YYYY-MM}` (본인 read 전용, 서버 write).
 * 같은 주행 중복 제거·TSS 산출은 서버가 끝낸 값이다. 웹은 다시 계산하지 않는다(지표 정본 원칙).
 *
 * 읽기 비용: 계획 범위(첫날~오늘)의 월 문서만 onSnapshot 으로 구독한다(보통 2~4개, 최대 6개).
 * 활동이 추가·삭제되면 서버가 문서를 갱신하므로 재조회·캐시 로직은 두지 않는다.
 * 문서가 없거나 미완성(complete!==true)·스키마 불일치일 때만 `ensureDailyActivities` 를 부르고,
 * 같은 세션에서 같은 달은 한 번만 부른다(성공한 요청은 기억, 실패하면 다음 마운트에서 다시 시도).
 *
 * 날짜 매칭: 문서의 날짜 키는 사용자 시간대(timezone 필드) 기준 로컬 날짜다. 계획 칸 날짜는
 * PlanDay.date(KST 00:00 ms)를 planDayKey 로 바꾼 달력 날짜 문자열(YYYY-MM-DD)이다. 둘을 같은
 * "달력 날짜"로 보고 문자열 그대로 맞춘다 — 사용자 시간대에서의 하루 = 그 달력 날짜라는 가정이다.
 * KST 가 아닌 사용자는 계획 칸 경계(KST)와 문서 경계(사용자 시간대)가 다르지만, 칸이 뜻하는
 * 달력 날짜에 사용자가 그 시간대에서 한 활동을 붙이는 것이 의도다. (miranae/orider-g1-web#3252)
 */
import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { PlanWeek } from "@shared/types/goal";
import { planDayKey } from "@shared/training/planDate";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { debugLog, logClientError } from "../services/errorLogger";
import type { PlanDiscipline } from "./usePlanModel";

/** @sync-with orider-g1-web functions daily_activities schemaVersion */
export const DAILY_ACTIVITIES_SCHEMA_VERSION = 1;
/** ensureDailyActivities 가 한 번에 받는 최대 달 수이자 구독 상한. */
export const MAX_DAILY_ACTIVITY_MONTHS = 6;

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
  /** 읽기·생성 요청이 실패한 달(YYYY-MM). */
  failedMonths: ReadonlySet<string>;
  /** 계획 첫날~오늘(계획 마지막 날까지) 실제 TSS 합계. 로딩·실패 중에는 null. */
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

/** YYYY-MM 문자열 다음 달. */
function nextMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  return index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, "0")}`;
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

/** 계획 첫날~min(계획 마지막 날, 오늘) 이 걸친 달. 최근 MAX_DAILY_ACTIVITY_MONTHS 개만. */
export function planActivityMonths(weeks: readonly PlanWeek[], todayKey: string): string[] {
  const range = planRange(weeks);
  if (!range) return [];
  const end = range.last < todayKey ? range.last : todayKey;
  if (range.first > end) return [];
  const months: string[] = [];
  for (let month = range.first.slice(0, 7); month <= end.slice(0, 7); month = nextMonth(month)) months.push(month);
  return months.slice(-MAX_DAILY_ACTIVITY_MONTHS);
}

/** 주어진 달력 날짜들의 실제 TSS 합계(서버 일별 값 그대로 더한다). */
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
  return { value: known > 0 ? Math.round(sum) : unknown > 0 ? null : 0, estimated };
}

/** from~to(포함) 달력 날짜 범위의 실제 TSS 합계. */
export function sumDailyTssInRange(days: ReadonlyMap<string, DailyActivityDay>, from: string, to: string): TssSum {
  return sumDailyTss(days, [...days.keys()].filter(key => key >= from && key <= to));
}

/** 이 날짜 칸의 활동을 확인하지 못했는가(그 달 읽기 실패 + 오늘까지). */
export function dailyActivitiesUnavailable(actual: PlanDailyActivities, dateKey: string): boolean {
  return dateKey <= actual.todayKey && actual.failedMonths.has(dateKey.slice(0, 7));
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

// 세션 동안 같은 (uid, 종목, 달) 생성 요청을 한 번만 보낸다. 값은 성공 여부.
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

interface Options {
  uid: string | null | undefined;
  discipline: PlanDiscipline;
  weeks: readonly PlanWeek[];
  enabled: boolean;
}

/** 계획 범위의 일별 활동 문서를 구독한다. 비활성(목표 없음·종목 불일치·비로그인)이면 null. */
export function usePlanDailyActivities({ uid, discipline, weeks, enabled }: Options): PlanDailyActivities | null {
  const { firestore, functions } = useFirebaseServices();
  const kstToday = planDayKey(Date.now());
  const months = useMemo(() => planActivityMonths(weeks, kstToday), [weeks, kstToday]);
  const range = useMemo(() => planRange(weeks), [weeks]);
  const monthsKey = months.join(",");
  const subscriptionKey = enabled && uid ? `${uid}|${discipline}|${monthsKey}` : "";
  const [state, setState] = useState<{ key: string; months: Record<string, MonthState> }>({ key: "", months: {} });

  useEffect(() => {
    if (!enabled || !uid || !monthsKey) return;
    const key = `${uid}|${discipline}|${monthsKey}`;
    const monthList = monthsKey.split(",");
    let cancelled = false;
    const awaiting = new Set<string>();
    const pending: string[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;

    const update = (month: string, patch: Partial<MonthState>) => {
      if (cancelled) return;
      setState(prev => {
        const base = prev.key === key ? prev.months : {};
        return { key, months: { ...base, [month]: { ...(base[month] ?? INITIAL_MONTH), ...patch } } };
      });
    };
    const settle = (month: string, request: Promise<boolean>) => {
      if (awaiting.has(month)) return;
      awaiting.add(month);
      void request.then(ok => update(month, ok ? { ensured: true } : { failed: true }));
    };
    const flush = () => {
      timer = null;
      const batch = pending.splice(0);
      if (batch.length === 0) return;
      const call = httpsCallable<{ discipline: PlanDiscipline; months: string[] }, unknown>(functions, "ensureDailyActivities")({ discipline, months: batch })
        .then((result) => {
          debugLog("PlanPage.ensureDailyActivities", { discipline, months: batch, result: result.data });
          return true;
        }, (error: unknown) => {
          logClientError("PlanPage.ensureDailyActivities", error, { discipline, months: batch });
          return false;
        });
      for (const month of batch) {
        const requestKey = `${uid}|${discipline}|${month}`;
        const request = call.then(ok => {
          if (!ok) ensureRequests.delete(requestKey);
          return ok;
        });
        ensureRequests.set(requestKey, request);
        settle(month, request);
      }
    };

    const unsubscribes = monthList.map(month => onSnapshot(
      doc(firestore, "users", uid, "daily_activities", `${discipline}_${month}`),
      snapshot => {
        const data = snapshot.exists() ? snapshot.data() as Record<string, unknown> : null;
        const needsEnsure = !data || data.complete !== true || data.schemaVersion !== DAILY_ACTIVITIES_SCHEMA_VERSION;
        update(month, {
          received: true,
          needsEnsure,
          days: data ? parseDailyActivityDays(data.days) : EMPTY_DAYS,
          timezone: typeof data?.timezone === "string" && data.timezone !== "" ? data.timezone : null,
        });
        if (!needsEnsure) return;
        const existing = ensureRequests.get(`${uid}|${discipline}|${month}`);
        if (existing) {
          settle(month, existing);
          return;
        }
        if (!pending.includes(month) && !awaiting.has(month)) pending.push(month);
        // 같은 틱에 도착하는 여러 달의 첫 응답을 한 번의 호출로 묶는다.
        timer ??= setTimeout(flush, 0);
      },
      error => {
        logClientError("PlanPage.dailyActivities", error, { discipline, month });
        update(month, { failed: true });
      },
    ));

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [discipline, enabled, firestore, functions, monthsKey, uid]);

  const monthStates = state.key === subscriptionKey ? state.months : null;
  return useMemo(() => {
    if (!subscriptionKey) return null;
    const days = new Map<string, DailyActivityDay>();
    const failedMonths = new Set<string>();
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
    let total: TssSum | null = null;
    if (!loading && failedMonths.size === 0) {
      total = range ? sumDailyTssInRange(days, range.first, range.last < todayKey ? range.last : todayKey) : { value: 0, estimated: false };
    }
    return { discipline, timezone, todayKey, days, loading, failedMonths, total };
  }, [discipline, kstToday, monthStates, months, range, subscriptionKey]);
}
