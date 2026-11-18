import { productionDataConfig, productionBuildEnv } from "./production-data-config.mjs";
import { checkIsolatedStageConfig } from "./isolated-stage-config.mjs";

export const STAGE_FUNCTIONS = "https://stage-parity-default-818364001341.asia-northeast3.run.app";
export const STAGE_PERSONAL_API = STAGE_FUNCTIONS;
export const STAGE_AI_API = "https://stage-parity-ai-818364001341.asia-northeast3.run.app";

/** 운영 기능 스위치와 공유 데이터 identity를 보존하고 실행 경로만 개발로 옮긴다. */
export function stageProductionParityConfig(source) {
  const config = {
    ...productionDataConfig(source),
    appEnvironment: "stage",
    firebaseFunctionsBase: STAGE_FUNCTIONS,
    socialAuthFunctionsBase: "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net",
    personalApiBase: STAGE_PERSONAL_API,
    aiApiBase: STAGE_AI_API,
    publicClubApiUrl: `${STAGE_FUNCTIONS}/publicClubs`,
    // 등록된 프록시는 state의 허용된 returnOrigin으로 돌려준다. 개발 도메인도 허용돼 있다.
    stravaRedirectUri: source.stravaRedirectUri,
    useEmulators: false,
  };
  checkIsolatedStageConfig(config);
  return config;
}

export function stageProductionParityBuildEnv(source) {
  const config = stageProductionParityConfig(source);
  return {
    ...productionBuildEnv(config),
    VITE_MODE: "stage",
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
