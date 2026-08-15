import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { parseSessionExecutionLink, parseSessionExecutionList, type SessionExecutionLink } from "./trainingExecutionContract";

async function call(name: string, data: Record<string, unknown>): Promise<SessionExecutionLink> {
  const result = await httpsCallable<Record<string, unknown>, unknown>(functions, name)(data);
  return parseSessionExecutionLink(result.data);
}

export function reserveSessionExecution(input: Record<string, unknown>) { return call("reserveSessionExecution", input); }
export function startSessionExecution(executionId: string, idempotencyKey: string) {
  return call("startSessionExecution", { executionId, idempotencyKey });
}
export function linkSessionExecutionActivity(executionId: string, activityId: string, activityRevision: string,
  idempotencyKey: string) {
  return call("linkSessionExecutionActivity", { executionId, activityId, activityRevision, method: "manual", userConfirmed: true, idempotencyKey });
}
export function unlinkSessionExecutionActivity(executionId: string, idempotencyKey: string) {
  return call("unlinkSessionExecutionActivity", { executionId, userConfirmed: true, idempotencyKey });
}
export function setSessionExecutionOutcome(executionId: string, outcome: "completed" | "partial" | "skipped" | "postponed",
  idempotencyKey: string, postponedToLocalDate?: string) {
  return call("setSessionExecutionOutcome", { executionId, outcome, idempotencyKey,
    ...(postponedToLocalDate ? { postponedToLocalDate } : {}) });
}
export async function listSessionExecutions(discipline: "bike" | "run" | "swim", limit = 20): Promise<SessionExecutionLink[]> {
  const result = await httpsCallable<{ discipline: "bike" | "run" | "swim"; limit: number }, unknown>(
    functions, "listSessionExecutions",
  )({ discipline, limit });
  return parseSessionExecutionList(result.data);
}
