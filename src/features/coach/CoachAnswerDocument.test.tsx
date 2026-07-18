import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CoachAnswerBlock, CoachAnswerDocument, CoachDisplayValue, CoachEvidenceRecord, CoachUnit, CoachV2Response } from "../../services/coachV2Contract";
import { CoachAnswerDocumentView, supportedAnswerBlockKinds } from "./CoachAnswerDocument";

function fixture() {
  const evidence: CoachEvidenceRecord[] = [];
  let sequence = 0;
  const value = <T extends number | string | boolean>(raw: T, unit?: CoachUnit): CoachDisplayValue<T> => {
    const evidenceId = `ev_${++sequence}`;
    evidence.push({ evidenceId, source: "derived", sourceId: `source_${sequence}`, field: "value", value: raw,
      sourceRevision: `revision_${sequence}`, asOf: "2026-07-18T03:00:00.000Z", ownerScope: "authenticated_user" });
    return { value: raw, evidenceId, ...(unit ? { unit } : {}) };
  };
  const entity = (type: "activity" | "plan_item" | "goal", id: string, label: string) => ({ entityType: type, entityId: id,
    label: value(label), occurredAt: value("2026-07-17T03:00:00.000Z") });
  const base = (blockId: string) => ({ blockId, sourceSlotIds: [`slot_${blockId}`], partial: false, stale: false, truncated: false, omittedCount: 0 });
  const blocks: CoachAnswerBlock[] = [
    { ...base("narrative"), kind: "narrative", templateKey: "coach.answer.narrative.comparison_summary",
      placeholders: { current: value(43, "score"), previous: value(35, "score"), delta: value(8, "score") } },
    { ...base("metrics"), kind: "metric_grid", items: [{ metricId: "ctl", current: value(43, "score") }, { metricId: "atl", current: value(70, "score") }] },
    { ...base("compare"), kind: "comparison_table", columns: [{ id: "previous", labelKey: "coach.answer.column.previous" },
      { id: "current", labelKey: "coach.answer.column.current" }, { id: "delta", labelKey: "coach.answer.column.delta" }],
      rows: [{ rowId: "ctl", metricId: "ctl", cells: { previous: value(35, "score"), current: value(43, "score"), delta: value(8, "score") } }] },
    { ...base("trend"), kind: "time_series", series: [{ seriesId: "ctl", metricId: "ctl", points: [
      { at: value("2026-W27"), value: value(35, "score") }, { at: value("2026-W28"), value: value(43, "score") },
    ] }] },
    { ...base("distribution"), kind: "distribution", categories: [{ categoryId: "z2", label: value("Z2"), value: value(60, "percent") }] },
    { ...base("ranking"), kind: "ranking", entries: [{ rank: value(1), entity: entity("activity", "activity_1", "Solo Ride"), values: [value(238, "tss")] }] },
    { ...base("activities"), kind: "activity_list", activities: [{ activity: entity("activity", "activity_2", "Lunch Ride"), values: [value(42, "kilometers")] }] },
    { ...base("goal"), kind: "goal_progress", goalId: "goal_1", sourceLoadFactsId: "load_1", current: value(43, "score"), target: value(40, "score"), progress: value(107.5, "percent") },
    { ...base("plan"), kind: "plan_adherence", planned: value(4, "count"), completed: value(3, "count"),
      missed: [{ planned: entity("plan_item", "plan_1", "SST"), evidenceIds: [] }], replacements: [] },
    { ...base("gap"), kind: "data_gap", partial: true, reasonCodes: ["missing_metric"], missingMetricIds: ["readiness"] },
    { ...base("action"), kind: "action", actionCode: "OPEN_ACTIVITY", entity: entity("activity", "activity_1", "Solo Ride") },
  ];
  const document: CoachAnswerDocument = { compatibility: "supported", answerId: "answer_1", sourceFactsId: "facts_1",
    questionSummary: "coach.answer.summary.load", status: "partial", blocks, evidence, warnings: [],
    freshness: { asOf: "2026-07-18T03:00:00.000Z", timezone: "Asia/Seoul", staleSourceSlotIds: [] }, followUps: [] };
  const response = { apiVersion: "v2", capabilityVersion: "p1", schemaVersion: "coach-response-envelope-v1",
    requestId: "018f47a2-3c4d-7abc-8def-000000000101", outcome: "answer", answer: document,
    quota: { limit: 3, remaining: 2, resetAt: "2026-07-18T15:00:00.000Z", consumed: true },
    budget: { blocked: false, providerCalls: 0, inputTokens: 0, outputTokens: 0 },
    retry: { mode: "same_request_replay", quotaImpact: "none", previousTurnConsumed: true, providerCallAllowed: false, retryable: false, reasonCode: "completed" },
    execution: { parser: "deterministic", queryPlanHash: "hash_1", catalogVersion: "catalog_1", factsId: "facts_1", asOf: "2026-07-18T03:00:00.000Z" },
  } as CoachV2Response;
  return { response, document, evidence, value, base };
}

describe("CoachAnswerDocumentView", () => {
  it("renders all eleven P1 allowlisted block fixtures together with accessible table/chart semantics", () => {
    const { response, document, evidence } = fixture();
    render(<CoachAnswerDocumentView response={response} locale="ko-KR" onAction={vi.fn()} />);
    expect(supportedAnswerBlockKinds(document)).toEqual(["narrative", "metric_grid", "comparison_table", "time_series", "distribution",
      "ranking", "activity_list", "goal_progress", "plan_adherence", "data_gap", "action"]);
    expect(screen.getByRole("img", { name: "서버가 제공한 시계열의 추세 차트" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "기간 비교" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "추세 데이터 표" })).toBeInTheDocument();
    expect(screen.getAllByText("Solo Ride").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Lunch Ride").length).toBeGreaterThan(0);
    expect(screen.getByText("회복 준비도")).toBeInTheDocument();
    const manifest = new Set(evidence.map((item) => item.evidenceId));
    for (const element of documentElement().querySelectorAll<HTMLElement>("[data-evidence-id]")) {
      expect(manifest.has(element.dataset.evidenceId ?? "")).toBe(true);
    }
  });

  it("invokes only an allowlisted action with the evidence-bearing entity and performs no lookup", async () => {
    const { response } = fixture(); const action = vi.fn();
    render(<CoachAnswerDocumentView response={response} locale="ko-KR" onAction={action} />);
    await userEvent.click(screen.getByRole("button", { name: "활동 열기" }));
    expect(action).toHaveBeenCalledWith("OPEN_ACTIVITY", expect.objectContaining({ entityId: "activity_1", label: expect.objectContaining({ evidenceId: expect.any(String) }) }));
  });

  it("keeps 100+ structured items accessible behind progressive disclosure and displays server omission state", async () => {
    const { response, document, evidence, value, base } = fixture();
    const activities = Array.from({ length: 105 }, (_, index) => ({ activity: { entityType: "activity" as const, entityId: `a_${index}`,
      label: value(`Activity ${index}`) }, values: [value(index, "tss")] }));
    document.blocks = [{ ...base("many"), kind: "activity_list", activities, truncated: true, omittedCount: 12 }];
    document.evidence = evidence;
    render(<CoachAnswerDocumentView response={response} locale="ko-KR" onAction={vi.fn()} />);
    expect(screen.getAllByText("Activity 0").length).toBeGreaterThan(0);
    const summary = screen.getByText("항목 100개 더 보기");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    await userEvent.click(summary);
    expect(summary.closest("details")).toHaveAttribute("open");
    expect(screen.getAllByText("Activity 104").length).toBeGreaterThan(0);
    expect(screen.getByText("서버에서 12개 생략")).toBeInTheDocument();
  });

  it("shows block-local compatibility and P1 prescription-disabled fallbacks without raw payload", () => {
    const { response, document } = fixture();
    document.blocks = [{ kind: "unsupported_block", blockId: "future", reason: "unknown_kind" },
      { kind: "unsupported_block", blockId: "rx", reason: "prescription_feature_disabled" }];
    render(<CoachAnswerDocumentView response={response} locale="ko-KR" onAction={vi.fn()} />);
    expect(screen.getByText("지원되지 않는 결과 블록")).toBeInTheDocument();
    expect(screen.getByText("처방 결과는 아직 지원하지 않습니다")).toBeInTheDocument();
    expect(window.document.body).not.toHaveTextContent("future");
  });

  it("marks quota/budget/failed partial answers as fallback rather than normal success", () => {
    const { response } = fixture(); response.outcome = "failed"; response.error = { code: "planner_failed", retryable: false, fallbackAvailable: true };
    render(<CoachAnswerDocumentView response={response} locale="ko-KR" onAction={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("일부 결과만 표시합니다");
  });
});

function documentElement(): HTMLElement {
  return window.document.documentElement;
}
