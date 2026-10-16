import { useEffect, useRef, useState } from "react";
import { auth } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { getGroupInviteCode, regenerateGroupInviteCode, type GroupInviteAdminResult } from "../features/group/groupInviteAdmin";
import { normalizeGroupInviteCode } from "../features/group/groupInviteLink";

export function useGroupInviteCode(groupId: string | undefined, userId: string | undefined) {
  const applyIssuedRef = useRef<((result: GroupInviteAdminResult) => void) | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ groupId, userId, code: "", status: "loading", expiresAt: 0, details: null as GroupInviteAdminResult | null });
  useEffect(() => {
    let cancelled = false;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const current = () => !cancelled && auth.currentUser?.uid === userId;
    setState({ groupId, userId, code: "", status: userId && groupId ? "loading" : "denied", expiresAt: 0, details: null as GroupInviteAdminResult | null });
    if (groupId && userId) {
      let issuedVersion = 0;
      const applyIssued = (result: GroupInviteAdminResult) => {
        if (!current()) return;
        const code = normalizeGroupInviteCode(result.inviteCode);
        if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{4}$/.test(code) || !Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now() || !Number.isInteger(result.useCount) || result.useCount < 0 || !Number.isInteger(result.useLimit) || result.useCount >= result.useLimit) {
          throw new Error("유효한 초대 코드가 없습니다");
        }
        clearTimeout(expiry);
        issuedVersion += 1;
        setState({ groupId, userId, code, status: "ready", expiresAt: result.expiresAt, details: result });
        // 최대 타이머 간격을 넘는 서버 TTL도 실제 만료까지 유지한다.
        const checkExpiry = () => {
          if (!current()) return;
          const remaining = result.expiresAt - Date.now();
          if (remaining <= 0) setState({ groupId, userId, code: "", status: "failed", expiresAt: 0, details: null as GroupInviteAdminResult | null });
          else expiry = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
        };
        checkExpiry();
      };
      applyIssuedRef.current = applyIssued;
      const loadVersion = issuedVersion;
      void getGroupInviteCode(groupId).then((result) => {
        if (!current() || loadVersion !== issuedVersion) return;
        applyIssued(result);
      }).catch((err: unknown) => {
        if (!current() || loadVersion !== issuedVersion) return;
        logClientError("useGroupInviteCode.fetch", err, { groupId });
        const denied = (err as { code?: string })?.code === "functions/permission-denied";
        setState({ groupId, userId, code: "", status: denied ? "denied" : "failed", expiresAt: 0, details: null as GroupInviteAdminResult | null });
      });
    }
    return () => { cancelled = true; applyIssuedRef.current = null; clearTimeout(expiry); };
  }, [groupId, userId, attempt]);
  const matching = state.groupId === groupId && state.userId === userId && auth.currentUser?.uid === userId;
  return {
    code: matching && state.expiresAt > Date.now() ? state.code : "",
    status: matching ? state.status : "loading",
    details: matching && state.expiresAt > Date.now() ? state.details : null,
    regenerate: async () => {
      const applyIssued = applyIssuedRef.current;
      if (!groupId || !userId || !applyIssued || auth.currentUser?.uid !== userId) return false;
      const result = await regenerateGroupInviteCode(groupId);
      if (applyIssuedRef.current !== applyIssued || auth.currentUser?.uid !== userId) return false;
      applyIssued(result);
      return true;
    },
    retry: () => setAttempt((value) => value + 1),
  };
}
