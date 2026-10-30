import producerGrounding from "../../__tests__/fixtures/narrativeComparisonGrounding.json";
import { validActivityNarrativeGrounding } from "../../services/activityNarrativeGrounding";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import type { ActivityNarrativeGrounding } from "@shared/activity-narrative-grounding";
import NarrativeComparisonGrounding from "./NarrativeComparisonGrounding";

const generatedAt = Date.parse("2026-10-26T01:00:00Z");
const evidence: ActivityNarrativeGrounding = {
  version: 1, generatedAt, blocks: [{
    kind: "coach_history", basis: "activity_relative",
    window: { fromMs: Date.parse("2026-07-22T15:30:00Z"), toMs: Date.parse("2026-10-20T15:30:00Z"), fromInclusive: false, toExclusive: true },
    comparisonWindows: [{ fromMs: Date.parse("2026-09-22T15:30:00Z"), toMs: Date.parse("2026-10-20T15:30:00Z"), fromInclusive: true, toExclusive: true }],
    scanLimit: 24, scannedCount: 24, selectedCount: 20, missingCount: 3, capReached: true, coverage: "sample",
    sources: [{ kind: "metrics", activityId: "prior/ride", revision: "saved-revision" }], sourceCount: 120, sourcesTruncated: true, sourceSetDigest: "digest",
  }],
};
it("shows the generation-time sample, exact relative window, missing inputs and bounded source references", () => {
  renderWithProviders(<NarrativeComparisonGrounding grounding={evidence} generatedAt={generatedAt} />, { route: "/ko/activity/current?tab=analysis" });
  expect(screen.getByText(/KST 달력 기간의 전체 집계와는 다릅니다/)).toBeInTheDocument();
  expect(screen.getByText(/조회 24건 · 선택 20건/)).toBeInTheDocument();
  expect(screen.getByText(/누락 자료 3건/)).toBeInTheDocument();
  expect(screen.getByText(/조회 상한에 도달/)).toBeInTheDocument();
  expect(screen.getByText(/원본 목록의 일부/)).toBeInTheDocument();
  expect(screen.getAllByText(/2026\. 10\. 21\./).length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: "원본 활동 보기", hidden: true })).toHaveAttribute("href", "/ko/activity/prior%2Fride");
  expect(screen.getByText(/saved-revision/)).toBeInTheDocument();
});
it.each([null, { ...evidence, generatedAt: generatedAt - 1 }])("does not substitute current evidence for legacy or mismatched generation", (grounding) => {
  renderWithProviders(<NarrativeComparisonGrounding grounding={grounding} generatedAt={generatedAt} />);
  expect(screen.getByText(/생성 당시의 비교 근거가 저장되어 있지 않습니다/)).toBeInTheDocument();
  expect(screen.queryByText(/saved-revision/)).not.toBeInTheDocument();
});
it("does not invent a missing-input denominator or a source link for settings evidence", () => {
  renderWithProviders(<NarrativeComparisonGrounding grounding={{ ...evidence, blocks: [{ ...evidence.blocks[0], missingCount: null, coverage: "unknown", sources: [{ kind: "profile", activityId: null, revision: null }] }] }} generatedAt={generatedAt} />);
  expect(screen.getByText("누락 자료 수는 확인되지 않았습니다.")).toBeInTheDocument();
  expect(screen.queryByRole("link", { hidden: true })).not.toBeInTheDocument();
});

it("renders the real server context collector output without creating a new comparison or LLM request", () => {
  expect(validActivityNarrativeGrounding(producerGrounding, producerGrounding.generatedAt)).toBe(true);
  if (!validActivityNarrativeGrounding(producerGrounding, producerGrounding.generatedAt)) throw new Error("Invalid producer fixture");
  renderWithProviders(<NarrativeComparisonGrounding grounding={producerGrounding} generatedAt={producerGrounding.generatedAt} />);
  expect(screen.getByText("최근 기록 표본 비교")).toBeInTheDocument();
  expect(screen.getByText("조회 상한 24건")).toBeInTheDocument();
  expect(screen.getAllByText("조회 3건 · 선택 3건")).toHaveLength(2);
  expect(screen.getAllByRole("link", { name: "원본 활동 보기", hidden: true }).some((link) => link.getAttribute("href") === "/ko/activity/prior-0")).toBe(true);
});
