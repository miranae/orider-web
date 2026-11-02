import { httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../../contexts/FirebaseServicesContext";

/** 임베드는 별도 Firebase app 을 쓰므로 호출부가 주입한 서비스로 부른다(#847). */
type CallableServices = Pick<FirebaseServices, "functions" | "ensureAppCheckReady">;

export interface GroupInviteAdminResult {
  inviteCode: string;
  expiresAt: number;
  useLimit: number;
  useCount: number;
}

export async function getGroupInviteCode(groupId: string, { functions, ensureAppCheckReady }: CallableServices): Promise<GroupInviteAdminResult> {
  await ensureAppCheckReady();
  const fn = httpsCallable<{ groupId: string }, GroupInviteAdminResult>(functions, "getGroupInviteCode");
  return (await fn({ groupId })).data;
}

export async function regenerateGroupInviteCode(groupId: string, { functions, ensureAppCheckReady }: CallableServices): Promise<GroupInviteAdminResult> {
  await ensureAppCheckReady();
  const fn = httpsCallable<{ groupId: string }, GroupInviteAdminResult>(functions, "regenerateGroupInviteCode");
  return (await fn({ groupId })).data;
}
