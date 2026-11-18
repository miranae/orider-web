import { productionDataConfig, productionBuildEnv } from "./production-data-config.mjs";
import { checkIsolatedStageConfig } from "./isolated-stage-config.mjs";

export const STAGE_FUNCTIONS = "https://stage-parity-default-818364001341.asia-northeast3.run.app";
export const STAGE_PERSONAL_API = STAGE_FUNCTIONS;
export const STAGE_AI_API = "https://stage-parity-ai-818364001341.asia-northeast3.run.app";

/** 운영 기능 스위치와 공유 데이터 identity를 보존하고 실행 경로만 개발로 옮긴다. */
export function stageProductionParityConfig(source, metadata = {}) {
  const config = {
    ...productionDataConfig(source),
    appEnvironment: "production",
    deploymentProfile: "production-parity-stage",
    firebaseFunctionsBase: STAGE_FUNCTIONS,
    socialAuthFunctionsBase: "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net",
    personalApiBase: STAGE_PERSONAL_API,
    aiApiBase: STAGE_AI_API,
    publicClubApiUrl: `${STAGE_FUNCTIONS}/publicClubs`,
    // 등록된 프록시는 state의 허용된 returnOrigin으로 돌려준다. 개발 도메인도 허용돼 있다.
    stravaRedirectUri: source.stravaRedirectUri,
    useEmulators: false,
  };
  if (metadata.sourceSha !== undefined || metadata.hostingVersion !== undefined) {
    if (!/^[a-f0-9]{40}$/.test(metadata.sourceSha ?? "") || !/^sites\/miranae-orider-g1\/versions\/[a-f0-9]+$/.test(metadata.hostingVersion ?? "")) throw new Error("stage parity source metadata mismatch");
    config.sourceVersion = metadata.sourceSha;
    config.sourceHostingVersion = metadata.hostingVersion;
  }
  checkIsolatedStageConfig(config);
  return config;
}

export function stageProductionParityBuildEnv(source) {
  const config = stageProductionParityConfig(source);
  return {
    ...productionBuildEnv(config),
    VITE_MODE: "production",
    VITE_SOCIAL_AUTH_FUNCTIONS_BASE: config.socialAuthFunctionsBase,
    VITE_STRAVA_REDIRECT_URI: config.stravaRedirectUri,
    VITE_ORIDER_PERSONAL_API_BASE: config.personalApiBase,
    VITE_ORIDER_AI_API_BASE: config.aiApiBase,
    VITE_PUBLIC_CLUB_API_URL: config.publicClubApiUrl,
    // 기존 build-time 소비자에도 runtime과 같은 기능 스위치를 전달한다.
    ...Object.fromEntries(Object.entries(source).filter(([key, value]) =>
      (key.endsWith("Enabled") || key === "activitySubscriptionsBackendReady") && typeof value === "boolean")
      .map(([key, value]) => [`VITE_${key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}`, String(value)])),
  };
}

export const BUNDLED_FUNCTIONS = {
  development: "https://dev-bundle-default-api-818364001341.asia-northeast3.run.app",
  production: "https://orider-bundle-default-api-289663940841.asia-northeast3.run.app",
};
export const BUNDLED_AI = {
  development: "https://dev-bundle-ai-api-818364001341.asia-northeast3.run.app",
  production: "https://orider-ai-api-h5zqzw3n4a-du.a.run.app",
};

/** 같은 웹 산출물의 실행 설정만 환경별 묶음 서비스로 선택한다. 게시 작업은 수행하지 않는다. */
export function bundledFunctionsConfig(source, environment) {
  if (!Object.hasOwn(BUNDLED_FUNCTIONS, environment)) throw new Error("unapproved bundled environment");
  let normalized = source;
  if (source.deploymentProfile === "bundled-development" || source.deploymentProfile === "bundled-production") {
    const prior = source.deploymentProfile === "bundled-development" ? "development" : "production";
    const expected = BUNDLED_FUNCTIONS[prior];
    if (source.firebaseFunctionsBase !== expected || source.socialAuthFunctionsBase !== expected
      || source.personalApiBase !== expected || source.publicClubApiUrl !== `${expected}/publicClubs`
      || source.aiApiBase !== BUNDLED_AI[prior]) throw new Error("bundled source execution identity mismatch");
    normalized = { ...source, deploymentProfile: undefined, firebaseFunctionsBase: undefined, socialAuthFunctionsBase: undefined,
      personalApiBase: "https://orider.co.kr", aiApiBase: "https://orider-ai-api-h5zqzw3n4a-du.a.run.app",
      publicClubApiUrl: "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net/publicClubs" };
  }
  const base = BUNDLED_FUNCTIONS[environment];
  return { ...productionDataConfig(normalized), deploymentProfile: `bundled-${environment}`,
    firebaseFunctionsBase: base, socialAuthFunctionsBase: base, personalApiBase: base,
    publicClubApiUrl: `${base}/publicClubs`, aiApiBase: BUNDLED_AI[environment], useEmulators: false };
}

/** 기존 함수별 Hosting 진입점도 공통 gateway로 연결한다. 경로는 런타임의 고정 alias가 처리한다. */
export function bundledHostingConfig(source, environment) {
  if (!Object.hasOwn(BUNDLED_FUNCTIONS, environment)) throw new Error("unapproved bundled environment");
  const config = structuredClone(source);
  if (!config.hosting || Array.isArray(config.hosting) || !Array.isArray(config.hosting.rewrites)) throw new Error("unsupported Hosting configuration");
  const serviceId = environment === "development" ? "dev-bundle-default-api" : "orider-bundle-default-api";
  const aliases = new Set(["api", "stravaWebhookIngress", "ogThumbnail", "sitemap", "seoPrerender"]);
  config.hosting.rewrites = config.hosting.rewrites.map(rewrite => {
    if (rewrite.run) {
      if (!["dev-bundle-default-api", "orider-bundle-default-api"].includes(rewrite.run.serviceId)
        || rewrite.run.region !== "asia-northeast3") throw new Error("unmapped Hosting service alias");
      return { ...rewrite, run: { ...rewrite.run, serviceId } };
    }
    if (!rewrite.function) return rewrite;
    if (!aliases.has(rewrite.function.functionId)) throw new Error("unmapped Hosting function alias");
    const { function: _legacy, ...rest } = rewrite;
    return { ...rest, run: { serviceId, region: "asia-northeast3" } };
  });
  return config;
}
