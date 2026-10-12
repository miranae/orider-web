import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrainingAnalysisPeriodsRequest, TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import wire from "./stageRunTimeCorrections.fixture.json";
import { validateTrainingAnalysisPeriodsResponse, validTrainingAnalysisPeriodsRequest } from "./trainingAnalysisPeriods";
import { formatReportedRunTime, parseReportedRunTime, validRunEffortStageMutation, validateRunEffortStageMutationResponse, verifyRunTimeResponseDigests, verifyRunTimeCorrectionDigest } from "./runEffortStagePreferences";
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
const selected = wire.cases.find(value => value.mode === "canonical_corrected")!;
function clone(value = selected) { return { request: structuredClone(value.request) as TrainingAnalysisPeriodsRequest, response: structuredClone(value.response) as TrainingAnalysisPeriodsResponse }; }
describe("actual compiled backend selected-time wire", () => {
  it.each(wire.cases)("strictly decodes $mode with exact source SHA", async value => {
    const input = clone(value), before = JSON.stringify(input.response);
    expect(validTrainingAnalysisPeriodsRequest(input.request)).toBe(true);
    expect(validateTrainingAnalysisPeriodsResponse(input.response, input.request)).toBe(input.response);
    await verifyRunTimeResponseDigests(input.response);
    expect(JSON.stringify(input.response)).toBe(before);
  });
  it("rejects unrequested channel, broader selection, extra keys and mismatched derived source", () => {
    const input = clone();
    const { includeStageRunTimeCorrections: _flag, stageRunTimeCorrectionActivityIds: _ids, ...legacy } = input.request;
    expect(() => validateTrainingAnalysisPeriodsResponse(input.response, legacy)).toThrow();
    for (const patch of [{ includeStageRunTimeCorrections: false }, { includeExpandedRunDistances: undefined }, { includeStageRunEffortPreferences: undefined },
      { stageRunTimeCorrectionActivityIds: ["inside", "other"] }, { stageRunDistanceSnapshotActivityIds: ["other"] }, { unexpected: true }]) {
      expect(validTrainingAnalysisPeriodsRequest({ ...input.request, ...patch } as never)).toBe(false);
    }
  });
  it.each(["selected", "original", "reported", "status", "effective", "unit", "clock", "extra", "date", "duplicate"])("fails closed for corrupt %s fields", field => {
    const input = clone(), channel = input.response.periods[0]!.stageTimeAdjustedEfforts!, effort = channel.efforts[0]!;
    if (field === "selected") channel.selected!.activityId = "foreign";
    if (field === "original") effort.originalElapsedSeconds = 1500.125;
    if (field === "reported") effort.timeCorrection!.reportedElapsedSeconds = 1490.1234;
    if (field === "status") effort.correctionStatus = "none";
    if (field === "effective") effort.effectiveElapsedSeconds = 1500;
    if (field === "unit") effort.sourceAuthority.timingBasis = "milliseconds" as never;
    if (field === "clock") effort.originalClockVerified = true as never;
    if (field === "extra") Object.assign(effort, { privateExtra: true });
    if (field === "date") effort.timeCorrection!.reportedAtEpochMs = 8640000000000001;
    if (field === "duplicate") channel.efforts.push(structuredClone(effort));
    expect(() => validateTrainingAnalysisPeriodsResponse(input.response, input.request)).toThrow();
  });
  it("checks current and historic authority hashes asynchronously without inventing a hash", async () => {
    const input = clone(), effort = input.response.periods[0]!.stageTimeAdjustedEfforts!.efforts[0]!;
    effort.sourceAuthority.activityRevision = "101:1";
    await expect(verifyRunTimeResponseDigests(input.response)).rejects.toThrow("invalid_run_effort_time_source_digest");
    const other = clone(); other.response.periods[0]!.stageTimeAdjustedEfforts!.efforts[0]!.timeCorrection!.sourceAuthority.metricsRevision = "99:1";
    await expect(verifyRunTimeResponseDigests(other.response)).rejects.toThrow("invalid_run_effort_time_source_digest");
  });
  it("binds the time anchor to the selected snapshot without relying on JSON field order", () => {
    const input = clone(wire.cases.find(value => value.mode === "derived_corrected")!);
    const effort = input.response.periods[0]!.stageTimeAdjustedEfforts!.efforts[0]!;
    effort.originalAnchor = Object.fromEntries(Object.entries(effort.originalAnchor!).reverse()) as typeof effort.originalAnchor;
    expect(validateTrainingAnalysisPeriodsResponse(input.response, input.request)).toBe(input.response);
    effort.originalAnchor!.startTimeSec += 1; effort.originalAnchor!.endTimeSec += 1;
    expect(() => validateTrainingAnalysisPeriodsResponse(input.response, input.request)).toThrow();
  });
  it("keeps orphan clear-only binding separate without observed authority or derived CAS", () => {
    const input = clone(wire.cases.find(value => value.mode === "derived_snapshot_missing_orphan")!);
    const channel = validateTrainingAnalysisPeriodsResponse(input.response, input.request).periods[0]!.stageTimeAdjustedEfforts!;
    expect(channel.efforts).toEqual([]);
    const orphan = channel.orphanedCorrections[0]!;
    expect(orphan).not.toHaveProperty("sourceAuthority");
    expect(orphan.clearBinding).not.toHaveProperty("expectedDerivedRevision");
    Object.assign(orphan, { sourceAuthority: orphan.timeCorrection.sourceAuthority });
    expect(() => validateTrainingAnalysisPeriodsResponse(input.response, input.request)).toThrow();
  });
});
describe("reported time input and mutation response contract", () => {
  it.each([["3:51.125", 231.125], ["0:03:51.125", 231.125], ["168:00:00", 604800], ["0:00:00.001", 0.001], ["1:00:00", 3600]])("parses %s precisely", (input, seconds) => {
    expect(parseReportedRunTime(input as string)).toBe(seconds);
    expect(parseReportedRunTime(formatReportedRunTime(seconds as number))).toBe(seconds);
  });
  it.each(["0:00:00", "-0:00:01", "0:60:00", "0:00:60", "3:51.1234", "168:00:00.001", "Infinity", "NaN", "231.125", "", "1e3:00:00"])("rejects malformed or out-of-policy input %s", value => expect(parseReportedRunTime(value)).toBeNull());
  it("strictly decodes set/clear responses, preserving optional reason and current source binding", async () => {
    const input = clone(), channel = input.response.periods[0]!.stageTimeAdjustedEfforts!, selection = channel.selected!, effort = channel.efforts[0]!;
    const request = { action: "set_time" as const, activityId: selection.activityId, target: effort.sourceAuthority.target, reportedElapsedSeconds: effort.timeCorrection!.reportedElapsedSeconds,
      reportedKind: effort.timeCorrection!.reportedKind, expectedPreferenceRevision: 0, expectedMetricsRevision: selection.metricsRevision!, expectedActivityIncarnation: selection.activityIncarnation,
      expectedSourceAuthorityRevision: effort.sourceAuthorityRevision, idempotencyKey: "time_request_1234567890" };
    const response = { version: 1 as const, scope: "stage_readtime_overlay" as const, outcome: "stored_pending_analysis_refresh" as const,
      activityId: request.activityId, activityIncarnation: request.expectedActivityIncarnation, target: request.target, preferenceRevision: 1, action: "set_time" as const, timeCorrection: effort.timeCorrection! };
    expect(validRunEffortStageMutation(request)).toBe(true); expect(validateRunEffortStageMutationResponse(response, request)).toBe(response);
    await verifyRunTimeCorrectionDigest(response.timeCorrection);
    for (const patch of [{ reportedElapsedSeconds: 0 }, { reportedKind: "official_verified" }, { extra: true }]) expect(validRunEffortStageMutation({ ...request, ...patch } as never)).toBe(false);
    for (const patch of [{ action: "clear_time" }, { extra: true }, { timeCorrection: { ...response.timeCorrection, reportedElapsedSeconds: 1491 } }]) {
      expect(() => validateRunEffortStageMutationResponse({ ...response, ...patch } as never, request)).toThrow();
    }
    const clear = { action: "clear_time" as const, activityId: selection.activityId, target: request.target, expectedPreferenceRevision: 1,
      expectedMetricsRevision: selection.metricsRevision!, expectedActivityIncarnation: selection.activityIncarnation, idempotencyKey: "clear_request_1234567890" };
    expect(validRunEffortStageMutation(clear)).toBe(true);
    expect(validRunEffortStageMutation({ ...clear, expectedDerivedRevision: "a".repeat(64) } as never)).toBe(false);
    expect(validateRunEffortStageMutationResponse({ ...response, action: "clear_time", preferenceRevision: 2, timeCorrection: null }, clear)).toMatchObject({ timeCorrection: null });
  });
});
