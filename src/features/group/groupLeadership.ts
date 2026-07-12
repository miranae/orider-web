import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase";

export interface TransferGroupLeadershipInput {
  groupId: string;
  targetUserId: string;
  leaveAfterTransfer?: boolean;
}

export interface TransferGroupLeadershipResult {
  success: true;
  leftGroup: boolean;
}

export async function transferGroupLeadership(
  input: TransferGroupLeadershipInput,
): Promise<TransferGroupLeadershipResult> {
  const fn = httpsCallable<TransferGroupLeadershipInput, TransferGroupLeadershipResult>(
    functions,
    "transferGroupLeadership",
  );
  const { data } = await fn(input);
  if (data.success !== true || typeof data.leftGroup !== "boolean") {
    throw new Error("invalid-transfer-group-leadership-response");
  }
  return data;
}

export interface SetGroupMemberRoleInput {
  groupId: string;
  userId: string;
  role: "member" | "co-leader";
}

/** #379: 역할 변경을 직접 Firestore 쓰기 대신 CF로 — 서버가 creator 권한·대상 유효성을 강제한다. */
export async function setGroupMemberRole(input: SetGroupMemberRoleInput): Promise<void> {
  const fn = httpsCallable<SetGroupMemberRoleInput, { success: true }>(
    functions,
    "setGroupMemberRole",
  );
  const { data } = await fn(input);
  if (data.success !== true) {
    throw new Error("invalid-set-group-member-role-response");
  }
}
