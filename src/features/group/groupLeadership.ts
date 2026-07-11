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
