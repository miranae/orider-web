import type { TFunction } from "i18next";

import type {
  Run30ChangeAction,
  Run30Program,
  Run30Session,
  Run30TodayAction,
} from "./run30Api";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const KO_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const EN_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function parseLocalDate(localDate: string): { year: number; month: number; day: number; weekday: number } | null {
  const match = DATE.exec(localDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  return { year, month, day, weekday: calendar.getUTCDay() };
}

/** 서버 현지 날짜(YYYY-MM-DD)를 시간대 변환 없이 읽는다. 예: "9월 29일 (화)". */
export function run30DateLabel(localDate: string, language: string): string {
  const parsed = parseLocalDate(localDate);
  if (!parsed) return localDate;
  if (language.startsWith("en")) {
    return `${EN_WEEKDAYS[parsed.weekday]}, ${EN_MONTHS[parsed.month - 1]} ${parsed.day}`;
  }
  return `${parsed.month}월 ${parsed.day}일 (${KO_WEEKDAYS[parsed.weekday]})`;
}

export function run30Duration(seconds: number | null | undefined, t: TFunction): string {
  const safe = Math.max(0, Math.round(seconds ?? 0));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  if (minutes === 0) return t("run30.duration.seconds", { seconds: remainder });
  if (remainder === 0) return t("run30.duration.minutes", { minutes });
  return t("run30.duration.minutesSeconds", { minutes, seconds: remainder });
}

const KNOWN_STATUSES = new Set(["planned", "missed", "completed", "skipped", "partial", "abandoned"]);

export function run30StatusLabel(status: string, t: TFunction): string {
  return KNOWN_STATUSES.has(status) ? t(`run30.status.${status}`) : t("run30.status.unknown");
}

export type Run30StatusTone = "default" | "accent" | "success" | "warning" | "danger";

export function run30StatusTone(status: string): Run30StatusTone {
  if (status === "completed") return "success";
  if (status === "missed" || status === "partial" || status === "abandoned") return "warning";
  if (status === "planned") return "accent";
  return "default";
}

/** 브라우저 기준 오늘(YYYY-MM-DD). 최종 판정은 서버가 소유자 시간대로 다시 한다. */
export function localToday(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addLocalDays(localDate: string, days: number): string {
  const parsed = parseLocalDate(localDate);
  if (!parsed) return localDate;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return date.toISOString().slice(0, 10);
}

/** 등록 시작일 후보: 오늘부터 14일 뒤까지(서버 허용 범위와 동일). */
export function enrollmentDateOptions(today: string): string[] {
  return Array.from({ length: 15 }, (_, offset) => addLocalDays(today, offset));
}

const MAX_POSTPONE_SPAN_DAYS = 7;

/**
 * 옮기기 후보: 해당 회차 다음 날(또는 오늘)부터 다음 회차 전날까지 회차가 없는 날.
 * 휴식일 여부·연결 기록 등 나머지 조건은 서버 미리보기가 검증한다.
 */
export function postponeCandidates(program: Run30Program, stage: number, today: string): string[] {
  const sorted = [...program.sessions].sort((a, b) => a.stage - b.stage);
  const source = sorted.find((session) => session.stage === stage);
  if (!source) return [];
  const following = sorted.find((session) => session.stage > stage);
  const occupied = new Set(sorted.map((session) => session.localDate));
  const start = source.localDate >= today ? addLocalDays(source.localDate, 1) : today;
  const candidates: string[] = [];
  for (let offset = 0; offset < MAX_POSTPONE_SPAN_DAYS; offset += 1) {
    const date = addLocalDays(start, offset);
    if (following && date >= following.localDate) break;
    if (!occupied.has(date)) candidates.push(date);
  }
  return candidates;
}

const CHANGE_LOCKED_STATUSES = new Set(["completed", "skipped", "partial", "abandoned"]);

/** 서버 규칙 중 화면에서 명백히 거절될 동작만 숨긴다. */
export function availableRun30Actions(program: Run30Program, session: Run30Session | null, today: string): {
  retry: boolean;
  continue: boolean;
  skip: boolean;
  postpone: boolean;
  postponeDates: string[];
} {
  if (!session || program.next?.stage !== session.stage) {
    return { retry: false, continue: false, skip: false, postpone: false, postponeDates: [] };
  }
  const acknowledged = program.history.some((entry) => entry.action === "continue" && entry.stage === session.stage);
  const status = session.status;
  const postponeDates = CHANGE_LOCKED_STATUSES.has(status) ? [] : postponeCandidates(program, session.stage, today);
  return {
    retry: ["missed", "partial", "abandoned"].includes(status) && program.retryDates.length > 0,
    continue: (status === "partial" || status === "abandoned") && !acknowledged,
    skip: !CHANGE_LOCKED_STATUSES.has(status),
    postpone: postponeDates.length > 0,
    postponeDates,
  };
}

export type Run30TodayKind = Run30TodayAction | "finished";

export interface Run30ViewModel {
  completedStages: number;
  totalStages: number;
  progress: number;
  todayKind: Run30TodayKind;
  next: Run30Session | null;
  pastSessions: Run30Session[];
  upcomingSessions: Run30Session[];
  retryCountForNext: number;
}

export function buildRun30ViewModel(program: Run30Program): Run30ViewModel {
  const sessions = [...program.sessions].sort((a, b) => a.stage - b.stage);
  const completedStages = sessions.filter((session) => session.status === "completed").length;
  const totalStages = program.totalStages > 0 ? program.totalStages : sessions.length;
  const next = program.next
    ? sessions.find((session) => session.stage === program.next!.stage) ?? program.next
    : null;
  const todayKind: Run30TodayKind = next ? (program.todayAction ?? "rest") : "finished";
  return {
    completedStages,
    totalStages,
    progress: totalStages > 0 ? completedStages / totalStages : 0,
    todayKind,
    next,
    pastSessions: next ? sessions.filter((session) => session.stage < next.stage) : sessions,
    upcomingSessions: next ? sessions.filter((session) => session.stage > next.stage) : [],
    retryCountForNext: next
      ? program.history.filter((entry) => entry.action === "retry" && entry.stage === next.stage).length
      : 0,
  };
}

export function run30ChangeConfirmLabel(action: Run30ChangeAction, t: TFunction): string {
  return t(`run30.change.confirm.${action}`);
}
