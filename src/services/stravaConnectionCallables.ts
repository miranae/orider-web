import { getFunctions, httpsCallable, type Functions } from "firebase/functions";
import { assertIsolatedStageRuntime, getRuntimeConfig } from "./runtimeConfig";

const CONNECTION_CALLABLES = ["stravaExchangeToken", "stravaQueueEnqueue", "stravaQueueCancel", "stravaDisconnect"] as const;
type ConnectionCallable = typeof CONNECTION_CALLABLES[number];

/** 공유 계정의 활동 연결만 정본으로 보내고 분석 Functions 인스턴스는 유지한다. */
export function stravaConnectionCallable(functions: Functions, name: ConnectionCallable) {
  if (!(CONNECTION_CALLABLES as readonly string[]).includes(name)) throw new Error("strava/unsupported-connection-callable");
  const config = getRuntimeConfig();
  let target = functions;
  if (config.stravaConnectionFunctionsBase) {
    assertIsolatedStageRuntime(config);
    target = getFunctions(functions.app, config.stravaConnectionFunctionsBase);
  }
  return httpsCallable(target, name);
}
