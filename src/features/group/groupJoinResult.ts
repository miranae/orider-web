export interface JoinGroupByCodeResult {
  groupId: string;
  status: "active" | "pending";
}

export interface JoinGroupPublicResult {
  success: true;
  status: "active" | "pending";
}

export function isPendingGroupJoinResult(result: JoinGroupByCodeResult): boolean {
  return result.status === "pending";
}
