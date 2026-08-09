/**
 * 위임 세션 배너 — 관리자가 다른 사용자로 위임 로그인 중일 때 최상단에 고정 노출.
 *
 * 위임 중이라는 사실이 화면에 보이지 않으면, 관리자가 자기 계정으로 착각한 채 남의
 * 데이터를 수정할 수 있다. 그래서 Layout 이 아니라 앱 최상위에서 렌더해 모든 페이지에
 * 일관되게 뜨도록 한다.
 */
import { signOut } from "firebase/auth";

import { useAuth } from "../contexts/AuthContext";
import { logClientError } from "../services/errorLogger";
import { auth } from "../services/firebase";
import { clearImpersonationState, readImpersonation } from "../services/impersonation";

export default function ImpersonationBanner() {
  const { user, profile } = useAuth();
  const read = readImpersonation();

  // 로그아웃했거나 다른 계정으로 갈아탄 뒤 남은 stale 상태는 배너를 띄우지 않는다.
  // 단 값이 깨진 경우(corrupt)는 대상 uid 를 대조할 수 없어도 배너를 띄운다 —
  // 위임 중인데 배너가 없는 상태가 이 컴포넌트가 막으려는 최악의 경우다.
  const state = read.status === "active" ? read.state : null;
  if (!user) return null;
  if (read.status === "none") return null;
  if (state && state.targetUid !== user.uid) return null;

  const name = profile?.nickname ?? user.email ?? user.uid;
  const issuedBy = state?.by ?? "확인 불가";

  async function onExit() {
    // 로그아웃이 성공해야 상태를 지운다 — 먼저 지우면 signOut 실패 시 위임 계정으로
    // 인증된 채 배너만 사라져, 관리자가 남의 계정임을 모르고 작업하게 된다.
    try {
      await signOut(auth);
    } catch (e) {
      logClientError("ImpersonationBanner.exit", e, { targetUid: state?.targetUid });
      window.alert("위임 세션 종료에 실패했습니다. 아직 위임 계정으로 로그인된 상태이니 다시 시도해 주세요.");
      return;
    }
    clearImpersonationState();
    window.location.href = "/";
  }

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex items-center gap-3 bg-[var(--color-accent)] px-3 py-2"
      style={{ color: "var(--ink-0)", fontSize: "var(--fs-sm)" }}
    >
      <span className="flex-1">
        위임 세션 — <strong>{name}</strong> 으로 로그인 중 (발급: {issuedBy})
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
