import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import type { TrainingAnalysisHistoryRequest } from "@shared/types/training-analysis-history";
import { historyNow, historyPage, historyRequest, historyRow } from "./trainingAnalysisHistory.fixture";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
import { loadTrainingAnalysisHistory, validateTrainingAnalysisHistoryResponse, validTrainingAnalysisHistoryRequest, validHistoryDocumentId } from "./trainingAnalysisHistory";
const mocks = vi.hoisted(() => ({ callable: vi.fn(), call: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: mocks.callable }));
const stage = { appEnvironment: "stage", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net", trainingAnalysisPeriodsEnabled: true };
beforeEach(() => { vi.restoreAllMocks(); vi.spyOn(Date, "now").mockReturnValue(historyNow); resetRuntimeConfigForTests(stage); mocks.call.mockReset().mockResolvedValue({ data: historyPage() }); mocks.callable.mockReset().mockReturnValue(mocks.call); });
describe("manual annual history contract", () => {
  it("accepts first null-cursor and a fixed sequential snapshot including empty run pages", () => {
    const first = historyPage([], false);
    expect(validateTrainingAnalysisHistoryResponse(first, historyRequest, historyNow)).toEqual(first);
    const request = { ...historyRequest, cursor: first.page.nextCursor! };
    const next = historyPage([historyRow("later", 50000)]);
    expect(validateTrainingAnalysisHistoryResponse(next, request, historyNow)).toEqual(next);
  });
  it.each([
    (r: ReturnType<typeof historyPage>) => { r.version = 2 as 1; },
    (r: ReturnType<typeof historyPage>) => { r.year--; },
    (r: ReturnType<typeof historyPage>) => { r.readTime.nanoseconds = 1; },
    (r: ReturnType<typeof historyPage>) => { r.range.fromInclusive++; },
    (r: ReturnType<typeof historyPage>) => { r.expiresAt++; },
    (r: ReturnType<typeof historyPage>) => { r.page.candidateActivityCount++; },
    (r: ReturnType<typeof historyPage>) => { r.activities[0]!.representativeInput.movingSec = NaN; },
    (r: ReturnType<typeof historyPage>) => { r.activities[0]!.analysis.inputCoverage = "pending"; },
    (r: ReturnType<typeof historyPage>) => { r.activities[0]!.distanceRecords.points[0]!.elapsedSec = -1; },
    (r: ReturnType<typeof historyPage>) => { r.activities[0]!.paceCurve.value!.points[0]!.speedKph = 12; },
    (r: ReturnType<typeof historyPage>) => { r.activities[0]!.paceCurve.value!.points[0]!.durationSeconds = 999; },
  ])("strictly rejects malformed rows and old responses (%#)", mutate => {
    const page = historyPage(); mutate(page);
    expect(() => validateTrainingAnalysisHistoryResponse(page, historyRequest, historyNow)).toThrow();
  });
  it("rejects broken cursors, binding changes, unordered/replayed rows and snapshots", () => {
    const first = historyPage([], false), request = { ...historyRequest, cursor: first.page.nextCursor! };
    for (const mutate of [
      (r: ReturnType<typeof historyPage>) => { r.readTime.seconds--; },
      (r: ReturnType<typeof historyPage>) => { r.page.nextCursor!.requestBinding = "b".repeat(64); },
      (r: ReturnType<typeof historyPage>) => { r.page.nextCursor!.after = { ...request.cursor.after }; },
      (r: ReturnType<typeof historyPage>) => { r.activities = [historyRow("replay")]; },
    ]) {
      const page = historyPage([historyRow("later", 50000)], false, 50000); mutate(page);
      expect(() => validateTrainingAnalysisHistoryResponse(page, request, historyNow)).toThrow();
    }
    expect(() => validateTrainingAnalysisHistoryResponse({ version: 1, periods: [] }, historyRequest, historyNow)).toThrow();
    expect(() => validateTrainingAnalysisHistoryResponse(first, historyRequest, first.expiresAt)).toThrow("history_snapshot_expired");
  });
  it.each([180, 7200])("rejects legacy duration %s while retaining that canonical running duration and slow pace", duration => {
    const legacy = historyPage(); legacy.activities[0]!.paceCurve.value = { sourceBasis: "speed_curve_kmh_converted", unit: "sec_per_km", points: [{ durationSeconds: duration, paceSecPerKm: 600, speedKph: 6 }] };
    expect(() => validateTrainingAnalysisHistoryResponse(legacy, historyRequest, historyNow)).toThrow();
    const canonical = historyPage(); canonical.activities[0]!.paceCurve.value!.points[0] = { durationSeconds: duration, paceSecPerKm: 750, speedKph: null };
    expect(validateTrainingAnalysisHistoryResponse(canonical, historyRequest, historyNow)).toEqual(canonical);
  });
  it("enforces the legacy 5km/h threshold without excluding canonical slow running", () => {
    const legacy = historyPage(); legacy.activities[0]!.paceCurve.value = { sourceBasis: "speed_curve_kmh_converted", unit: "sec_per_km", points: [{ durationSeconds: 300, paceSecPerKm: 900, speedKph: 4 }] };
    expect(() => validateTrainingAnalysisHistoryResponse(legacy, historyRequest, historyNow)).toThrow();
    legacy.activities[0]!.paceCurve.value!.points[0] = { durationSeconds: 300, paceSecPerKm: 720, speedKph: 5 };
    expect(validateTrainingAnalysisHistoryResponse(legacy, historyRequest, historyNow)).toEqual(legacy);
  });
  it("requires a prior sentinel to yield at least one scanned continuation and an all-run tail to match its cursor", () => {
    const first = historyPage([], false), request = { ...historyRequest, cursor: first.page.nextCursor! };
    expect(() => validateTrainingAnalysisHistoryResponse(historyPage([]), request, historyNow)).toThrow();
    const page = historyPage(Array.from({ length: 50 }, (_, i) => historyRow(`run-${String(i).padStart(2, "0")}`, i * 1000)), false);
    expect(() => validateTrainingAnalysisHistoryResponse(page, historyRequest, historyNow)).toThrow();
    page.page.nextCursor!.after = { startTime: page.activities[49]!.startTime, activityId: page.activities[49]!.activityId };
    expect(validateTrainingAnalysisHistoryResponse(page, historyRequest, historyNow)).toEqual(page);
  });
  it("accepts a fractional non-running scan cursor and legal UTF-8 document IDs", () => {
    const page = historyPage([], false);
    page.page.nextCursor!.after = { startTime: page.range.fromInclusive + .5, activityId: "걷기기록😀" };
    expect(validateTrainingAnalysisHistoryResponse(page, historyRequest, historyNow)).toEqual(page);
    expect(validTrainingAnalysisHistoryRequest({ ...historyRequest, cursor: page.page.nextCursor! }, historyNow)).toBe(true);
    const unicode = historyPage([historyRow("\uE000"), historyRow("😀")]);
    expect(validateTrainingAnalysisHistoryResponse(unicode, historyRequest, historyNow)).toEqual(unicode);
    unicode.activities.reverse(); expect(() => validateTrainingAnalysisHistoryResponse(unicode, historyRequest, historyNow)).toThrow();
    expect(validHistoryDocumentId("한".repeat(500))).toBe(true);
    for (const id of ["한".repeat(501), "a/b", ".", "..", "__reserved__", "__reserved\nline__", "\uD800", ""]) expect(validHistoryDocumentId(id)).toBe(false);
  });
  it("validates year, cursor timestamps, future scope and expiry before transport", () => {
    for (const request of [{ ...historyRequest, year: 1971 }, { ...historyRequest, year: 2027 }, { ...historyRequest, cursor: null }]) expect(validTrainingAnalysisHistoryRequest(request as TrainingAnalysisHistoryRequest, historyNow)).toBe(false);
    const cursor = historyPage([], false).page.nextCursor!;
    expect(validTrainingAnalysisHistoryRequest({ ...historyRequest, cursor }, historyNow)).toBe(true);
    expect(validTrainingAnalysisHistoryRequest({ ...historyRequest, cursor }, historyNow + 1800000)).toBe(false);
  });
  it("performs one owner-bound stage callable and no production transport", async () => {
    const app = {}, auth = { app, currentUser: { uid: "owner", isAnonymous: false } };
    const services = { auth, functions: { app, customDomain: stage.firebaseFunctionsBase }, ensureAppCheckReady: vi.fn(async () => {}) } as unknown as FirebaseServices;
    await expect(loadTrainingAnalysisHistory(services, "owner", historyRequest)).resolves.toEqual(historyPage());
    expect(mocks.callable).toHaveBeenCalledWith(services.functions, "getTrainingAnalysisPeriods"); expect(mocks.call).toHaveBeenCalledTimes(1);
    resetRuntimeConfigForTests({ ...stage, appEnvironment: "production" });
    await expect(loadTrainingAnalysisHistory(services, "owner", historyRequest)).rejects.toThrow("api_unavailable");
    resetRuntimeConfigForTests(stage); auth.currentUser.uid = "foreign";
    await expect(loadTrainingAnalysisHistory(services, "owner", historyRequest)).rejects.toThrow("account_changed");
    expect(mocks.call).toHaveBeenCalledTimes(1);
  });
});

it("requires opt-in for strict expanded row states while accepting absent old-server channels", () => {
  const page = historyPage(), query = { ...historyRequest, includeExpandedRunDistances: true as const };
  expect(validateTrainingAnalysisHistoryResponse(page, query, historyNow)).toBe(page);
  page.activities[0]!.expandedDistanceRecords = { version: 1, targetsVersion: 2, timingBasis: "elapsed_including_stops", state: "observed", points: [{ distance: "400m", elapsedSec: 90 }] };
  expect(() => validateTrainingAnalysisHistoryResponse(page, historyRequest, historyNow)).toThrow();
  expect(validateTrainingAnalysisHistoryResponse(page, query, historyNow)).toBe(page);
  page.activities[0]!.expandedDistanceRecords!.points.push({ distance: "400m", elapsedSec: 91 });
  expect(() => validateTrainingAnalysisHistoryResponse(page, query, historyNow)).toThrow();
  page.activities[0]!.expandedDistanceRecords = { version: 1, targetsVersion: 2, timingBasis: "elapsed_including_stops", state: "legacy_unsupported", points: [] };
  expect(validateTrainingAnalysisHistoryResponse(page, query, historyNow)).toBe(page);
  page.activities[0]!.expandedDistanceRecords!.state = "no_observed_efforts";
  expect(validateTrainingAnalysisHistoryResponse(page, query, historyNow)).toBe(page);
});


it.each([34, 35, 36])("preserves compatible ready history snapshots across calculator upgrades: v%s", version => {
  const data = historyPage();
  data.activities[0]!.analysis.calculatorVersion = version;
  expect(validateTrainingAnalysisHistoryResponse(data, historyRequest, historyNow)).toEqual(data);
  data.activities[0]!.analysis.calculatorVersion = 33;
  expect(() => validateTrainingAnalysisHistoryResponse(data, historyRequest, historyNow)).toThrow();
});
