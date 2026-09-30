import { httpsCallable, type Functions } from "firebase/functions";

/**
 * 30분 달리기 입문(Run30) 프로그램 callable 계약.
 *
 * 일정 규칙(건너뛰기·옮기기·재도전·계속)은 서버가 정본이다. 클라이언트는 명백히 불가능한
 * 동작만 숨기고, 나머지 판정과 오류 문구는 서버 응답을 그대로 보여 준다.
 */
export const RUN30_TEMPLATE = "run-30-intro-v1" as const;

export type Run30SessionStatus =
  | "planned"
  | "missed"
  | "completed"
  | "skipped"
  | "partial"
  | "abandoned"
  | (string & {});

export interface Run30Segment {
  stepId: string;
  label: string;
  durationSec: number | null;
  targetType: string;
}

export interface Run30Session {
  stage: number;
  localDate: string;
  status: Run30SessionStatus;
  scheduledSessionId?: string;
  previousAttemptSessionIds: string[];
  workoutName?: string | null;
  durationSec: number;
  segments: Run30Segment[];
}

export type Run30ChangeAction = "skip" | "postpone" | "retry" | "continue";

export interface Run30HistoryEntry {
  revision: number;
  action: "enroll" | Run30ChangeAction;
  stage: number | null;
  at: number;
  fromLocalDate?: string;
  toLocalDate?: string;
}

export interface Run30WorkoutDecision {
  status: "maintain" | "hold";
  reasonCode: string;
  reason: string;
  provenance: string;
  source?: unknown;
  freeRunSource?: unknown;
}

export type Run30TodayAction = "start" | "rest" | "decide" | "hold";

export interface Run30Program {
  goalId: string;
  goalStatus?: string;
  template: typeof RUN30_TEMPLATE;
  revision: number;
  startDate: string;
  history: Run30HistoryEntry[];
  postponements?: unknown[];
  canRetry?: boolean;
  retryDates: string[];
  totalStages: number;
  remainingStages: number;
  next: Run30Session | null;
  sessions: Run30Session[];
  safetyGuidance: string;
  nextWorkoutDecision: Run30WorkoutDecision | null;
  todayAction: Run30TodayAction | null;
}

export interface Run30EnrollmentPreview {
  startDate: string;
  template: typeof RUN30_TEMPLATE;
  totalStages: number;
  activeGoal: { goalId: string; title: string; revision: string | number } | null;
  replacementRequired: boolean;
  safetyGuidance: string;
  startDateAdvice: {
    requestedStartDate: string;
    effectiveStartDate: string;
    reason: "late-today";
  } | null;
}

export interface Run30EnrollRequest {
  startDate: string;
  enrollmentKey: string;
  replaceGoalId?: string;
  replaceGoalRevision?: string | number;
  replacementConfirmed?: boolean;
}

export interface Run30EnrollResult {
  goalId: string;
  template: typeof RUN30_TEMPLATE;
  revision: number;
  alreadyEnrolled: boolean;
  startDate: string;
}

export interface Run30ChangeRequest {
  goalId: string;
  expectedRevision: number;
  action: Run30ChangeAction;
  stage: number;
  toLocalDate?: string;
}

export interface Run30ChangePreview extends Omit<Run30ChangeRequest, "toLocalDate"> {
  proposalId: string;
  fromLocalDate: string;
  toLocalDate: string | null;
  message: string;
  safetyGuidance: string;
}

export interface Run30ChangeResult {
  goalId: string;
  revision: number;
  action: Run30ChangeAction;
  stage: number;
  toLocalDate: string | null;
}

export interface Run30Api {
  getCurrentProgram(): Promise<Run30Program | null>;
  previewEnrollment(startDate: string): Promise<Run30EnrollmentPreview>;
  enroll(request: Run30EnrollRequest): Promise<Run30EnrollResult>;
  previewChange(request: Run30ChangeRequest): Promise<Run30ChangePreview>;
  confirmChange(request: Run30ChangeRequest & { proposalId: string }): Promise<Run30ChangeResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 화면이 의존하는 최소 형태만 확인한다. 어긋나면 표시하지 않고 오류로 다룬다. */
export function isRun30Program(value: unknown): value is Run30Program {
  if (!isRecord(value)) return false;
  return typeof value.goalId === "string"
    && value.template === RUN30_TEMPLATE
    && typeof value.revision === "number"
    && Array.isArray(value.sessions)
    && value.sessions.every((session) => isRecord(session)
      && typeof session.stage === "number"
      && typeof session.localDate === "string"
      && typeof session.status === "string")
    && Array.isArray(value.retryDates)
    && typeof value.totalStages === "number";
}

/** callable 요청에 undefined 필드를 넣지 않는다 — 서버가 허용 키를 엄격히 검사한다. */
function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

export function createRun30Api(
  functions: Functions,
  ensureAppCheckReady: () => Promise<void>,
): Run30Api {
  async function call<TRequest, TResponse>(name: string, data: TRequest): Promise<TResponse> {
    await ensureAppCheckReady();
    const callable = httpsCallable<TRequest, TResponse>(functions, name);
    const result = await callable(data);
    return result.data;
  }

  return {
    async getCurrentProgram() {
      const data = await call<Record<string, never>, { program?: unknown }>("getCurrentRun30Program", {});
      const program = data?.program ?? null;
      if (program === null) return null;
      if (!isRun30Program(program)) throw new Error("run30/invalid-program-response");
      return program;
    },
    previewEnrollment(startDate) {
      return call("previewRun30Enrollment", { startDate });
    },
    enroll(request) {
      return call("enrollRun30Program", withoutUndefined(request));
    },
    previewChange(request) {
      return call("previewRun30ProgramChange", withoutUndefined(request));
    },
    confirmChange(request) {
      return call("confirmRun30ProgramChange", withoutUndefined(request));
    },
  };
}

const USER_FACING_ERROR_CODES = new Set([
  "functions/failed-precondition",
  "functions/not-found",
  "functions/already-exists",
  "functions/invalid-argument",
]);

/**
 * 서버가 사용자에게 설명하려고 만든 오류(규칙 위반·상태 변경)만 원문을 보여 준다.
 * 내부 오류·네트워크 오류는 null 을 돌려 화면이 일반 안내를 쓰게 한다.
 */
export function run30ServerMessage(error: unknown): string | null {
  if (!isRecord(error)) return null;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message.trim() : "";
  if (!USER_FACING_ERROR_CODES.has(code) || message.length === 0 || message.length > 300) return null;
  // 서버 검증용 영어 메시지(`request is invalid` 등)는 사용자 문구가 아니다.
  if (/^[\x20-\x7e]+$/.test(message)) return null;
  return message;
}
