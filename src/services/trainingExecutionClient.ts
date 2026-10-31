import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { parseSessionExecutionLink, parseSessionExecutionList, type SessionExecutionLink } from "./trainingExecutionContract";

export function createTrainingExecutionClient(services: Pick<FirebaseServices, "functions">) {
  const { functions } = services;
  async function call(name: string, data: Record<string, unknown>): Promise<SessionExecutionLink> {
    const result = await httpsCallable<Record<string, unknown>, unknown>(functions, name)(data);
    return parseSessionExecutionLink(result.data);
  }

  function reserveSessionExecution(input: Record<string, unknown>) { return call("reserveSessionExecution", input); }
  function startSessionExecution(executionId: string, idempotencyKey: string) {
    return call("startSessionExecution", { executionId, idempotencyKey });
  }
  function linkSessionExecutionActivity(executionId: string, activityId: string, activityRevision: string,
    idempotencyKey: string) {
    return call("linkSessionExecutionActivity", { executionId, activityId, activityRevision, method: "manual", userConfirmed: true, idempotencyKey });
  }
  function unlinkSessionExecutionActivity(executionId: string, idempotencyKey: string) {
    return call("unlinkSessionExecutionActivity", { executionId, userConfirmed: true, idempotencyKey });
  }
  function setSessionExecutionOutcome(executionId: string, outcome: "completed" | "partial" | "skipped" | "postponed",
    idempotencyKey: string, postponedToLocalDate?: string) {
    return call("setSessionExecutionOutcome", { executionId, outcome, idempotencyKey,
      ...(postponedToLocalDate ? { postponedToLocalDate } : {}) });
  }
  async function listSessionExecutions(discipline: "bike" | "run" | "swim", limit = 20): Promise<SessionExecutionLink[]> {
    const result = await httpsCallable<{ discipline: "bike" | "run" | "swim"; limit: number }, unknown>(
      functions, "listSessionExecutions",
    )({ discipline, limit });
    return parseSessionExecutionList(result.data);
  }

  return { reserveSessionExecution, startSessionExecution, linkSessionExecutionActivity, unlinkSessionExecutionActivity, setSessionExecutionOutcome, listSessionExecutions };
}
export const reserveSessionExecution: ReturnType<typeof createTrainingExecutionClient>["reserveSessionExecution"] = (...args) => createTrainingExecutionClient({ functions }).reserveSessionExecution(...args);
export const startSessionExecution: ReturnType<typeof createTrainingExecutionClient>["startSessionExecution"] = (...args) => createTrainingExecutionClient({ functions }).startSessionExecution(...args);
export const linkSessionExecutionActivity: ReturnType<typeof createTrainingExecutionClient>["linkSessionExecutionActivity"] = (...args) => createTrainingExecutionClient({ functions }).linkSessionExecutionActivity(...args);
export const unlinkSessionExecutionActivity: ReturnType<typeof createTrainingExecutionClient>["unlinkSessionExecutionActivity"] = (...args) => createTrainingExecutionClient({ functions }).unlinkSessionExecutionActivity(...args);
export const setSessionExecutionOutcome: ReturnType<typeof createTrainingExecutionClient>["setSessionExecutionOutcome"] = (...args) => createTrainingExecutionClient({ functions }).setSessionExecutionOutcome(...args);
export const listSessionExecutions: ReturnType<typeof createTrainingExecutionClient>["listSessionExecutions"] = (...args) => createTrainingExecutionClient({ functions }).listSessionExecutions(...args);
