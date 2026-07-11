export interface JoinGroupByCodeResult {
  groupId: string;
  status: "active" | "pending";
}

export interface JoinGroupPublicResult {
  success: true;
}

export function isPendingGroupJoinResult(result: JoinGroupByCodeResult): boolean {
  return result.status === "pending";
}
