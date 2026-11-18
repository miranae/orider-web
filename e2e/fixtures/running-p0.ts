import { createTestUser, signInUser } from "./auth";
import { writeRunningFixtureDocuments } from "./running-parity";

// 러닝 P0 기록 형태 픽스처. 실제 워치 기록에서는 "어떤 필드가 비고 어떤 상태가 붙는지"만 가져왔다.
// 지표 값은 합성 표본(좌표·계정·실제 기록 값 없음)을 서버 정본 계산(g1-web dev b4b3bfdd,
// computeActivityMetrics)에 넣어 얻었다. 반올림하지 않는다(표시 페이스가 1초 달라진다).
// 필드는 runningPublicMetrics 와 같은 범위만 남겼고(runMetrics 의 paceZoneAnalysis·paceCurve 제외),
// inputCoverage·inputPending·sourceLayer 는 지표 저장기가 앱 원본 파트 입력에 붙이는 값이다.
// 홈 피드 회귀를 바꾸지 않도록 본인 비공개 기록으로 넣고, 소유자 화면에서 확인한다.
export const RUNNING_P0_EMAIL = "running-p0-owner@example.test";
export const RUNNING_P0_PASSWORD = "Synthetic-running-p0-2026!";

export const RUNNING_P0_CASES = {
  timerHold: {
    id: "running-p0-timer-hold", title: "러닝 타이머 불일치 보류 픽스처",
    summary: {
      distance: 1200, ridingTimeMillis: 400000, movingTimeSec: 400, pauseTimeSec: 20, averageSpeed: 10.8, maxSpeed: 10.29,
      averageCadence: 176, maxCadence: 178, averageHeartRate: 148, maxHeartRate: 152, averagePower: null, maxPower: null,
      normalizedPower: null, relativeEffort: null, elevationGain: 0, calories: 67,
    },
    metrics: {
      version: 42, isVirtualPower: false, discipline: "run", activityType: "Run", algorithmVersion: "activity-metrics@42",
      distanceKm: 1.2, distanceSource: "recorded_summary", durationSec: 420, movingTimeSec: 400, pauseTimeSec: 20,
      elevationGainM: 0, elevationLossM: 0, avgSpeedKph: 10.8, maxSpeedKph: 10.285200000000001, avgPower: null, maxPower: null,
      avgHr: 148, maxHr: 152, avgCadence: 176, maxCadence: 178, cadenceUnit: "spm", caloriesKcal: 67,
      hrZoneSec: [0, 0, 333.49168646080875, 66.5083135391924, 0],
      decoupling: { ef: 0.01927744654934762, decouplingPct: null, hrDriftPct: null, basis: "speed_hr" },
      trimp: 11.235310998957992,
      runMetrics: {
        gapAvgSec: null, splitTimeBasis: "observed_moving", splitTimeStatus: "native_timer_mismatch", splitMovingTimeSec: 420,
        distanceRecords: { "1km": 350 },
      },
      splits: [], inputCoverage: "complete", inputPending: false, sourceLayer: "raw_parts",
    },
  },
  underOneKm: {
    id: "running-p0-under-1km", title: "러닝 1km 미만 픽스처",
    summary: {
      distance: 300, ridingTimeMillis: 126000, movingTimeSec: 126, pauseTimeSec: 0, averageSpeed: 8.57, maxSpeed: 8.57,
      averageCadence: 168, maxCadence: 168, averageHeartRate: 146, maxHeartRate: 162, averagePower: null, maxPower: null,
      normalizedPower: null, relativeEffort: null, elevationGain: 13, calories: 21,
    },
    metrics: {
      version: 42, isVirtualPower: false, discipline: "run", activityType: "Run", algorithmVersion: "activity-metrics@42",
      distanceKm: 0.3, distanceSource: "recorded_summary", durationSec: 126, movingTimeSec: 126, pauseTimeSec: 0,
      elevationGainM: 12.6, elevationLossM: 0, avgSpeedKph: 8.571428571428571, maxSpeedKph: 8.5716, avgPower: null,
      maxPower: null, avgHr: 146, maxHr: 162, avgCadence: 168, maxCadence: 168, cadenceUnit: "spm", caloriesKcal: 21,
      hrZoneSec: [0, 9.921259842519685, 75.40157480314971, 40.677165354330754, 0],
      decoupling: { ef: 0.016322303789269105, decouplingPct: null, hrDriftPct: null, basis: "speed_hr" },
      trimp: 3.256556842982233,
      runMetrics: { gapAvgSec: 322.1521969975558, splitTimeBasis: "observed_moving", splitTimeStatus: "available", splitMovingTimeSec: 126 },
      splits: [], inputCoverage: "complete", inputPending: false, sourceLayer: "raw_parts",
    },
  },
  sparseDistance: {
    id: "running-p0-sparse-distance", title: "러닝 거리 끊김 픽스처",
    summary: {
      distance: 3000, ridingTimeMillis: 1050000, movingTimeSec: 1050, pauseTimeSec: 0, averageSpeed: 10.29, maxSpeed: 10.29,
      averageCadence: 178, maxCadence: 180, averageHeartRate: 150, maxHeartRate: 155, averagePower: null, maxPower: null,
      normalizedPower: null, relativeEffort: null, elevationGain: 0, calories: 175,
    },
    metrics: {
      version: 42, isVirtualPower: false, discipline: "run", activityType: "Run", algorithmVersion: "activity-metrics@42",
      distanceKm: 3, distanceSource: "recorded_summary", durationSec: 1050, movingTimeSec: 1050, pauseTimeSec: 0,
      elevationGainM: 0, elevationLossM: 0, avgSpeedKph: 10.285714285714286, maxSpeedKph: 10.285200000000001, avgPower: null,
      maxPower: null, avgHr: 150, maxHr: 155, avgCadence: 178, maxCadence: 180, cadenceUnit: "spm", caloriesKcal: 175,
      hrZoneSec: [0, 0, 609.4196003805981, 440.58039961941404, 0],
      decoupling: { ef: 0.019033748106264552, decouplingPct: -0.3034573826483306, hrDriftPct: -0.3025393047926072, basis: "speed_hr" },
      trimp: 29.503779366781103,
      runMetrics: { gapAvgSec: null, splitTimeBasis: "observed_moving", splitTimeStatus: "available", splitMovingTimeSec: 1050 },
      splits: [], inputCoverage: "complete", inputPending: false, sourceLayer: "raw_parts",
    },
  },
  noHeartRate: {
    id: "running-p0-no-heart-rate", title: "러닝 심박 없음 픽스처",
    summary: {
      distance: 5006, ridingTimeMillis: 1650000, movingTimeSec: 1650, pauseTimeSec: 0, averageSpeed: 10.92, maxSpeed: 11.24,
      averageCadence: 180, maxCadence: 182, averageHeartRate: null, maxHeartRate: null, averagePower: null, maxPower: null,
      normalizedPower: null, relativeEffort: null, elevationGain: 20, calories: 275,
    },
    metrics: {
      version: 42, isVirtualPower: false, discipline: "run", activityType: "Run", algorithmVersion: "activity-metrics@42",
      distanceKm: 5.01, distanceSource: "recorded_summary", durationSec: 1650, movingTimeSec: 1650, pauseTimeSec: 0,
      elevationGainM: 20.1, elevationLossM: 20.2, avgSpeedKph: 10.92218181818182, maxSpeedKph: 11.2356, avgPower: null,
      maxPower: null, avgHr: null, maxHr: null, avgCadence: 180, maxCadence: 182, cadenceUnit: "spm", caloriesKcal: 275,
      hrZoneSec: [], decoupling: { ef: null, decouplingPct: null, hrDriftPct: null, basis: "hr_only" }, trimp: null,
      runMetrics: {
        gapAvgSec: 328.33516041316034, splitTimeBasis: "observed_moving", splitTimeStatus: "available", splitMovingTimeSec: 1650,
        minPaceSecPerKm: 322, paceStdDevSec: 6, distanceRecords: { "1km": 322, "5km": 1648 },
      },
      splits: [
        {
          km: 1, paceSec: 322.96774193548384, gapSec: 327.4748256406408, elevGain: 3.1999999999999993, elevLoss: 6, avgHr: null,
          avgCadence: 180.10216718266253,
        },
        {
          km: 2, paceSec: 332.1655913978495, gapSec: 330.6627029373112, elevGain: 5.800000000000001, elevLoss: 5.300000000000001,
          avgHr: null, avgCadence: 179.9069069069069,
        },
        {
          km: 3, paceSec: 334.0602150537634, gapSec: 328.62320456999987, elevGain: 6, elevLoss: 3.1999999999999993, avgHr: null,
          avgCadence: 180.10778443113773,
        },
        {
          km: 4, paceSec: 322.35483870967744, gapSec: 317.6751752542139, elevGain: 6, elevLoss: 3.5548387096774157, avgHr: null,
          avgCadence: 179.90062111801242,
        },
        {
          km: 5, paceSec: 336.2516129032258, gapSec: 337.2103961674416, elevGain: 5.079999999999988, elevLoss: 5.945161290322584,
          avgHr: null, avgCadence: 180.0952380952381,
        },
      ],
      inputCoverage: "complete", inputPending: false, sourceLayer: "raw_parts",
    },
  },
  partialKm: {
    id: "running-p0-partial-km", title: "러닝 부분 km 픽스처",
    summary: {
      distance: 5400, ridingTimeMillis: 1974000, movingTimeSec: 1974, pauseTimeSec: 0, averageSpeed: 9.85, maxSpeed: 11.16,
      averageCadence: 166, maxCadence: 178, averageHeartRate: 152, maxHeartRate: 159, averagePower: null, maxPower: null,
      normalizedPower: null, relativeEffort: null, elevationGain: 18, calories: 329,
    },
    metrics: {
      version: 42, isVirtualPower: false, discipline: "run", activityType: "Run", algorithmVersion: "activity-metrics@42",
      distanceKm: 5.4, distanceSource: "recorded_summary", durationSec: 1974, movingTimeSec: 1974, pauseTimeSec: 0,
      elevationGainM: 17.7, elevationLossM: 15.1, avgSpeedKph: 9.848024316109422, maxSpeedKph: 11.16, avgPower: null,
      maxPower: null, avgHr: 152, maxHr: 159, avgCadence: 166, maxCadence: 178, cadenceUnit: "spm", caloriesKcal: 329,
      hrZoneSec: [0, 359.8177215189858, 0, 1614.182278481001, 0],
      decoupling: { ef: 0.01805339669647791, decouplingPct: 2.2609783980708564, hrDriftPct: -0.044740488472993604, basis: "speed_hr" },
      trimp: 58.723187800173655,
      runMetrics: {
        gapAvgSec: 363.8358134314599, splitTimeBasis: "observed_moving", splitTimeStatus: "available", splitMovingTimeSec: 1974,
        minPaceSecPerKm: 356, paceStdDevSec: 15, distanceRecords: { "1km": 356, "5km": 1838 },
      },
      splits: [
        {
          km: 1, paceSec: 355.7, gapSec: 359.30785738944775, elevGain: 4, elevLoss: 6.199999999999999, avgHr: 152.05337078651687,
          avgCadence: 166.87640449438203,
        },
        {
          km: 2, paceSec: 358.4612903225806, gapSec: 346.80979452000884, elevGain: 7.700000000000003,
          elevLoss: 1.8000000000000007, avgHr: 151.68523676880224, avgCadence: 166.9693593314763,
        },
        {
          km: 3, paceSec: 361.3053763440861, gapSec: 376.2041980237673, elevGain: 0.3999999999999986, elevLoss: 8,
          avgHr: 152.3213296398892, avgCadence: 167.03047091412742,
        },
        {
          km: 4, paceSec: 364.93333333333317, gapSec: 352.4014595701451, elevGain: 7.899999999999999,
          elevLoss: 1.6399999999999935, avgHr: 151.8849315068493, avgCadence: 166.96986301369864,
        },
        {
          km: 5, paceSec: 397.16666666666674, gapSec: 397.85481060954714, elevGain: 5.556666666666661,
          elevLoss: 6.3600000000000065, avgHr: 148.61209068010075, avgCadence: 158.21662468513853,
        },
      ],
      inputCoverage: "complete", inputPending: false, sourceLayer: "raw_parts",
    },
  },
} as const;

export type RunningP0Case = (typeof RUNNING_P0_CASES)[keyof typeof RUNNING_P0_CASES];

export async function seedRunningP0(): Promise<void> {
  const now = Date.now();
  const owner = await createTestUser(RUNNING_P0_EMAIL, RUNNING_P0_PASSWORD, "러닝 P0 테스트").catch(error => {
    if (!String(error).includes("EMAIL_EXISTS")) throw error;
    return signInUser(RUNNING_P0_EMAIL, RUNNING_P0_PASSWORD);
  });
  const docs: Record<string, Record<string, unknown>> = {
    [`users/${owner.localId}`]: { nickname: "러닝 P0 테스트", email: RUNNING_P0_EMAIL, units: "metric", createdAt: now },
  };
  Object.values(RUNNING_P0_CASES).forEach((item, index) => {
    const startTime = now - (index + 1) * 86_400_000;
    const endTime = startTime + item.metrics.durationSec * 1000;
    docs[`activities/${item.id}`] = {
      userId: owner.localId, nickname: "러닝 P0 테스트", profileImage: null,
      type: "Run", source: "orider", description: item.title,
      nativeFeedMemoV1: { version: 1, userId: owner.localId, memo: item.title },
      createdAt: endTime, startTime, endTime,
      visibility: "private", deletedAt: null, thumbnailTrack: "", groupId: null,
      photoCount: 0, kudosCount: 0, commentCount: 0, segmentEffortCount: 0,
      topAchievements: [], summary: item.summary,
    };
    docs[`activity_metrics/${item.id}`] = { ...item.metrics, userId: owner.localId, startTime, computedAt: now };
  });
  await writeRunningFixtureDocuments(docs);
}
