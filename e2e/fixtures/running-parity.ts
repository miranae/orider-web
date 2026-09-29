import { createTestUser, signInUser } from "./auth";

// 공개 정보 형태의 합성 회귀 픽스처. 계정·좌표·운영 문서 식별자를 포함하지 않는다.
export const RUNNING_PARITY_PROJECT = "demo-orider-running-parity";
export const RUNNING_PARITY_ID = "running-parity-public";
export const RUNNING_OWNER_ID = "running-parity-owner";
export const RUNNING_OWNER_TITLE = "본인 러닝 계획 연결 픽스처";
export const RUNNING_OWNER_EMAIL = "running-parity-owner@example.test";
export const RUNNING_OWNER_PASSWORD = "Synthetic-running-parity-2026!";
export const RUNNING_PLAN_GOAL = "running-parity-goal";
export const RUNNING_PLAN_WEEK = "week-running-parity";
export const RUNNING_PLAN_TITLE = "합성 이지 러닝";
export const RUNNING_PARITY_TITLE = "러닝 페이스 회귀 픽스처";

export const runningSummary = {
  distance: 21_022.1, ridingTimeMillis: 7_082_000,
  movingTimeSec: 7_082, pauseTimeSec: 0,
  averageSpeed: 10.6848, maxSpeed: 17.784,
  averageCadence: 191, maxCadence: 204,
  averageHeartRate: 150.6, maxHeartRate: 171,
  averagePower: 264.1, maxPower: 388, normalizedPower: null,
  elevationGain: 51, calories: 1954, relativeEffort: null,
};

export const runningPublicMetrics = {
  version: 34, discipline: "run", activityType: "Run", algorithmVersion: "activity-metrics@34",
  distanceKm: 21.02, distanceSource: "stream_counter", durationSec: 7082, movingTimeSec: 7082,
  pauseTimeSec: 0, elevationGainM: 47.9, elevationLossM: 52.9,
  avgSpeedKph: 10.6848, maxSpeedKph: 17.784,
  avgPower: 264, maxPower: 388, avgHr: 151, maxHr: 171,
  avgCadence: 191, maxCadence: 204, cadenceUnit: "spm", caloriesKcal: 1954,
  inputCoverage: "complete", sourceLayer: "inline_streams",
  hrZoneSec: [90, 112, 3313, 3558, 9],
  decoupling: { basis: "speed_hr", ef: 0.02, decouplingPct: 3.8, hrDriftPct: 8.8 },
  trimp: 145,
  runMetrics: {
    gapAvgSec: 337.29, minPaceSecPerKm: 301, paceStdDevSec: 14,
    distanceRecords: { "1km": 298, "5km": 1584, "10km": 3283 },
  },
  splits: [
    { km: 1, paceSec: 350, gapSec: 360, avgHr: 123, avgCadence: 184, elevGain: 0.4, elevLoss: 5.4 },
    { km: 2, paceSec: 347, gapSec: 357, avgHr: 139, avgCadence: 188, elevGain: 1, elevLoss: 6.2 },
    { km: 3, paceSec: 344, gapSec: 355, avgHr: 143, avgCadence: 188, elevGain: 0.2, elevLoss: 6 },
    ...Array.from({ length: 18 }, (_, index) => ({
      km: index + 4, paceSec: 332 + (index % 4) * 2, gapSec: 330 + (index % 4) * 2,
      avgHr: 146 + (index % 7), avgCadence: 190 + (index % 3), elevGain: 2, elevLoss: 1,
    })),
  ],
};

function firestoreValue(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "object") return { mapValue: { fields: firestoreFields(value as Record<string, unknown>) } };
  throw new Error("unsupported_fixture_value");
}

function firestoreFields(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, firestoreValue(value)]));
}

export async function seedRunningParity(): Promise<void> {
  // 고정 localhost 에뮬레이터에서만 합성 문서를 쓴다.
  const root = `http://127.0.0.1:8080/v1/projects/${RUNNING_PARITY_PROJECT}/databases/(default)/documents`;
  const now = Date.now();
  const owner = await createTestUser(RUNNING_OWNER_EMAIL, RUNNING_OWNER_PASSWORD, "러닝 계획 테스트").catch(error => {
    if (!String(error).includes("EMAIL_EXISTS")) throw error;
    return signInUser(RUNNING_OWNER_EMAIL, RUNNING_OWNER_PASSWORD);
  });
  const tomorrow = Math.floor((now + 9 * 3600000) / 86400000) * 86400000 - 9 * 3600000 + 86400000;

  const activity = {
    userId: "running-parity-author", nickname: "러닝 테스트", profileImage: null,
    type: "Run", source: "orider", description: RUNNING_PARITY_TITLE,
    createdAt: now, startTime: now - 7_082_000, endTime: now,
    visibility: "everyone", deletedAt: null, thumbnailTrack: "", groupId: null,
    photoCount: 0, kudosCount: 0, commentCount: 0, segmentEffortCount: 0,
    topAchievements: [], summary: runningSummary,
  };
  const docs: Record<string, Record<string, unknown>> = {
    [`activities/${RUNNING_PARITY_ID}`]: activity,
    [`activity_metrics_public/${RUNNING_PARITY_ID}`]: { ...runningPublicMetrics, startTime: activity.startTime, computedAt: now },
    "users_public/running-parity-author": { nickname: "러닝 테스트", photoURL: null },
    [`users/${owner.localId}`]: { nickname: "러닝 계획 테스트", email: RUNNING_OWNER_EMAIL, units: "metric", createdAt: now },
    [`activities/${RUNNING_OWNER_ID}`]: { ...activity, userId: owner.localId, description: RUNNING_OWNER_TITLE, visibility: "private" },
    [`activity_metrics/${RUNNING_OWNER_ID}`]: { ...runningPublicMetrics, startTime: activity.startTime, computedAt: now },
    [`goals/${RUNNING_PLAN_GOAL}`]: { userId: owner.localId, discipline: "run", status: "active", courseName: "합성 러닝 목표", courseId: null, courseDist: 10, courseElev: 0, eventType: "10k", eventDate: tomorrow + 28 * 86400000, weeklySessions: 3, createdAt: now, updatedAt: now, snapshot: { ftp: 0, weightKg: 70, ctl: 10 }, feasibility: { label: "easy" } },
    [`goals/${RUNNING_PLAN_GOAL}/plan/${RUNNING_PLAN_WEEK}`]: { weekNumber: 1, phase: "base", startDate: tomorrow, plannedTSS: 30, days: [{ date: tomorrow, dayOfWeek: new Date(tomorrow + 9 * 3600000).getUTCDay(), workout: "easyRun", workoutName: RUNNING_PLAN_TITLE, plannedDurationMin: 30, plannedTSS: 30, completed: false, skipped: false, intervals: [{ label: "WU", durationMin: 5 }, { label: "Z2", durationMin: 20 }, { label: "CD", durationMin: 5 }] }] },
  };
  for (const [path, data] of Object.entries(docs)) {
    const response = await fetch(`${root}/${path}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
      body: JSON.stringify({ fields: firestoreFields(data) }),
    });
    if (!response.ok) throw new Error(`fixture_seed_failed:${path}:${response.status}`);
  }
}
