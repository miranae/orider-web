import { productionDataConfig } from "./production-data-config.mjs";

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
