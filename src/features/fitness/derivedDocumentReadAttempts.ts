import type { Activity } from "@shared/types";

export type DerivedDocumentReadAttempt = {
  token: number;
  revision: string;
  status: "reading" | "complete" | "missing";
  missingCount: number;
  nextEligibleAt: number;
};

export type DerivedDocumentReadAttempts = Map<string, DerivedDocumentReadAttempt>;

let nextAttemptToken = 1;

/**
 * 파생 문서가 생성되는 동안 activity 문서도 처리 상태나 summary를 갱신한다.
 * 이 값이 바뀌면 이전의 "문서 없음" 결과를 폐기하고 해당 ID만 다시 조회한다.
 */
export function activityDerivedDocumentRevision(activity: Activity): string {
  const lifecycle = activity as Activity & Record<string, unknown>;
  return JSON.stringify([
    lifecycle.updatedAt ?? null,
    lifecycle.modifiedAt ?? null,
    lifecycle.processedAt ?? null,
    lifecycle.processingStatus ?? null,
    lifecycle.streamStatus ?? null,
    lifecycle.analysisStatus ?? null,
    activity.summary ?? null,
  ]);
}

export function shouldReadDerivedDocument(
  attempts: DerivedDocumentReadAttempts,
  activity: Activity,
  now = Date.now(),
): boolean {
  const attempt = attempts.get(activity.id);
  if (attempt?.revision !== activityDerivedDocumentRevision(activity)) return true;
  return attempt.status === "missing" && attempt.nextEligibleAt <= now;
}

/** 조회를 시작하기 전에 호출해 동시에 들어온 snapshot도 같은 문서를 중복 조회하지 않게 한다. */
export function markDerivedDocumentReadAttempt(
  attempts: DerivedDocumentReadAttempts,
  activity: Activity,
): DerivedDocumentReadAttempt {
  const revision = activityDerivedDocumentRevision(activity);
  const previous = attempts.get(activity.id);
  const attempt: DerivedDocumentReadAttempt = {
    token: nextAttemptToken++,
    revision,
    status: "reading",
    missingCount: previous?.revision === revision ? previous.missingCount : 0,
    nextEligibleAt: Number.POSITIVE_INFINITY,
  };
  attempts.set(activity.id, attempt);
  return attempt;
}

export function markDerivedDocumentReadComplete(
  attempts: DerivedDocumentReadAttempts,
  activity: Activity,
): void {
  const previous = attempts.get(activity.id);
  attempts.set(activity.id, {
    token: previous?.token ?? nextAttemptToken++,
    revision: activityDerivedDocumentRevision(activity),
    status: "complete",
    missingCount: 0,
    nextEligibleAt: Number.POSITIVE_INFINITY,
  });
}

export function markDerivedDocumentMissing(
  attempts: DerivedDocumentReadAttempts,
  activity: Activity,
  nextEligibleAt: number,
): DerivedDocumentReadAttempt {
  const revision = activityDerivedDocumentRevision(activity);
  const previous = attempts.get(activity.id);
  const attempt: DerivedDocumentReadAttempt = {
    token: previous?.token ?? nextAttemptToken++,
    revision,
    status: "missing",
    missingCount: previous?.revision === revision ? previous.missingCount + 1 : 1,
    nextEligibleAt,
  };
  attempts.set(activity.id, attempt);
  return attempt;
}

export function isDerivedDocumentReadCurrent(
  attempts: DerivedDocumentReadAttempts,
  activityId: string,
  revision: string,
  token?: number,
): boolean {
  const attempt = attempts.get(activityId);
  return attempt?.revision === revision && (token == null || attempt.token === token);
}

/** 네트워크 오류 또는 명시적 activity lifecycle 재처리 시 다음 조회를 허용한다. */
export function invalidateDerivedDocumentReadAttempt(
  attempts: DerivedDocumentReadAttempts,
  activityId: string,
): void {
  attempts.delete(activityId);
}
