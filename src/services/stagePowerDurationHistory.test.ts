import { beforeEach, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { historyCandidate, historyCompute, historyComputed, historyPage, historySelection, historySession } from "./stagePowerDurationHistory.testFixture";
import { computeStagePowerHistory, loadStagePowerHistoryPage, validateStagePowerHistoryCompute, validateStagePowerHistoryPage } from "./stagePowerDurationHistory";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: (...args: unknown[]) => { mocks.callable(...args); return mocks.call; } }));
const computeRequest = () => ({ ...historySelection, mode: "stage_power_duration_history_compute" as const, session: historySession, candidates: [historyCandidate()] });
const pageRequest = { ...historySelection, mode: "stage_power_duration_history_page" as const };
beforeEach(() => { mocks.call.mockReset(); mocks.callable.mockReset(); resetRuntimeConfigForTests({ appEnvironment: "stage", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net" }); });
it("accepts strict scalar discovery/compute contracts with independent weighted and origin evidence", () => {
  const page = historyPage(), computed = historyCompute();
  expect(validateStagePowerHistoryPage(page, pageRequest)).toBe(page); expect(validateStagePowerHistoryCompute(computed, computeRequest())).toBe(computed);
  const unknown = { ...historyCandidate(), sourcePowerOrigin: "stored_native_watts_unverified" as const }, response = historyCompute([historyComputed(unknown)]);
  expect(validateStagePowerHistoryCompute(response, { ...computeRequest(), candidates: [unknown] })).toBe(response);
});
it("rejects wrong scope/time/unit/counts/session/bindings/origin/receipt and false completeness", () => {
  for (const patch of [(v: any) => { v.unit = "W/kg"; }, (v: any) => { v.durationSeconds = 1; }, (v: any) => { v.collectionCompleteness = "complete"; }, (v: any) => { v.activities[0].candidateBinding = "bad"; }, (v: any) => { v.page.candidateActivityCount = 2; }, (v: any) => { v.session.expiresAt++; }, (v: any) => { v.intervals = []; }]) {
    const v = historyPage(); patch(v); expect(() => validateStagePowerHistoryPage(v, pageRequest)).toThrow();
  }
  for (const patch of [(v: any) => { v.candidates[0].candidateBinding = "a".repeat(64); }, (v: any) => { v.candidates[0].comparison.energyWattMilliseconds = "1".repeat(33); }, (v: any) => { v.candidates[0].comparison.sourcePowerOrigin = "stored_native_watts_unverified"; }, (v: any) => { v.candidates[0].result.windowEndElapsedSec = 1e308; }, (v: any) => { v.candidates[0].weightNormalized.comparison.numerator = "1"; }, (v: any) => { v.candidates[0].weightNormalized.weightRevision = "2:1"; }, (v: any) => { v.analysisCoverage.origins[0].weightCounts.includedActivityCount = 2; }, (v: any) => { v.candidates[0].result.intervals = []; }]) {
    const v = historyCompute(); patch(v); expect(() => validateStagePowerHistoryCompute(v, computeRequest())).toThrow();
  }
});
it("distinguishes real zero, missing snapshots and missing calculation weight", () => {
  const zero = historyCompute([historyComputed(undefined, 0)]); expect(validateStagePowerHistoryCompute(zero, computeRequest())).toBe(zero);
  const missingWeight = historyCompute([historyComputed(undefined, 250, null)]); expect(validateStagePowerHistoryCompute(missingWeight, computeRequest())).toBe(missingWeight);
  const row = historyComputed(); Object.assign(row, { state: "unavailable", reason: "snapshot_missing", result: null, comparison: null, sourceDigest: null }); Object.assign(row.weightNormalized!, { maxAveragePowerWPerKg: null, comparison: null });
  const missing = historyCompute([row]); expect(validateStagePowerHistoryCompute(missing, computeRequest())).toBe(missing);
});
it("issues exactly manual discovery plus compute with returned candidates, without another unit query", async () => {
  const app = {}, services = { auth: { app, currentUser: { uid: "owner", isAnonymous: false } }, functions: { app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" }, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) } as unknown as FirebaseServices;
  mocks.call.mockResolvedValueOnce({ data: historyPage() }).mockResolvedValueOnce({ data: historyCompute() });
  await loadStagePowerHistoryPage(services, "owner", pageRequest); await computeStagePowerHistory(services, "owner", computeRequest());
  expect(mocks.call).toHaveBeenCalledTimes(2); expect(mocks.call.mock.lastCall?.[0]).toEqual(computeRequest()); expect(mocks.callable.mock.calls.every(v => v[1] === "getPowerCurvePeriods")).toBe(true);
  await expect(loadStagePowerHistoryPage(services, "other", pageRequest)).rejects.toThrow("account_changed"); expect(mocks.call).toHaveBeenCalledTimes(2);
});
it("decodes actual compiled anonymous origin/weight response using reconstructed request bindings", async () => {
  const { default: actual } = await import("./stagePowerDurationHistory.actual.fixture.json");
  const value = actual.separateOriginsAndWeight.page as unknown as Parameters<typeof validateStagePowerHistoryPage>[0];
  const { unit, durationSeconds, periods, periodIndex, includeWeightNormalized } = value;
  expect(validateStagePowerHistoryPage(value, { mode: "stage_power_duration_history_page", unit, durationSeconds, periods, periodIndex, includeWeightNormalized })).toBe(value);
  for (const response of [actual.separateOriginsAndWeight.response, actual.missingWeight.response]) {
    const result = response as unknown as Parameters<typeof validateStagePowerHistoryCompute>[0];
    const keys = ["activityId", "startTime", "activityIncarnation", "activityRevision", "baseMetricsRevision", "sourcePowerOrigin", "analysisState", "snapshotState", "snapshotRevision", "candidateBinding", "physicalIdentity"];
    const candidates = result.candidates.map(row => Object.fromEntries(keys.map(key => [key, row[key as keyof typeof row]]))) as unknown as Parameters<typeof validateStagePowerHistoryCompute>[1]["candidates"];
    expect(validateStagePowerHistoryCompute(result, { mode: "stage_power_duration_history_compute", unit: result.unit, durationSeconds: result.durationSeconds, periods: result.periods, periodIndex: result.periodIndex, includeWeightNormalized: result.includeWeightNormalized, session: result.session, candidates })).toBe(result);
  }
});
it("rejects future/coerced origins, malformed computed timestamps and inconsistent continuous windows", () => {
  for (const patch of [(v: any) => { v.candidates[0].sourcePowerOrigin = ["measured"]; }, (v: any) => { v.candidates[0].result.powerSource = "future"; }, (v: any) => { v.candidates[0].weightNormalized.computedAt = 1e308; }, (v: any) => { v.candidates[0].weightNormalized.computedAt = 1.5; }, (v: any) => { v.candidates[0].result.longestContinuousSeconds = 1; }]) {
    const response = historyCompute(); patch(response); expect(() => validateStagePowerHistoryCompute(response, computeRequest())).toThrow();
  }
});
it("rejects contradictory displayed W/Wkg while preserving exact ranking receipts from actual compiled fixtures", async () => {
  const { default: actual } = await import("./stagePowerDurationHistory.actual.fixture.json");
  const value = structuredClone(actual.separateOriginsAndWeight.response) as unknown as Parameters<typeof validateStagePowerHistoryCompute>[0];
  const keys = ["activityId", "startTime", "activityIncarnation", "activityRevision", "baseMetricsRevision", "sourcePowerOrigin", "analysisState", "snapshotState", "snapshotRevision", "candidateBinding", "physicalIdentity"];
  const request = { mode: "stage_power_duration_history_compute" as const, unit: value.unit, durationSeconds: value.durationSeconds, periods: value.periods, periodIndex: value.periodIndex, includeWeightNormalized: value.includeWeightNormalized, session: value.session, candidates: value.candidates.map(row => Object.fromEntries(keys.map(k => [k,row[k as keyof typeof row]]))) as unknown as Parameters<typeof validateStagePowerHistoryCompute>[1]["candidates"] };
  for (const patch of [(v: any) => { v.candidates[0].result.maxAveragePowerW = 0; v.candidates[0].weightNormalized.maxAveragePowerWPerKg = 0; }, (v: any) => { v.candidates[0].result.maxAveragePowerW += 1; v.candidates[0].weightNormalized.maxAveragePowerWPerKg = v.candidates[0].result.maxAveragePowerW / v.candidates[0].weightNormalized.weightKg; }]) {
    const changed = structuredClone(value); patch(changed); expect(() => validateStagePowerHistoryCompute(changed, request)).toThrow();
  }
  expect(validateStagePowerHistoryCompute(value, request)).toBe(value);
});
