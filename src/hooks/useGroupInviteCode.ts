import { useEffect, useState } from "react";
import { auth } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { getGroupInviteCode } from "../features/group/groupInviteAdmin";
import { normalizeGroupInviteCode } from "../features/group/groupInviteLink";

export function useGroupInviteCode(groupId: string | undefined, userId: string | undefined) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ groupId, userId, code: "", status: "loading", expiresAt: 0 });
  useEffect(() => {
    let cancelled = false;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const current = () => !cancelled && auth.currentUser?.uid === userId;
    setState({ groupId, userId, code: "", status: userId && groupId ? "loading" : "denied", expiresAt: 0 });
    if (groupId && userId) {
      void getGroupInviteCode(groupId).then((result) => {
        if (!current()) return;
        const code = normalizeGroupInviteCode(result.inviteCode);
        if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{4}$/.test(code) || !Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now() || !Number.isInteger(result.useCount) || result.useCount < 0 || !Number.isInteger(result.useLimit) || result.useCount >= result.useLimit) {
          throw new Error("유효한 초대 코드가 없습니다");
        }
        setState({ groupId, userId, code, status: "ready", expiresAt: result.expiresAt });
        // 최대 타이머 간격을 넘는 서버 TTL도 실제 만료까지 유지한다.
        const checkExpiry = () => {
          if (!current()) return;
          const remaining = result.expiresAt - Date.now();
          if (remaining <= 0) setState({ groupId, userId, code: "", status: "failed", expiresAt: 0 });
          else expiry = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
        };
        checkExpiry();
      }).catch((err: unknown) => {
        if (!current()) return;
        logClientError("useGroupInviteCode.fetch", err, { groupId });
        const denied = (err as { code?: string })?.code === "functions/permission-denied";
        setState({ groupId, userId, code: "", status: denied ? "denied" : "failed", expiresAt: 0 });
      });
    }
    return () => { cancelled = true; clearTimeout(expiry); };
  }, [groupId, userId, attempt]);
  const matching = state.groupId === groupId && state.userId === userId && auth.currentUser?.uid === userId;
  return {
    code: matching && state.expiresAt > Date.now() ? state.code : "",
    status: matching ? state.status : "loading",
    retry: () => setAttempt((value) => value + 1),
  };
}
