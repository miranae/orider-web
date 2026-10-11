import { describe, expect, it } from "vitest";
import { historyPage, historyRow } from "../../../services/trainingAnalysisHistory.fixture";
import { annualDistanceLeaders, annualRunHistory } from "./annualRunHistory";
import { dedupeSamePhysicalRides } from "../../../utils/samePhysicalRide";
describe("global annual representatives", () => {
  it("uses the existing comparator globally across pages and retains a higher-priority pending representative", () => {
    const native = historyRow("native"); native.representativeInput.localSessionId = "same-run";
    const imported = historyRow("strava_1", 50000); imported.representativeInput.source = "strava"; imported.representativeInput.localSessionId = "same-run";
    imported.analysis.state = "pending"; imported.analysis.inputCoverage = "pending";
    imported.distanceRecords = { state: "unavailable", reason: "metrics_unavailable", points: [] };
    imported.paceCurve = { state: "unavailable", reason: "metrics_unavailable", value: null };
    const pages = [historyPage([native], false), historyPage([imported])], before = structuredClone(pages);
    const result = annualRunHistory(pages);
    expect(result.representatives.map(row => row.activityId)).toEqual(["strava_1"]);
    expect(result.states.pending).toBe(1); expect(result.channels).toEqual({ distance: 1, pace: 1 });
    expect(annualDistanceLeaders(result.representatives, "5km")).toEqual([]);
    expect(pages).toEqual(before);
    const exact = dedupeSamePhysicalRides([native, imported].map(row => ({ ...row.representativeInput, id: row.activityId, startTime: row.startTime, sportFamily: "run" })));
    expect(result.representatives.map(row => row.activityId)).toEqual(exact.map(row => row.id));
  });
  it("groups physical time overlaps across page boundaries without requiring an explicit shared key", () => {
    const native = historyRow("native"); native.representativeInput.movingSec = 3600;
    const imported = historyRow("strava_1", 100000); imported.representativeInput.source = "strava"; imported.representativeInput.movingSec = 3500;
    const other = historyRow("other-day", 86400000);
    const result = annualRunHistory([historyPage([native], false), historyPage([imported, other])]);
    expect(result.representatives.map(row => row.activityId)).toEqual(["strava_1", "other-day"]);
    expect(result.deduplicatedCount).toBe(1);
  });
  it("keeps incomplete scans distinct from exhausted scans and separates unknown analyses", () => {
    const row = historyRow(); row.analysis.state = "missing";
    expect(annualRunHistory([historyPage([], false)])).toMatchObject({ scanComplete: false, scanned: 50, candidateCount: 0 });
    expect(annualRunHistory([historyPage([row])])).toMatchObject({ scanComplete: true, states: { missing: 1, ready: 0 } });
  });
  it("caps total scanned records before sport filtering and rejects duplicate document rows", () => {
    const pages = Array.from({ length: 100 }, (_, i) => historyPage([], false, i * 50000));
    expect(annualRunHistory(pages)).toMatchObject({ scanned: 5000, candidateCount: 0, capped: true });
    expect(() => annualRunHistory([...pages, historyPage([], false)])).toThrow("history_memory_cap");
    expect(() => annualRunHistory([historyPage(), historyPage()])).toThrow("history_repeated_activity");
  });
  it("orders only explicit elapsed efforts, stable date/ID ties, and source-bearing top three", () => {
    const rows = [historyRow("z", 1000), historyRow("a", 1000), historyRow("old"), historyRow("fast", 2000)];
    rows[3]!.distanceRecords.points[0]!.elapsedSec = 1100.5;
    expect(annualDistanceLeaders(rows, "5km").map(row => row.activityId)).toEqual(["fast", "a", "z"]);
    expect(annualDistanceLeaders(rows, "full")).toEqual([]);
    expect(annualDistanceLeaders(rows, "5km")[0]).toMatchObject({ elapsedSec: 1100.5, metricsRevision: "124:0" });
  });
});
