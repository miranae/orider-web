import { getRuntimeConfig, bundledFunctionsBase } from "./runtimeConfig";
import { getApps, initializeApp } from "firebase/app";
import { getFunctions, httpsCallable, httpsCallableFromURL, type Functions } from "firebase/functions";

/** 일회용 코드 교환 전용이다. 이 FirebaseApp에는 Auth와 App Check를 초기화하지 않는다. */
export async function redeemHandoffCode(source: Functions, code: string): Promise<string> {
  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig.useEmulators === true && source.app.options.projectId?.startsWith("demo-")) {
    // 에뮬레이터(demo- 프로젝트, 예: 앱 E2E Lab 의 demo-orider-lab) 실행: 코드는 에뮬레이터 Functions 가
    // 발급했으므로 같은 에뮬레이터에서 교환한다. source 는 이미 에뮬레이터에 연결돼 있어 운영 주소로 나가지 않는다.
    const redeem = httpsCallable<{ code: string }, { token: string }>(source, "webHandoffRedeem", { timeout: 15_000 });
    const { data } = await redeem({ code });
    return data.token;
  }
  if (runtimeConfig.appEnvironment === "stage" || source.app.options.projectId !== "miranae-orider-g1") {
    throw new Error("handoff/unavailable-in-isolated-stage");
  }
  const appName = `orider-handoff-redeem-${source.app.options.projectId}`;
  const app = getApps().find((candidate) => candidate.name === appName)
    ?? initializeApp(source.app.options, appName);
  const redeem = httpsCallableFromURL<{ code: string }, { token: string }>(
    getFunctions(app),
    bundledFunctionsBase(runtimeConfig) ? `${bundledFunctionsBase(runtimeConfig)}/webHandoffRedeem` : "https://auth.orider.co.kr/webHandoffRedeem",
    { timeout: 15_000 },
  );
  const { data } = await redeem({ code });
  return data.token;
}
