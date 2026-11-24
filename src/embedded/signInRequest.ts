/**
 * 임베드 표면의 "로그인" 버튼을 네이티브 호스트 로그인 화면으로 넘기는 브리지 계약.
 *
 * 협상: 호스트는 지원할 때만 `host.sessionAccepted.capabilities` 에 이 문자열을 넣는다.
 * 웹도 `bootstrap.ready.capabilities` 에 같은 문자열을 넣어 이 메시지를 이해한다고 알린다.
 * 호스트가 알리지 않으면(구버전 앱) `auth.signInRequested` 를 보내지 않고 앱 설정에서
 * 로그인하라는 안내만 띄운다 — 구버전 호스트 코덱은 모르는 타입을 거절하기 때문이다.
 *
 * 로그인이 끝나면 호스트는 새 사용자로 `host.authorize` 를 다시 보낸다(기존 승인 흐름).
 */
export const HOST_SIGN_IN_REQUEST_CAPABILITY = "host.signInRequest.v1" as const;

/** `auth.signInRequested.returnPath` 최대 길이. 넘으면 returnPath 를 생략한다(잘라 보내지 않는다). */
export const SIGN_IN_RETURN_PATH_MAX = 512;

export interface SignInRequestedPayload {
  surface: string;
  returnPath?: string;
}

export function buildSignInRequestedPayload(surface: string, returnPath: string | undefined): SignInRequestedPayload {
  if (
    typeof returnPath !== "string"
    || returnPath.length === 0
    || returnPath.length > SIGN_IN_RETURN_PATH_MAX
    || !returnPath.startsWith("/")
    || returnPath.startsWith("//")
  ) return { surface };
  return { surface, returnPath };
}

export type EmbeddedSignInOutcome = "requested" | "unsupported" | "unavailable";

export interface EmbeddedSignInRequest {
  hostCapabilities: readonly string[];
  surface: string;
  returnPath?: string;
  send: (payload: SignInRequestedPayload) => void;
}

/**
 * 호스트가 기능을 알렸으면 요청을 보내고 곧바로 끝낸다(응답을 기다리지 않는다 — 결과는
 * 새 `host.authorize` 로 온다). 알리지 않았거나 전송이 실패하면 안내가 필요하다고 돌려준다.
 */
export function requestEmbeddedSignIn({ hostCapabilities, surface, returnPath, send }: EmbeddedSignInRequest): EmbeddedSignInOutcome {
  if (!hostCapabilities.includes(HOST_SIGN_IN_REQUEST_CAPABILITY)) return "unsupported";
  try {
    send(buildSignInRequestedPayload(surface, returnPath));
    return "requested";
  } catch {
    return "unavailable";
  }
}
