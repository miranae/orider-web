import { getFunctions, httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { assertIsolatedStageRuntime, getRuntimeConfig } from "./runtimeConfig";

const AUTH_CALLABLES = ["socialAuthStart", "socialAuthComplete", "socialAuthListLinks", "socialAuthUnlink", "ensureUserProfile"] as const;
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
