/**
 * 위임 세션 배너 — 관리자가 다른 사용자로 위임 로그인 중일 때 최상단에 고정 노출.
 *
 * 위임 중이라는 사실이 화면에 보이지 않으면, 관리자가 자기 계정으로 착각한 채 남의
 * 데이터를 수정할 수 있다. 그래서 Layout 이 아니라 앱 최상위에서 렌더해 모든 페이지에
 * 일관되게 뜨도록 한다.
 */
import { useEffect, useSyncExternalStore } from "react";
import { signOut } from "firebase/auth";

import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { logClientError } from "../services/errorLogger";
import { auth } from "../services/firebase";
import {
  clearImpersonationState,
  readImpersonation,
  subscribeImpersonation,
  type ImpersonationRead,
} from "../services/impersonation";

const NONE: ImpersonationRead = { status: "none" };
let snapshot: ImpersonationRead = NONE;

/** useSyncExternalStore 는 안정된 참조를 요구한다 — 값이 같으면 이전 객체를 그대로 준다. */
function readImpersonationSnapshot(): ImpersonationRead {
  const next = readImpersonation();
  if (
    next.status !== snapshot.status ||
    (next.status === "active" && snapshot.status === "active" &&
      (next.state.targetUid !== snapshot.state.targetUid || next.state.by !== snapshot.state.by))
  ) {
    snapshot = next;
  }
  return snapshot;
}

function getServerSnapshot(): ImpersonationRead {
  return NONE;
}

export default function ImpersonationBanner() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  // 로그아웃하면 남은 위임 상태를 정리한다 — 그대로 두면 같은 계정으로 정상 로그인했을
  // 때 uid 만 맞아 정상 세션이 위임 세션으로 오인된다. (렌더 중이 아니라 effect 에서)
  useEffect(() => {
    if (!user && readImpersonation().status !== "none") clearImpersonationState();
  }, [user]);
  // 렌더 시점 1회 읽기로는 다른 탭의 로그인·상태 기록을 놓쳐 "배너 없는 위임 세션" 이
  // 다음 우연한 렌더까지 지속된다. storage 이벤트와 자체 변경 알림을 함께 구독한다.
  const read = useSyncExternalStore(subscribeImpersonation, readImpersonationSnapshot, getServerSnapshot);

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
      showToast("위임 세션 종료에 실패했습니다. 아직 위임 계정으로 로그인된 상태이니 다시 시도해 주세요.", "error");
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
