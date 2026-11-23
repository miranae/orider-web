import type { User } from "firebase/auth";
import { getRuntimeConfig, isEmulatorRuntime } from "../../services/runtimeConfig";

type Topic = "notification" | "device";
type AppCheck = (forceRefresh?: boolean) => Promise<string | null>;

export function accountWorldEndpoint(topic: Topic, projectId?: string): string | undefined {
  const localSignal = topic === "notification" ? import.meta.env.VITE_ORIDER_LOCAL_NOTIFICATION_REDIS
    : import.meta.env.VITE_ORIDER_LOCAL_DEVICE_REDIS;
  if (projectId === "demo-orider-lab" && import.meta.env.DEV &&
      import.meta.env.VITE_ORIDER_LOCAL_WORLD === "1" && localSignal === "1") {
    return `ws://127.0.0.1:19487/${topic}-signals`;
  }
  if (projectId === "miranae-orider-g1" && !isEmulatorRuntime() &&
      getRuntimeConfig().worldAccountSignalsEnabled === true) {
    return `wss://world.orider.co.kr/${topic}-signals`;
  }
}

function tokenExpiry(token: string | undefined): number {
  const claim = token?.split(".")[1];
  if (!claim) return 0;
  try {
    const { exp } = JSON.parse(atob(claim.replace(/-/g, "+").replace(/_/g, "/")));
    return Number.isFinite(exp) ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function accountWorldExpiresAt(request: unknown): number {
  const credentials = request as { token: string; appCheck: string };
  return Math.min(tokenExpiry(credentials.token), tokenExpiry(credentials.appCheck));
}

export async function accountWorldSubscription(
  endpoint: string, topic: Topic, user: Pick<User, "getIdToken">, getAppCheckToken?: AppCheck, resource?: string,
) {
  const fields = { v: 1, type: `${topic}_subscribe`, ...(resource === undefined ? {} : { resource }) };
  if (endpoint.startsWith("ws:")) return { ...fields, token: await user.getIdToken() };

  async function credentials(forceRefresh?: boolean) {
    const [token, appCheck] = await Promise.all([user.getIdToken(forceRefresh), getAppCheckToken?.(forceRefresh)]);
    return { ...fields, token, appCheck };
  }
  let request = await credentials();
  if (accountWorldExpiresAt(request) <= Date.now() + 30_000) request = await credentials(true);
  if (accountWorldExpiresAt(request) <= Date.now() + 30_000) throw new Error("World subscription credentials unavailable");
  return request;
}
