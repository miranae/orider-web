export interface RuntimeConfig {
  firebaseApiKey?: string;
  firebaseAuthDomain?: string;
  firebaseProjectId?: string;
  firebaseStorageBucket?: string;
  firebaseMessagingSenderId?: string;
  firebaseAppId?: string;
  firebaseFunctionsRegion?: string;
  appCheckRecaptchaSiteKey?: string;
  stravaClientId?: string;
  stravaRedirectUri?: string;
  segmentTilesBase?: string;
  heatmapBase?: string;
  mapboxToken?: string;
  personalApiBase?: string;
  aiApiBase?: string;
  coachPmcInsightEnabled?: boolean;
  coachRiderInsightEnabled?: boolean;
  coachProgressPlannerEnabled?: boolean;
  trainingDecisionEnabled?: boolean;
  trainingExecutionEnabled?: boolean;
  riderWorkoutDeliveryEnabled?: boolean;
  coachRidePlanTokenEnabled?: boolean;
  coachRidePlanSnapshotEnabled?: boolean;
  coachRidePlanAiEnabled?: boolean;
  coachRidePlanRespondV2Enabled?: boolean;
  sentryDsn?: string;
  appEnvironment?: string;
  useEmulators?: boolean;
}

let runtimeConfig: RuntimeConfig = readBuildFallbackConfig();
let loaded = false;

function readBuildFallbackConfig(): RuntimeConfig {
  const allowBuildFallback =
    import.meta.env.DEV ||
    import.meta.env.MODE === "test" ||
    import.meta.env.VITE_USE_EMULATORS === "true" ||
    import.meta.env.VITE_USE_BUILD_ENV_FALLBACK === "true";

  if (!allowBuildFallback) {
    return {
      appEnvironment: import.meta.env.MODE,
      useEmulators: false,
    };
  }

  return {
    firebaseApiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    firebaseAuthDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    firebaseProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    firebaseStorageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    firebaseMessagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    firebaseAppId: import.meta.env.VITE_FIREBASE_APP_ID,
    firebaseFunctionsRegion: import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION,
    appCheckRecaptchaSiteKey: import.meta.env.VITE_APPCHECK_RECAPTCHA_SITE_KEY,
    stravaClientId: import.meta.env.VITE_STRAVA_CLIENT_ID,
    stravaRedirectUri: import.meta.env.VITE_STRAVA_REDIRECT_URI,
    segmentTilesBase: import.meta.env.VITE_SEGMENT_TILES_BASE,
    heatmapBase: import.meta.env.VITE_HEATMAP_BASE,
    mapboxToken: import.meta.env.VITE_MAPBOX_TOKEN,
    personalApiBase: import.meta.env.VITE_ORIDER_PERSONAL_API_BASE,
    aiApiBase: import.meta.env.VITE_ORIDER_AI_API_BASE,
    coachPmcInsightEnabled: import.meta.env.VITE_COACH_PMC_INSIGHT_ENABLED === "true",
    coachRiderInsightEnabled: import.meta.env.VITE_COACH_RIDER_INSIGHT_ENABLED === "true",
    coachProgressPlannerEnabled: import.meta.env.VITE_COACH_PROGRESS_PLANNER_ENABLED === "true",
    trainingDecisionEnabled: import.meta.env.VITE_TRAINING_DECISION_ENABLED === "true",
    trainingExecutionEnabled: import.meta.env.VITE_TRAINING_EXECUTION_ENABLED === "true",
    riderWorkoutDeliveryEnabled: import.meta.env.VITE_RIDER_WORKOUT_DELIVERY_ENABLED === "true",
    coachRidePlanTokenEnabled: import.meta.env.VITE_COACH_RIDE_PLAN_TOKEN_ENABLED === "true",
    coachRidePlanSnapshotEnabled: import.meta.env.VITE_COACH_RIDE_PLAN_SNAPSHOT_ENABLED === "true",
    coachRidePlanAiEnabled: import.meta.env.VITE_COACH_RIDE_PLAN_AI_ENABLED === "true",
    coachRidePlanRespondV2Enabled: import.meta.env.VITE_COACH_RIDE_PLAN_RESPOND_V2_ENABLED === "true",
    sentryDsn: import.meta.env.VITE_SENTRY_DSN,
    appEnvironment: import.meta.env.MODE,
    useEmulators: import.meta.env.VITE_USE_EMULATORS === "true",
  };
}

function withoutEmptyValues(config: RuntimeConfig): RuntimeConfig {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined && value !== ""),
  ) as RuntimeConfig;
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (loaded) return runtimeConfig;
  loaded = true;

  if (typeof window === "undefined") return runtimeConfig;

  try {
    const response = await fetch(`/runtime-config.json?v=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return runtimeConfig;

    const remote = withoutEmptyValues((await response.json()) as RuntimeConfig);
    runtimeConfig = { ...runtimeConfig, ...remote };
  } catch {
    // Local dev and tests may not provide runtime-config.json; Vite env fallback remains.
  }

  return runtimeConfig;
}

export function getRuntimeConfig(): RuntimeConfig {
  return runtimeConfig;
}

export function isEmulatorRuntime(): boolean {
  return getRuntimeConfig().useEmulators === true;
}

export function resetRuntimeConfigForTests(config: RuntimeConfig = {}): void {
  runtimeConfig = { ...readBuildFallbackConfig(), ...withoutEmptyValues(config) };
  loaded = false;
}
