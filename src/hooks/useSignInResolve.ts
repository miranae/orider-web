import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import type { Resolve } from "../components/redesign/states/Resolvable";

/**
 * 「로그인이 필요해요」류 문구를 누르면 로그인 창을 여는 해결 경로.
 * 앱 임베드 화면은 웹 로그인을 열 수 없고(주입된 signIn 은 아무것도 하지 않는다) 호스트 로그인 연결도 없으므로
 * 해결 경로를 주지 않는다 — 문구는 예전처럼 글자로만 보인다.
 */
export function useSignInResolve(): Resolve | undefined {
  const { signIn } = useAuth();
  const embedded = useFirebaseServices().scope === "embedded";
  return embedded ? undefined : { onClick: () => { void signIn(); } };
}
