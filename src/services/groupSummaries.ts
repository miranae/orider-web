import { httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import type { Group } from "@shared/types";
import { logClientError } from "./errorLogger";

/** Legacy group roots may contain invite secrets; never weaken Firestore rules to read them. */
export async function resolveMyGroupSummaries(services: FirebaseServices, groupIds: string[]): Promise<Group[]> {
  let phase = "app_check";
  try {
    await services.ensureAppCheckReady();
    phase = "callable_read";
    const response = await httpsCallable<{ groupIds: string[] }, { groups: Group[] }>(services.functions, "resolveMyGroupSummaries")({ groupIds });
    phase = "validate_response";
    const groups = response.data?.groups;
    if (!Array.isArray(groups) || groups.some(group => !group || typeof group.id !== "string" || !groupIds.includes(group.id) || "inviteCode" in group)) {
      throw new Error("Invalid own club summaries response");
    }
    return groups;
  } catch (error) {
    logClientError("groupSummaries.read", error, { phase, groupCount: groupIds.length }, services);
    throw error;
  }
}
export function isGroupReadPermissionDenied(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "permission-denied";
}
