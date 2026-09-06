import { getApps, initializeApp } from "firebase/app";
import { getFunctions, httpsCallableFromURL, type Functions } from "firebase/functions";

/** 일회용 코드 교환 전용이다. 이 FirebaseApp에는 Auth와 App Check를 초기화하지 않는다. */
export async function redeemHandoffCode(source: Functions, code: string): Promise<string> {
  const appName = `orider-handoff-redeem-${source.app.options.projectId}`;
  const app = getApps().find((candidate) => candidate.name === appName)
    ?? initializeApp(source.app.options, appName);
  const redeem = httpsCallableFromURL<{ code: string }, { token: string }>(
    getFunctions(app),
    "https://auth.orider.co.kr/webHandoffRedeem",
    { timeout: 15_000 },
  );
  const { data } = await redeem({ code });
  return data.token;
}
