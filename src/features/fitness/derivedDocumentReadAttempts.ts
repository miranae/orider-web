import type { Activity } from "@shared/types";

export type DerivedDocumentReadAttempts = Map<string, string>;

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
): boolean {
  return attempts.get(activity.id) !== activityDerivedDocumentRevision(activity);
}

/** 조회를 시작하기 전에 호출해 동시에 들어온 snapshot도 같은 문서를 중복 조회하지 않게 한다. */
export function markDerivedDocumentReadAttempt(
  attempts: DerivedDocumentReadAttempts,
  activity: Activity,
): void {
  attempts.set(activity.id, activityDerivedDocumentRevision(activity));
}

/** 네트워크 오류 또는 명시적 activity lifecycle 재처리 시 다음 조회를 허용한다. */
export function invalidateDerivedDocumentReadAttempt(
  attempts: DerivedDocumentReadAttempts,
  activityId: string,
): void {
  attempts.delete(activityId);
}
