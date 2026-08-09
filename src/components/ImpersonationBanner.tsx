/**
 * 위임 세션 배너 — 관리자가 다른 사용자로 위임 로그인 중일 때 최상단에 고정 노출.
 *
 * 위임 중이라는 사실이 화면에 보이지 않으면, 관리자가 자기 계정으로 착각한 채 남의
 * 데이터를 수정할 수 있다. 그래서 Layout 이 아니라 앱 최상위에서 렌더해 모든 페이지에
 * 일관되게 뜨도록 한다.
 */
import { signOut } from "firebase/auth";

import { useAuth } from "../contexts/AuthContext";
import { auth } from "../services/firebase";
import { clearImpersonationState, readImpersonationState } from "../services/impersonation";

export default function ImpersonationBanner() {
  const { user, profile } = useAuth();
  const state = readImpersonationState();

  // 로그아웃했거나 다른 계정으로 갈아탄 뒤 남은 stale 상태는 배너를 띄우지 않는다.
  if (!state || !user || state.targetUid !== user.uid) return null;

  const name = profile?.nickname ?? user.email ?? user.uid;

  async function onExit() {
    clearImpersonationState();
    try {
      await signOut(auth);
    } finally {
      window.location.href = "/";
    }
  }

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex items-center gap-3 bg-[var(--color-accent)] px-3 py-2"
      style={{ color: "var(--ink-0)", fontSize: "var(--fs-sm)" }}
    >
      <span className="flex-1">
        위임 세션 — <strong>{name}</strong> 으로 로그인 중 (발급: {state.by})
      </span>
      <button
        type="button"
        onClick={onExit}
        className="border px-2 py-1"
        style={{ borderColor: "var(--ink-0)", fontSize: "var(--fs-sm)", borderRadius: "var(--r-md)" }}
      >
        종료
      </button>
    </div>
  );
}
