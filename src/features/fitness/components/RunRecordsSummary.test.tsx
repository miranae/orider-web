import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { RunEvidence } from "../multisportPerformance";
import { needsRunAnalysisReadiness } from "../runAnalysisReadiness";
import RunRecordsSummary from "./RunRecordsSummary";
const record = (distance: "5km" | "10km", seconds: number) => ({ distance, seconds, date: "2026-10-01", activityId: "activity", startTime: 1, qualification: "source_qualified" as const, unit: "seconds" as const });
describe("analysis running records summary", () => {
  it("shows only the best qualified 5k and 10k and the records destination", () => {
    render(<MemoryRouter><RunRecordsSummary evidence={{ thresholdPaceSec: null, records: [record("5km", 1500), record("5km", 1200), record("10km", 2700)] }} /></MemoryRouter>);
    expect(screen.getByTestId("K5-4")).toHaveTextContent("5km · 20:00");
    expect(screen.getByTestId("K5-4")).toHaveTextContent("10km · 45:00");
    expect(screen.getByTestId("K5-4")).not.toHaveTextContent("25:00");
    expect(screen.getByRole("link").getAttribute("href")).toContain("/athlete/me/records?sport=run");
  });
  it("never certifies legacy or incomplete source entries as timed PBs", () => {
    const invalid = { ...record("5km", 60), activityId: "" };
    const evidence: RunEvidence = { thresholdPaceSec: null, records: [invalid], unverifiedRecords: [{ distance: "5km", storedValue: 1200, date: "2026-10-01", activityId: "old", startTime: 1, qualification: "legacy_unverified", unit: "unverified" }] };
    render(<MemoryRouter><RunRecordsSummary evidence={evidence} /></MemoryRouter>);
    expect(screen.getByTestId("K5-4")).toHaveTextContent("거리별 저장 기록");
    expect(screen.getByTestId("K5-4")).toHaveTextContent("시간별 페이스 분석과는 별개");
    expect(screen.getByTestId("K5-4")).not.toHaveTextContent("20:00");
    expect(screen.getByTestId("K5-4")).not.toHaveTextContent("1:00");
  });
});


it("offers one readiness group with real threshold and records destinations", () => {
  render(<MemoryRouter><RunRecordsSummary evidence={{ thresholdPaceSec: null, records: [] }} readiness /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "러닝 분석 준비" })).toBeInTheDocument();
  const actions = screen.getByRole("link", { name: "러닝 훈련 기준 설정" }).parentElement!;
  expect(actions).toHaveClass("flex", "flex-wrap", "gap-2");
  expect(actions).toContainElement(screen.getByRole("link", { name: "기록 전체 보기 →" }));
  expect(screen.getByRole("link", { name: "러닝 훈련 기준 설정" })).toHaveAttribute("href", expect.stringContaining("/coach/condition?sport=run#thresholds"));
  expect(screen.getByRole("link", { name: "기록 전체 보기 →" })).toHaveAttribute("href", expect.stringContaining("/athlete/me/records?sport=run"));
});

it("keeps qualified records, thresholds or heart-rate data outside the all-missing group", () => {
  expect(needsRunAnalysisReadiness({ thresholdPaceSec: null, records: [] }, false, false)).toBe(true);
  expect(needsRunAnalysisReadiness({ thresholdPaceSec: null, records: [record("5km", 1200)] }, false, false)).toBe(false);
  expect(needsRunAnalysisReadiness({ thresholdPaceSec: 300, records: [] }, false, false)).toBe(false);
  expect(needsRunAnalysisReadiness({ thresholdPaceSec: null, records: [] }, false, true)).toBe(false);
});
