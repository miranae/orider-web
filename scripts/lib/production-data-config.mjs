import { createHash } from "node:crypto";

export const PRODUCTION_ORIGIN = "https://orider.co.kr";
export const DEVELOPMENT_ORIGIN = "https://orider-dev.web.app";
export const PRODUCTION_AI_ORIGIN = "https://orider-ai-api-h5zqzw3n4a-du.a.run.app";

// 2026-10-24 운영 bundle과 production Environment에서 두 compile-time 값이 true임을 대조했다.
// 새 writer가 runtime 필드도 내보내면 사용하지 않는 일회성 이전 계약이다.
export const LEGACY_SUBSCRIPTION_BUILD = {
  entry: "/assets/index-C2AVKNI8.js", entrySha256: "2e273af42653ba1c0bbca27475abe2d38d0efd4b040978478a8950658f594b19",
  chunk: "/assets/activitySubscriptions-XMQopL3T.js", chunkSha256: "c998469f04231df2ba6eaa4f39aa7d5b2b0d98c46586ec6a2559b8d5c2a42ea1",
};

export async function resolveProductionBuildFlags(source, fetcher = fetch, legacy = LEGACY_SUBSCRIPTION_BUILD) {
  const keys = ["activitySubscriptionsEnabled", "activitySubscriptionsBackendReady"];
  if (keys.every(key => typeof source[key] === "boolean")) return source;
  if (keys.some(key => source[key] !== undefined)) throw new Error("production subscription flags incomplete");
  const read = async path => {
    const response = await fetcher(`${PRODUCTION_ORIGIN}${path}`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error("production subscription build unavailable");
    return response.text();
  };
  const html = await read("/");
  if (!html.includes(`src="${legacy.entry}"`)) throw new Error("unreviewed legacy production subscription build");
  for (const [path, expected] of [[legacy.entry, legacy.entrySha256], [legacy.chunk, legacy.chunkSha256]]) {
    if (createHash("sha256").update(await read(path)).digest("hex") !== expected) throw new Error("production subscription build hash mismatch");
  }
  return { ...source, activitySubscriptionsEnabled: true, activitySubscriptionsBackendReady: true };
}

/** 운영이 현재 제공하는 공개 설정을 같은 backend를 쓰는 개발 Hosting에 고정한다. */
export function productionDataConfig(source) {
  if (!source || source.appEnvironment !== "production" || source.firebaseProjectId !== "miranae-orider-g1"
    || source.firebaseAuthDomain !== "miranae-orider-g1.firebaseapp.com"
    || !/^miranae-orider-g1\.(?:firebasestorage\.app|appspot\.com)$/.test(source.firebaseStorageBucket ?? "")
    || source.firebaseAppId !== "1:289663940841:web:ba08cdae154286e6499878"
    || source.firebaseMessagingSenderId !== "289663940841" || source.firebaseFunctionsRegion !== "asia-northeast3"
    || source.useEmulators === true || source.socialAuthFunctionsBase) throw new Error("production data Firebase identity mismatch");
  if (source.firebaseFunctionsBase && source.firebaseFunctionsBase !== "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net") throw new Error("production data callable endpoint mismatch");
  for (const key of ["firebaseApiKey", "appCheckRecaptchaSiteKey", "stravaClientId", "stravaRedirectUri", "mapboxToken", "aiApiBase"]) {
    if (typeof source[key] !== "string" || !source[key].trim()) throw new Error(`production data missing ${key}`);
  }
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" && /[\r\n]/.test(value)) throw new Error(`production data invalid string ${key}`);
    if ((key.endsWith("Enabled") || key === "activitySubscriptionsBackendReady") && typeof value !== "boolean") throw new Error(`production data invalid flag ${key}`);
  }
  if (!["activitySubscriptionsEnabled", "activitySubscriptionsBackendReady"].every(key => typeof source[key] === "boolean")) throw new Error("production subscription runtime flags missing");
  const config = { ...source, personalApiBase: source.personalApiBase || PRODUCTION_ORIGIN };
  const allowed = {
    personalApiBase: [PRODUCTION_ORIGIN], aiApiBase: [PRODUCTION_AI_ORIGIN],
    stravaRedirectUri: ["https://orider-strava.web.app"],
    segmentTilesBase: ["https://storage.googleapis.com", PRODUCTION_ORIGIN],
    heatmapBase: ["https://storage.googleapis.com", PRODUCTION_ORIGIN],
  };
  for (const [key, origins] of Object.entries(allowed)) {
    if (!config[key]) continue;
    const url = new URL(config[key], PRODUCTION_ORIGIN);
    if (!origins.includes(url.origin) || url.username || url.password || url.hash) throw new Error(`production data service origin mismatch: ${key}`);
    if (["personalApiBase", "aiApiBase"].includes(key) && (url.pathname !== "/" || url.search)) throw new Error(`production data service base path mismatch: ${key}`);
    if (["segmentTilesBase", "heatmapBase"].includes(key) && url.hostname === "storage.googleapis.com"
      && !/^\/miranae-orider-g1\.(?:firebasestorage\.app|appspot\.com)\//.test(url.pathname)) throw new Error(`production data Storage path mismatch: ${key}`);
    config[key] = url.href.replace(/\/$/, "");
  }
  return config;
}

/** 실행 시점 설정과 일부 기존 build-time 소비자 모두 같은 snapshot을 사용한다. */
export function productionBuildEnv(config) {
  const keys = {
    firebaseApiKey: "VITE_FIREBASE_API_KEY", firebaseAuthDomain: "VITE_FIREBASE_AUTH_DOMAIN", firebaseProjectId: "VITE_FIREBASE_PROJECT_ID",
    firebaseStorageBucket: "VITE_FIREBASE_STORAGE_BUCKET", firebaseMessagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID", firebaseAppId: "VITE_FIREBASE_APP_ID",
    firebaseFunctionsRegion: "VITE_FIREBASE_FUNCTIONS_REGION", firebaseFunctionsBase: "VITE_FIREBASE_FUNCTIONS_BASE",
    appCheckRecaptchaSiteKey: "VITE_APPCHECK_RECAPTCHA_SITE_KEY", stravaClientId: "VITE_STRAVA_CLIENT_ID", stravaRedirectUri: "VITE_STRAVA_REDIRECT_URI",
    mapboxToken: "VITE_MAPBOX_TOKEN", aiApiBase: "VITE_ORIDER_AI_API_BASE", personalApiBase: "VITE_ORIDER_PERSONAL_API_BASE",
    segmentTilesBase: "VITE_SEGMENT_TILES_BASE", heatmapBase: "VITE_HEATMAP_BASE",
    trainingDecisionCanonicalEnabled: "VITE_TRAINING_DECISION_CANONICAL_ENABLED", canonicalConsumersEnabled: "VITE_CANONICAL_CONSUMERS_ENABLED",
    canonicalWeatherEnabled: "VITE_CANONICAL_WEATHER", canonicalCourseEnabled: "VITE_CANONICAL_COURSE", canonicalMaintenanceEnabled: "VITE_CANONICAL_MAINTENANCE",
    canonicalMilestonesEnabled: "VITE_CANONICAL_MILESTONES", canonicalRolloutEnabled: "VITE_CANONICAL_ROLLOUT_ENABLED",
    activitySubscriptionsEnabled: "VITE_ACTIVITY_SUBSCRIPTIONS_ENABLED", activitySubscriptionsBackendReady: "VITE_ACTIVITY_SUBSCRIPTIONS_BACKEND_READY",
  };
  return { VITE_MODE: "production", VITE_SOCIAL_AUTH_FUNCTIONS_BASE: "", VITE_USE_EMULATORS: "false",
    ...Object.fromEntries(Object.entries(keys).map(([key, name]) => [name, String(config[key] ?? "")])) };
}

/** backend CORS 배포가 준비되기 전에는 개발 Hosting 전환을 게시하지 않는다. */
export async function verifyProductionDataCors(config, fetcher = fetch) {
  const functions = config.firebaseFunctionsBase || "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net";
  for (const [url, method] of [[`${config.personalApiBase}/api/v1/activities`, "GET"], [`${config.personalApiBase}/api/v1/activities`, "PATCH"], [config.aiApiBase, "POST"], [`${functions}/ensureUserProfile`, "POST"]]) {
    const response = await fetcher(url, { method: "OPTIONS", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { Origin: DEVELOPMENT_ORIGIN, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": "authorization,content-type,x-firebase-appcheck" } });
    const methods = (response.headers.get("access-control-allow-methods") ?? "").split(/\s*,\s*/);
    const headers = (response.headers.get("access-control-allow-headers") ?? "").toLowerCase().split(/\s*,\s*/);
    if (!response.ok || response.headers.get("access-control-allow-origin") !== DEVELOPMENT_ORIGIN
      || !methods.includes(method) || !["authorization", "content-type", "x-firebase-appcheck"].every(header => headers.includes(header))) {
      throw new Error(`production data CORS not ready: ${new URL(url).origin} ${method}`);
    }
  }
}
