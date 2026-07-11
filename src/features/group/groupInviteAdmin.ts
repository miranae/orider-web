import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase";

export interface GroupInviteAdminResult {
  inviteCode: string;
  expiresAt: number;
  useLimit: number;
  useCount: number;
}

export async function getGroupInviteCode(groupId: string): Promise<GroupInviteAdminResult> {
  const fn = httpsCallable<{ groupId: string }, GroupInviteAdminResult>(functions, "getGroupInviteCode");
  return (await fn({ groupId })).data;
}

export async function regenerateGroupInviteCode(groupId: string): Promise<GroupInviteAdminResult> {
  const fn = httpsCallable<{ groupId: string }, GroupInviteAdminResult>(functions, "regenerateGroupInviteCode");
  return (await fn({ groupId })).data;
}
