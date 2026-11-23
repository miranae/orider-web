export interface RuntimeConfig {
  /** 공개 API 배포 검증 후 설정. 원본 Firestore로 폴백하지 않는다. */
  publicClubApiUrl?: string;
  firebaseApiKey?: string;
  firebaseAuthDomain?: string;
  firebaseProjectId?: string;
  firebaseStorageBucket?: string;
  firebaseMessagingSenderId?: string;
  firebaseAppId?: string;
  firebaseFunctionsRegion?: string;
  /** Stage compute endpoint; Auth and data stay on the shared FirebaseApp. */
  firebaseFunctionsBase?: string;
  /** Stage 로그인 검증만 명시적으로 정본 Auth backend에 연결한다. 기본 비활성. */
  socialAuthFunctionsBase?: string;
  appCheckRecaptchaSiteKey?: string;
  stravaClientId?: string;
  stravaRedirectUri?: string;
  segmentTilesBase?: string;
  mapboxToken?: string;
  personalApiBase?: string;
  aiApiBase?: string;
  /** 활동 구간·개인 구간 이력·기간 파워 API 배포와 검증 후 켜는 소비 스위치. 기본 꺼짐. */
  activityAnalysisExpansionEnabled?: boolean;
  publicActivityDetailEnabled?: boolean;
  activitySubscriptionsEnabled?: boolean;
  activitySubscriptionsBackendReady?: boolean;
  /** Strava 미리보기·준비 API 배포 검증 후 명시적으로 켠다. 기본 꺼짐. */
  stravaSummaryPreviewEnabled?: boolean;
  /** 배포 검증한 stage 기간 통계·존 읽기 API의 별도 스위치. */
  trainingAnalysisPeriodsEnabled?: boolean;
  coachPmcInsightEnabled?: boolean;
  coachRiderInsightEnabled?: boolean;
  coachProgressPlannerEnabled?: boolean;
  trainingDecisionEnabled?: boolean;
  /** canonical 훈련 결정(`getTrainingDecision`) 소비 전환(#886). 기본 꺼짐 — 켜기 전까지 기존 로컬 표시가 남는다. */
  trainingDecisionCanonicalEnabled?: boolean;
  trainingExecutionEnabled?: boolean;
  riderWorkoutDeliveryEnabled?: boolean;
  worldAccountSignalsEnabled?: boolean;
  coachRidePlanTokenEnabled?: boolean;
  coachRidePlanSnapshotEnabled?: boolean;
  coachRidePlanAiEnabled?: boolean;
  coachRidePlanRespondV2Enabled?: boolean;
  /** canonical 정본 API 소비 전환(#884). 서버 배포·백필 뒤에 켠다 — 기본 꺼짐. */
  canonicalConsumersEnabled?: boolean;
  /** 날씨·코스·정비 정본 소비 전환(#887). 세 면을 **따로** 켠다 — 한 면이 막혀도 나머지는 굴러간다. */
  canonicalWeatherEnabled?: boolean;
  canonicalCourseEnabled?: boolean;
  canonicalMaintenanceEnabled?: boolean;
  /** 누적 마일스톤 배지를 서버 판정으로 소비(#2237). 서버 누적 원장이 러닝 전용이라 기본 꺼짐. */
  canonicalMilestonesEnabled?: boolean;
  /**
   * 서버 전환 판정(`getCanonicalRollout`) 을 실제로 물어보는가 (#2442).
   *
   * 꺼져 있으면 서버에 묻지 않고, 화면은 빌드 플래그만으로 오늘과 똑같이 그린다 — callable 이
   * 배포되기 전에 켜면 fail-closed 가 정상 화면을 끄기 때문이다. 서버 배포 뒤에 켠다.
   */
  canonicalRolloutEnabled?: boolean;
  sentryDsn?: string;
  appEnvironment?: string;
  /** 운영 UI/계산 경로를 유지하면서 개발 실행 주소만 선택하는 배포 프로필. */
  deploymentProfile?: "production-parity-stage" | "bundled-development" | "bundled-production";
  useEmulators?: boolean;
}

let runtimeConfig: RuntimeConfig = readBuildFallbackConfig();
let runtimeLoad: Promise<RuntimeConfig> | undefined;

function readBuildFallbackConfig(): RuntimeConfig {
  const allowBuildFallback = import.meta.env.VITE_REQUIRE_BUNDLED_RUNTIME !== "true" && (
    import.meta.env.DEV ||
    import.meta.env.MODE === "test" ||
    import.meta.env.VITE_USE_EMULATORS === "true" ||
    import.meta.env.VITE_USE_BUILD_ENV_FALLBACK === "true");

  if (!allowBuildFallback) {
    return {
      appEnvironment: import.meta.env.MODE,
      useEmulators: false,
    };
  }

  return {
    publicClubApiUrl: import.meta.env.VITE_PUBLIC_CLUB_API_URL,
    firebaseApiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    firebaseAuthDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    firebaseProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    firebaseStorageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    firebaseMessagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    firebaseAppId: import.meta.env.VITE_FIREBASE_APP_ID,
    firebaseFunctionsRegion: import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION,
    firebaseFunctionsBase: import.meta.env.VITE_FIREBASE_FUNCTIONS_BASE,
    appCheckRecaptchaSiteKey: import.meta.env.VITE_APPCHECK_RECAPTCHA_SITE_KEY,
    stravaClientId: import.meta.env.VITE_STRAVA_CLIENT_ID,
    stravaRedirectUri: import.meta.env.VITE_STRAVA_REDIRECT_URI,
    segmentTilesBase: import.meta.env.VITE_SEGMENT_TILES_BASE,
    mapboxToken: import.meta.env.VITE_MAPBOX_TOKEN,
    personalApiBase: import.meta.env.VITE_ORIDER_PERSONAL_API_BASE,
    aiApiBase: import.meta.env.VITE_ORIDER_AI_API_BASE,
    activityAnalysisExpansionEnabled: import.meta.env.VITE_ACTIVITY_ANALYSIS_EXPANSION_ENABLED === "true",
    publicActivityDetailEnabled: import.meta.env.VITE_PUBLIC_ACTIVITY_DETAIL_ENABLED === "true",
    activitySubscriptionsEnabled: import.meta.env.VITE_ACTIVITY_SUBSCRIPTIONS_ENABLED === "true",
    activitySubscriptionsBackendReady: import.meta.env.VITE_ACTIVITY_SUBSCRIPTIONS_BACKEND_READY === "true",
    stravaSummaryPreviewEnabled: false,
    trainingAnalysisPeriodsEnabled: import.meta.env.VITE_TRAINING_ANALYSIS_PERIODS_ENABLED === "true",
    coachPmcInsightEnabled: import.meta.env.VITE_COACH_PMC_INSIGHT_ENABLED === "true",
    coachRiderInsightEnabled: import.meta.env.VITE_COACH_RIDER_INSIGHT_ENABLED === "true",
    coachProgressPlannerEnabled: import.meta.env.VITE_COACH_PROGRESS_PLANNER_ENABLED === "true",
    trainingDecisionEnabled: import.meta.env.VITE_TRAINING_DECISION_ENABLED === "true",
    trainingDecisionCanonicalEnabled: import.meta.env.VITE_TRAINING_DECISION_CANONICAL_ENABLED === "true",
    trainingExecutionEnabled: import.meta.env.VITE_TRAINING_EXECUTION_ENABLED === "true",
    riderWorkoutDeliveryEnabled: import.meta.env.VITE_RIDER_WORKOUT_DELIVERY_ENABLED === "true",
    worldAccountSignalsEnabled: import.meta.env.VITE_WORLD_ACCOUNT_SIGNALS_ENABLED === "true",
    coachRidePlanTokenEnabled: import.meta.env.VITE_COACH_RIDE_PLAN_TOKEN_ENABLED === "true",
    coachRidePlanSnapshotEnabled: import.meta.env.VITE_COACH_RIDE_PLAN_SNAPSHOT_ENABLED === "true",
    coachRidePlanAiEnabled: import.meta.env.VITE_COACH_RIDE_PLAN_AI_ENABLED === "true",
    coachRidePlanRespondV2Enabled: import.meta.env.VITE_COACH_RIDE_PLAN_RESPOND_V2_ENABLED === "true",
    canonicalConsumersEnabled: import.meta.env.VITE_CANONICAL_CONSUMERS_ENABLED === "true",
    canonicalWeatherEnabled: import.meta.env.VITE_CANONICAL_WEATHER === "true",
    canonicalCourseEnabled: import.meta.env.VITE_CANONICAL_COURSE === "true",
    canonicalMaintenanceEnabled: import.meta.env.VITE_CANONICAL_MAINTENANCE === "true",
    canonicalMilestonesEnabled: import.meta.env.VITE_CANONICAL_MILESTONES === "true",
    canonicalRolloutEnabled: import.meta.env.VITE_CANONICAL_ROLLOUT_ENABLED === "true",
    sentryDsn: import.meta.env.VITE_SENTRY_DSN,
    appEnvironment: import.meta.env.MODE,
    useEmulators: import.meta.env.VITE_USE_EMULATORS === "true",
  };
}

function withoutEmptyValues(config: RuntimeConfig): RuntimeConfig {
  const normalized = { ...config };
  if (Object.prototype.hasOwnProperty.call(normalized, "publicActivityDetailEnabled")) {
    normalized.publicActivityDetailEnabled = normalized.publicActivityDetailEnabled === true;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "activityAnalysisExpansionEnabled")) {
    normalized.activityAnalysisExpansionEnabled = normalized.activityAnalysisExpansionEnabled === true;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "stravaSummaryPreviewEnabled")) {
    normalized.stravaSummaryPreviewEnabled = normalized.stravaSummaryPreviewEnabled === true;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "trainingAnalysisPeriodsEnabled")) {
    normalized.trainingAnalysisPeriodsEnabled = normalized.trainingAnalysisPeriodsEnabled === true;
  }
  return Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => value !== undefined && value !== ""),
  ) as RuntimeConfig;
}

async function fetchRuntimeConfig(): Promise<RuntimeConfig> {
  const requireBundled = import.meta.env.VITE_REQUIRE_BUNDLED_RUNTIME === "true";
  if (typeof window === "undefined") {
    if (requireBundled) throw new Error("bundled/runtime-config-browser-required");
    return runtimeConfig;
  }

  let response: Response;
  try {
    response = await fetch(`/runtime-config.json?v=${Date.now()}`, {
      cache: "no-store", credentials: "same-origin",
    });
  } catch (error) {
    if (requireBundled) throw Object.assign(new Error("bundled/runtime-config-network"), { cause: error });
    return runtimeConfig;
  }
  if (!response.ok) {
    if (requireBundled) throw new Error(`bundled/runtime-config-http-${response.status}`);
    return runtimeConfig;
  }

  let remote: RuntimeConfig;
  try {
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("Expected a runtime config object");
    remote = withoutEmptyValues(payload as RuntimeConfig);
  } catch (error) {
    if (requireBundled) throw Object.assign(new Error("bundled/runtime-config-json"), { cause: error instanceof Error ? error.name : undefined });
    const diagnostic = new Error("legacy/runtime-config-json");
    void import("./sentry").then(({ captureError }) => {
      captureError(diagnostic, { tags: { source: "runtime-config" } });
    }).catch(() => {
      // eslint-disable-next-line no-console -- the telemetry module may be unavailable at startup.
      console.warn(diagnostic.message);
    });
    return runtimeConfig;
  }
  if (requireBundled && !bundledFunctionsBase(remote)) throw new Error("bundled/runtime-config-profile");
  runtimeConfig = { ...runtimeConfig, ...remote };
  return runtimeConfig;
}

export function loadRuntimeConfig(): Promise<RuntimeConfig> {
  return runtimeLoad ??= fetchRuntimeConfig();
}

export function getRuntimeConfig(): RuntimeConfig {
  return runtimeConfig;
}

export function isEmulatorRuntime(): boolean {
  return getRuntimeConfig().useEmulators === true;
}

export function resetRuntimeConfigForTests(config: RuntimeConfig = {}): void {
  runtimeConfig = { ...readBuildFallbackConfig(), ...withoutEmptyValues(config) };
  runtimeLoad = undefined;
}

export const STAGE_PARITY_GATEWAY = "https://stage-parity-default-818364001341.asia-northeast3.run.app";
export const STAGE_PARITY_AI = "https://stage-parity-ai-818364001341.asia-northeast3.run.app";
export function isStageParityRuntime(config: RuntimeConfig = getRuntimeConfig()): boolean {
  return config.appEnvironment === "production" && config.deploymentProfile === "production-parity-stage"
    && config.firebaseFunctionsBase === STAGE_PARITY_GATEWAY;
}
/** 업무 기능은 appEnvironment를 계속 사용하고 실행 클라이언트만 이 프로필을 따른다. */
export function isStageComputeRuntime(config: RuntimeConfig = getRuntimeConfig()): boolean {
  return config.appEnvironment === "stage" || isStageParityRuntime(config);
}

export const BUNDLED_AI_BASES = {
  development: "https://dev-bundle-ai-api-818364001341.asia-northeast3.run.app",
  production: "https://orider-ai-api-h5zqzw3n4a-du.a.run.app",
} as const;
export const BUNDLED_FUNCTIONS_BASES = {
  development: "https://dev-bundle-default-api-818364001341.asia-northeast3.run.app",
  production: "https://orider-bundle-default-api-289663940841.asia-northeast3.run.app",
} as const;

/** 검증한 공통 라우팅을 환경 주소만 바꿔 사용한다. 잘못된 설정은 리전 함수로 폴백하지 않는다. */
export function bundledFunctionsBase(config: RuntimeConfig = getRuntimeConfig()): string | undefined {
  if (config.deploymentProfile === undefined || config.deploymentProfile === "production-parity-stage") return undefined;
  if (config.deploymentProfile !== "bundled-development" && config.deploymentProfile !== "bundled-production") throw new Error("bundled/unknown-profile");
  const environment = config.deploymentProfile === "bundled-development" ? "development" : "production";
  const base = BUNDLED_FUNCTIONS_BASES[environment];
  if (config.appEnvironment !== "production" || config.firebaseFunctionsBase !== base
    || config.socialAuthFunctionsBase !== base || config.personalApiBase !== base || config.aiApiBase !== BUNDLED_AI_BASES[environment]
    || config.publicClubApiUrl !== `${base}/publicClubs` || config.firebaseProjectId !== "miranae-orider-g1"
    || config.firebaseFunctionsRegion !== "asia-northeast3" || config.useEmulators === true) {
    throw new Error("bundled/transport-profile-mismatch");
  }
  return base;
}

/** SDK 실행 주소 선택에만 사용한다. 분석 전용 QA 허용 범위를 넓히지 않는다. */
export function isFunctionsGatewayRuntime(config: RuntimeConfig = getRuntimeConfig()): boolean {
  return bundledFunctionsBase(config) !== undefined || isStageComputeRuntime(config);
}

/** Shared data is intentional; analysis stays isolated and Auth needs an explicit reviewed exception. */
export function assertIsolatedStageRuntime(config: RuntimeConfig, hostname = globalThis.location?.hostname, origin = globalThis.location?.origin): void {
  const bundled = bundledFunctionsBase(config);
  if (bundled) {
    const development = config.deploymentProfile === "bundled-development";
    const allowed = development ? ["orider-dev.web.app", "orider-dev.firebaseapp.com"]
      : ["orider.co.kr", "www.orider.co.kr", "miranae-orider-g1.web.app", "miranae-orider-g1.firebaseapp.com"];
    if (!hostname || !allowed.includes(hostname) || origin !== `https://${hostname}`
      || config.firebaseAuthDomain !== "miranae-orider-g1.firebaseapp.com"
      || !/^miranae-orider-g1\.(?:firebasestorage\.app|appspot\.com)$/.test(config.firebaseStorageBucket ?? "")
      || config.firebaseAppId !== "1:289663940841:web:ba08cdae154286e6499878"
      || config.firebaseMessagingSenderId !== "289663940841") throw new Error("bundled/execution-identity-mismatch");
    return;
  }
  const developmentHost = hostname === "orider-dev.web.app" || hostname === "orider-dev.firebaseapp.com";
  const parity = isStageParityRuntime(config);
  if (config.deploymentProfile !== undefined && (!parity || !developmentHost || origin !== `https://${hostname}`)) {
    throw new Error("stage/parity-profile-mismatch");
  }
  if (developmentHost && config.appEnvironment === "production") {
    if (origin !== `https://${hostname}` || config.firebaseProjectId !== "miranae-orider-g1"
      || config.firebaseAuthDomain !== "miranae-orider-g1.firebaseapp.com"
      || !/^miranae-orider-g1\.(?:firebasestorage\.app|appspot\.com)$/.test(config.firebaseStorageBucket ?? "")
      || config.firebaseAppId !== "1:289663940841:web:ba08cdae154286e6499878"
      || config.firebaseMessagingSenderId !== "289663940841" || config.firebaseFunctionsRegion !== "asia-northeast3"
      || config.useEmulators === true
      || (parity ? config.socialAuthFunctionsBase !== "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net" : Boolean(config.socialAuthFunctionsBase))
      || (parity ? config.firebaseFunctionsBase !== STAGE_PARITY_GATEWAY : config.firebaseFunctionsBase && config.firebaseFunctionsBase !== "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net")
      || config.personalApiBase !== (parity ? STAGE_PARITY_GATEWAY : "https://orider.co.kr")
      || config.aiApiBase !== (parity ? STAGE_PARITY_AI : "https://orider-ai-api-h5zqzw3n4a-du.a.run.app")
      || parity && config.publicClubApiUrl !== `${STAGE_PARITY_GATEWAY}/publicClubs`
      || parity && config.stravaRedirectUri !== "https://orider-strava.web.app/strava/callback") throw new Error("development/production-data-profile-mismatch");
    return;
  }
  if (config.socialAuthFunctionsBase && (config.appEnvironment !== "stage" || origin !== "https://orider-dev.web.app"
    || config.socialAuthFunctionsBase !== "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net")) {
    throw new Error("stage/social-auth-endpoint-mismatch");
  }
  if (config.appEnvironment !== "stage" && hostname !== "orider-dev.web.app" && hostname !== "orider-dev.firebaseapp.com") return;
  if (config.appEnvironment !== "stage" || config.firebaseProjectId !== "miranae-orider-g1"
    || config.firebaseAuthDomain !== "miranae-orider-g1.firebaseapp.com"
    || !/^miranae-orider-g1\.(?:firebasestorage\.app|appspot\.com)$/.test(config.firebaseStorageBucket ?? "")
    || config.firebaseAppId !== "1:289663940841:web:ba08cdae154286e6499878"
    || config.firebaseMessagingSenderId !== "289663940841" || config.firebaseFunctionsRegion !== "asia-northeast3"
    || config.useEmulators === true) throw new Error("stage/firebase-identity-mismatch");
  if (config.firebaseFunctionsBase !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("stage/callable-endpoint-mismatch");
  for (const key of ["aiApiBase", "personalApiBase", "segmentTilesBase", "stravaRedirectUri"] as const) {
    if (!config[key]) continue;
    const url = new URL(config[key]);
    const isolated = ["orider-dev.web.app", "orider-dev.firebaseapp.com", "asia-northeast3-orider-dev.cloudfunctions.net"].includes(url.hostname)
      || (key === "personalApiBase" && url.origin === "https://qapersonalapi-ldfyfyx5da-du.a.run.app")
      || (key === "aiApiBase" && url.origin === "https://orider-ai-api-qa-firstpass-ldfyfyx5da-du.a.run.app")
      || (key === "segmentTilesBase" && url.hostname === "storage.googleapis.com" && /^\/miranae-orider-g1\.(?:firebasestorage\.app|appspot\.com)\//.test(url.pathname));
    if (url.protocol !== "https:" || !isolated || url.username || url.password) throw new Error(`stage/service-origin-mismatch:${key}`);
  }
}
