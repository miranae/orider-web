import type { Group, GroupMemberRole } from "@shared/types";

/** useGroupMemberRole returns only active/approved membership roles. Matches backend group-management. */
export function canManageGroup(group: Group | null, uid: string | undefined, activeRole: GroupMemberRole | null): boolean {
  return !!uid && !!group && (group.creatorId === uid || activeRole === "owner" || activeRole === "leader" || activeRole === "co-leader");
}
