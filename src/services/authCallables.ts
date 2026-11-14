import { getFunctions, httpsCallable } from "firebase/functions";
// eslint-disable-next-line design-system/no-firebase-singleton-in-embed -- 일반 웹 AuthProvider 로그인 전용. 임베드는 AuthContextProvider를 사용하고 로그인 callable을 실행하지 않는다.
import { functions } from "./firebase";
import { assertIsolatedStageRuntime, getRuntimeConfig } from "./runtimeConfig";

const AUTH_CALLABLES = ["socialAuthStart", "socialAuthComplete", "socialAuthListLinks", "socialAuthUnlink", "connectExistingGoogleAccount", "unlinkGoogleLogin", "ensureUserProfile"] as const;
type AuthCallable = typeof AUTH_CALLABLES[number];

/** 분석용 Functions는 유지하고, 검토된 Auth 호출만 선택적으로 정본에 보낸다. */
export function authCallable<Request = unknown, Response = unknown>(name: AuthCallable) {
  if (!(AUTH_CALLABLES as readonly string[]).includes(name)) throw new Error("auth/unsupported-callable");
  const config = getRuntimeConfig();
  let target = functions;
  if (config.socialAuthFunctionsBase) {
    assertIsolatedStageRuntime(config);
    target = getFunctions(functions.app, config.socialAuthFunctionsBase);
  }
  return httpsCallable<Request, Response>(target, name);
}
