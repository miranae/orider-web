export interface GroupJoinResult {
  groupId?: string;
  pending?: boolean;
  status?: string;
  memberStatus?: string;
  joinStatus?: string;
  requestStatus?: string;
}

const PENDING_STATUSES = new Set(["pending", "requested", "approval_required", "manual_approval"]);

export function isPendingGroupJoinResult(result: GroupJoinResult | null | undefined): boolean {
  if (!result) return false;
  if (result.pending === true) return true;

  return [result.status, result.memberStatus, result.joinStatus, result.requestStatus]
    .some((status) => typeof status === "string" && PENDING_STATUSES.has(status.toLowerCase()));
}
