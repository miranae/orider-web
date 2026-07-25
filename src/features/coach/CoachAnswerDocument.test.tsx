import { render, screen, within } from "@testing-library/react";
import i18n from "i18next";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enCoach from "../../i18n/resources/en/coach.json";
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
  beforeEach(async () => {
    i18n.addResourceBundle("en", "coach", enCoach, true, true);
    await i18n.changeLanguage("ko");
  });

  it.each([
    { language: "ko", locale: "ko-KR", historical: false, heading: "코칭 요약", body: "회복을 우선하세요.",
      evidenceToggle: "분석 근거 1개", freshness: "데이터 기준", timezone: "시간대 Asia/Seoul", partial: "일부 데이터" },
    { language: "ko", locale: "ko-KR", historical: true, heading: "코칭 요약", body: "회복을 우선하세요.",
      evidenceToggle: "분석 근거 1개", freshness: "데이터 기준", timezone: "시간대 Asia/Seoul", partial: "일부 데이터" },
    { language: "en", locale: "en-US", historical: false, heading: "Coaching summary", body: "Prioritize recovery.",
      evidenceToggle: /evidence items?/iu, freshness: "Data as of", timezone: "Timezone Asia/Seoul", partial: "Partial data" },
    { language: "en", locale: "en-US", historical: true, heading: "Coaching summary", body: "Prioritize recovery.",
      evidenceToggle: /evidence items?/iu, freshness: "Data as of", timezone: "Timezone Asia/Seoul", partial: "Partial data" },
  ])("keeps the $language answer and metadata visible without exposing evidence when historical=$historical",
    async ({ language, locale, historical, heading, body, evidenceToggle, freshness, timezone, partial }) => {
    await i18n.changeLanguage(language);
    const { response, document, evidence, base } = fixture();
    document.blocks = [{ ...base("report"), kind: "grounded_markdown", markdown: `## ${heading}\n\n${body}`,
      evidenceIds: [evidence[0]!.evidenceId] }];
    const privateEvidence = { ...evidence[0]!, evidenceId: "ev_private", field: "private_only", value: "PRIVATE_EVIDENCE_VALUE_7319",
      asOf: "2026-07-11T09:17:00.000Z" };
    document.evidence = [privateEvidence];

    const view = render(<CoachAnswerDocumentView response={response} locale={locale} onAction={vi.fn()} historical={historical} />);
    expect(view.container.querySelector(".coach-answer--historical")).toBe(historical ? view.container.firstElementChild : null);
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(view.container).toHaveTextContent(freshness);
    expect(view.container).toHaveTextContent(timezone);
    expect(view.container).toHaveTextContent(partial);
    expect(view.container).not.toHaveTextContent(evidenceToggle);
    expect(view.container).not.toHaveTextContent("PRIVATE_EVIDENCE_VALUE_7319");
    expect(view.container).not.toHaveTextContent(formatEvidenceDate(privateEvidence.asOf, locale, document.freshness.timezone));
    expect(view.container.querySelector(".coach-answer__evidence")).not.toBeInTheDocument();
    expect(view.container.querySelector('[data-evidence-id="ev_private"]')).not.toBeInTheDocument();
  });

  it("renders grounded Markdown as semantic prose and lists without creating links or charts", () => {
    const { response, document, evidence, base } = fixture();
    document.blocks = [{ ...base("report"), kind: "grounded_markdown",
      markdown: "## 목표까지의 차이\n\n현재는 **3.30 W/kg**입니다.\n\n### 훈련 방향\n\n- 역치 훈련은 주 1회\n- 회복 상태를 먼저 확인",
      evidenceIds: [evidence[0]!.evidenceId] }];
    render(<CoachAnswerDocumentView response={response} responseFormat="chart" locale="ko-KR" onAction={vi.fn()} />);
    const reportHeading = screen.getByRole("heading", { name: "목표까지의 차이" });
    expect(reportHeading).toBeInTheDocument();
    expect(reportHeading.closest("section")).not.toHaveAttribute("aria-labelledby");
    expect(screen.getByRole("heading", { name: "훈련 방향" })).toBeInTheDocument();
    expect(screen.getByText("3.30 W/kg").tagName).toBe("STRONG");
    expect(within(screen.getByRole("heading", { name: "훈련 방향" }).closest("article")!).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("promotes an emphasized-only Markdown line to a semantic subsection heading", () => {
    const { response, document, evidence, base } = fixture();
    document.blocks = [{ ...base("report"), kind: "grounded_markdown",
      markdown: "지난 7일간의 몸 상태입니다.\n\n**추천 라이딩 코스:**\n\n현재 컨디션에는 회복 라이딩이 적합합니다.",
      evidenceIds: [evidence[0]!.evidenceId] }];

    render(<CoachAnswerDocumentView response={response} locale="ko-KR" onAction={vi.fn()} />);

    expect(screen.getByRole("heading", { level: 4, name: "추천 라이딩 코스:" })).toBeInTheDocument();
  });

  it("renders active-looking grounded Markdown as inert text", () => {
    const { response, document, evidence, base } = fixture();
    const markdown = [
      "## Provider text",
      "<script>window.__coach_not_executed = true</script>",
      "[Markdown link](https://example.com)",
      "![Markdown image](data:image/svg+xml,unsafe)",
      "javascript:window.__coach_not_executed=true",
      "zero\u200Bwidth",
    ].join("\n\n");
    document.blocks = [{ ...base("report"), kind: "grounded_markdown", markdown,
      evidenceIds: [evidence[0]!.evidenceId] }];

    const view = render(<CoachAnswerDocumentView response={response} locale="ko-KR" onAction={vi.fn()} />);

    expect(view.container).toHaveTextContent("<script>window.__coach_not_executed = true</script>");
    expect(view.container).toHaveTextContent("[Markdown link](https://example.com)");
    expect(view.container).toHaveTextContent("![Markdown image](data:image/svg+xml,unsafe)");
    expect(view.container).toHaveTextContent("javascript:window.__coach_not_executed=true");
    expect(view.container.textContent).toContain("zero\u200Bwidth");
    expect(view.container.querySelector("script")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders supported metric, series, and distribution blocks as native tables when table is requested", () => {
    const { response } = fixture();
    render(<CoachAnswerDocumentView response={response} responseFormat="table" locale="ko-KR" onAction={vi.fn()} />);
    expect(screen.getAllByRole("table", { name: "운동 기록 표" })).toHaveLength(2);
    expect(screen.getByRole("table", { name: "추세 데이터 표" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "서버가 제공한 시계열의 추세 차트" })).not.toBeInTheDocument();
  });

  it("charts numeric distributions with an accessible table and explains chart fallback", () => {
    const { response, document } = fixture();
    render(<CoachAnswerDocumentView response={response} responseFormat="chart" locale="ko-KR" onAction={vi.fn()} />);
    expect(screen.getByRole("img", { name: "운동 기록 분포 그래프" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "운동 기록 표" })).toBeInTheDocument();

    document.blocks = document.blocks.filter((block) => block.kind === "metric_grid");
    const fallback = render(<CoachAnswerDocumentView response={response} responseFormat="chart" locale="ko-KR" onAction={vi.fn()} />);
    expect(within(fallback.container).getByRole("status")).toHaveTextContent("기본 형식으로 표시합니다");
    expect(within(fallback.container).getByText("현재 상태")).toBeInTheDocument();
  });

  it("uses the planner-selected time-series block in auto mode and collapses duplicate raw rows", async () => {
    const { response, document, value, base } = fixture();
    document.blocks = [{ ...base("distance_trend"), kind: "time_series", series: [{
      seriesId: "distance", metricId: "distance", points: Array.from({ length: 12 }, (_, index) => ({
        at: value(`2026-07-${String(index + 1).padStart(2, "0")}`), value: value(index + 20, "kilometers"),
      })),
    }] }];

    render(<CoachAnswerDocumentView response={response} locale="ko-KR" onAction={vi.fn()} />);
    expect(screen.getByRole("img", { name: "서버가 제공한 시계열의 추세 차트" })).toBeInTheDocument();
    const toggle = screen.getByText("원시 시계열 데이터 보기");
    const details = toggle.closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(within(details!).getByRole("table", { name: "추세 데이터 표" })).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(details).toHaveAttribute("open");
  });

  it("keeps load-analysis grouping deduplicated while applying table and chart defaults", () => {
    const tableFixture = fixture();
    const tableView = render(<CoachAnswerDocumentView response={tableFixture.response} responseFormat="table" locale="ko-KR" onAction={vi.fn()} />);
    const tableLoad = tableView.container.querySelector(".coach-answer__load") as HTMLElement;
    expect(tableLoad).toBeInTheDocument();
    expect(within(tableLoad).getByRole("table", { name: "추세 데이터 표" })).toBeInTheDocument();
    expect(within(tableLoad).queryByRole("img", { name: "서버가 제공한 시계열의 추세 차트" })).not.toBeInTheDocument();
    expect(tableView.container.querySelectorAll(".coach-answer__load")).toHaveLength(1);
    tableView.unmount();

    const chartFixture = fixture();
    const chartView = render(<CoachAnswerDocumentView response={chartFixture.response} responseFormat="chart" locale="ko-KR" onAction={vi.fn()} />);
    const chartLoad = chartView.container.querySelector(".coach-answer__load") as HTMLElement;
    expect(within(chartLoad).getByRole("img", { name: "서버가 제공한 시계열의 추세 차트" })).toBeInTheDocument();
    expect(within(chartLoad).queryByRole("button", { name: "차트와 표로 보기" })).not.toBeInTheDocument();
    expect(chartView.container.querySelectorAll(".coach-answer__load")).toHaveLength(1);
  });

  it("requires two valid numeric time-series points and never draws a fabricated line", () => {
    const { response, document, value, base } = fixture();
    document.blocks = [{ ...base("sparse"), kind: "time_series", series: [{ seriesId: "sparse", metricId: "ctl", points: [
      { at: value("2026-W27"), value: value(35, "score") },
      { at: value("2026-W28"), value: { value: null, evidenceId: "ev_missing", unit: "score" } },
    ] }] }];
    render(<CoachAnswerDocumentView response={response} responseFormat="chart" locale="ko-KR" onAction={vi.fn()} />);
    expect(screen.queryByRole("img", { name: "서버가 제공한 시계열의 추세 차트" })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "추세 데이터 표" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("추세 또는 수치 분포 데이터가 없어");
  });

  it("shows block-local fallback only for unchartable blocks in a mixed chart answer", () => {
    const { response, document, value, base } = fixture();
    document.blocks = [
      { ...base("chartable"), kind: "time_series", series: [{ seriesId: "distance", metricId: "distance", points: [
        { at: value("2026-07-01"), value: value(30, "kilometers") }, { at: value("2026-07-02"), value: value(42, "kilometers") },
      ] }] },
      { ...base("sparse"), kind: "time_series", series: [{ seriesId: "heart_rate", metricId: "heart_rate", points: [
        { at: value("2026-07-01"), value: value(152, "bpm") },
      ] }] },
    ];
    render(<CoachAnswerDocumentView response={response} responseFormat="chart" locale="ko-KR" onAction={vi.fn()} />);
    expect(screen.getAllByRole("img", { name: "서버가 제공한 시계열의 추세 차트" })).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("이 결과는 표로 표시합니다");
    expect(screen.queryByText("이 답변에는 그래프로 표시할 수 있는 추세 또는 수치 분포 데이터가 없어")).not.toBeInTheDocument();
  });

  it("preserves the common time domain and splits lines across invalid point gaps", () => {
    const { response, document, value, base } = fixture();
    document.blocks = [{ ...base("gapped"), kind: "time_series", series: [{ seriesId: "distance", metricId: "distance", points: [
      { at: value("2026-07-01"), value: value(10, "kilometers") },
      { at: value("2026-07-02"), value: value(12, "kilometers") },
      { at: value("2026-07-03"), value: { value: null, evidenceId: "ev_gap", unit: "kilometers" } },
      { at: value("2026-07-04"), value: value(15, "kilometers") },
      { at: value("2026-07-05"), value: value(18, "kilometers") },
    ] }] }];
    const view = render(<CoachAnswerDocumentView response={response} responseFormat="chart" locale="ko-KR" onAction={vi.fn()} />);
    const lines = [...view.container.querySelectorAll<SVGPolylineElement>("polyline")];
    expect(lines.map((line) => line.dataset.sourceIndexes)).toEqual(["0,1", "3,4"]);
    expect(lines[0]).toHaveAttribute("points", expect.stringMatching(/^0,[^ ]+ 25,/));
    expect(lines[1]).toHaveAttribute("points", expect.stringMatching(/^75,[^ ]+ 100,/));
  });

  it("sorts a multi-series ISO time domain before mapping each series to x positions", () => {
    const { response, document, value, base } = fixture();
    document.blocks = [{ ...base("offset_series"), kind: "time_series", series: [
      { seriesId: "distance", metricId: "distance", points: [
        { at: value("2026-07-02"), value: value(20, "kilometers") },
        { at: value("2026-07-03"), value: value(30, "kilometers") },
      ] },
      { seriesId: "heart_rate", metricId: "heart_rate", points: [
        { at: value("2026-07-01"), value: value(140, "bpm") },
        { at: value("2026-07-02"), value: value(145, "bpm") },
        { at: value("2026-07-03"), value: value(150, "bpm") },
      ] },
    ] }];
    const view = render(<CoachAnswerDocumentView response={response} responseFormat="chart" locale="ko-KR" onAction={vi.fn()} />);
    const lines = [...view.container.querySelectorAll<SVGPolylineElement>("polyline")];
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveAttribute("points", expect.stringMatching(/^50,[^ ]+ 100,/));
    expect(lines[1]).toHaveAttribute("points", expect.stringMatching(/^0,[^ ]+ 50,[^ ]+ 100,/));
  });

  it("falls back to a table for an ambiguous multi-series label domain", () => {
    const { response, document, value, base } = fixture();
    document.blocks = [{ ...base("label_series"), kind: "time_series", series: [
      { seriesId: "distance", metricId: "distance", points: [
        { at: value("최근"), value: value(20, "kilometers") }, { at: value("현재"), value: value(30, "kilometers") },
      ] },
      { seriesId: "heart_rate", metricId: "heart_rate", points: [
        { at: value("이전"), value: value(140, "bpm") }, { at: value("현재"), value: value(150, "bpm") },
      ] },
    ] }];
    render(<CoachAnswerDocumentView response={response} responseFormat="chart" locale="ko-KR" onAction={vi.fn()} />);
    expect(screen.queryByRole("img", { name: "서버가 제공한 시계열의 추세 차트" })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "추세 데이터 표" })).toBeInTheDocument();
  });

  it("keeps table and distribution-chart density bounded behind expansion controls", () => {
    const { response, document, value, base } = fixture();
    document.blocks = [
      { ...base("many_metrics"), kind: "metric_grid", items: Array.from({ length: 7 }, (_, index) => ({ metricId: "ctl" as const, current: value(index, "score") })) },
      { ...base("many_categories"), kind: "distribution", categories: Array.from({ length: 7 }, (_, index) => ({ categoryId: `c_${index}`, label: value(`C${index}`), value: value(index, "percent") })) },
    ];
    const tableView = render(<CoachAnswerDocumentView response={response} responseFormat="table" locale="ko-KR" onAction={vi.fn()} />);
    const tables = within(tableView.container).getAllByRole("table", { name: "운동 기록 표" });
    expect(tables).toHaveLength(2);
    expect(tables.every((table) => table.querySelectorAll("tbody tr").length === 5)).toBe(true);
    expect(within(tableView.container).getAllByRole("button", { name: "항목 2개 더 보기" })).toHaveLength(2);
    tableView.unmount();

    render(<CoachAnswerDocumentView response={response} responseFormat="chart" locale="ko-KR" onAction={vi.fn()} />);
    const bars = screen.getByRole("img", { name: "운동 기록 분포 그래프" }).closest(".coach-answer__bars") as HTMLElement;
    const disclosure = within(bars).getByText("항목 2개 더 보기").closest("details");
    expect(disclosure).not.toHaveAttribute("open");
    expect(screen.getByRole("table", { name: "운동 기록 표" }).querySelectorAll("tbody tr")).toHaveLength(5);
  });

  it("renders all eleven P1 allowlisted block fixtures together with accessible table/chart semantics", async () => {
    const { response, document, evidence } = fixture();
    render(<CoachAnswerDocumentView response={response} locale="ko-KR" onAction={vi.fn()} />);
    expect(supportedAnswerBlockKinds(document)).toEqual(["narrative", "metric_grid", "comparison_table", "time_series", "distribution",
      "ranking", "activity_list", "goal_progress", "plan_adherence", "data_gap", "action"]);
    expect(documentElement().querySelector(".coach-answer__block--narrative")).toBeInTheDocument();
    expect(documentElement().querySelector(".coach-answer__block--metric_grid")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "현재 상태 비교" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "현재 상태 비교" }).closest(".coach-answer__table-scroll")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "차트와 표로 보기" }));
    expect(screen.getByRole("img", { name: "서버가 제공한 시계열의 추세 차트" })).toBeInTheDocument();
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

  it("renders a saved partial answer without replaying its live fallback alert", () => {
    const { response } = fixture();
    response.outcome = "failed";
    response.error = { code: "planner_failed", retryable: false, fallbackAvailable: true };
    render(<CoachAnswerDocumentView response={response} locale="ko-KR" onAction={vi.fn()} historical />);
    expect(documentElement().querySelector(".coach-answer__block--narrative")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("일부 결과만 표시합니다")).not.toBeInTheDocument();
  });

  it("groups evidence-bound load comparison, canonical trends and goal without inventing unavailable basis or state", async () => {
    const { response, document, evidence, value, base } = fixture();
    const comparison = (metricId: "ctl" | "atl" | "form", previous: number, current: number, delta: number) => ({
      rowId: `load_${metricId}`, metricId, cells: {
        previous: value(previous, "score"), current: value(current, "score"), delta: value(delta, "score"),
      },
    });
    const trend = (metricId: "ctl" | "atl" | "form", values: number[]) => ({ ...base(`trend_${metricId}`), kind: "time_series" as const,
      series: [{ seriesId: `weekly_${metricId}`, metricId, points: values.map((raw, index) => ({
        at: value(`2026-W${String(index + 30).padStart(2, "0")}`), value: value(raw, "score"),
      })) }] });
    const goalTarget = value(48, "score");
    document.blocks = [
      { ...base("load_compare"), kind: "comparison_table", columns: [
        { id: "current", labelKey: "coach.answer.column.current" },
        { id: "previous", labelKey: "coach.answer.column.previous" },
        { id: "delta", labelKey: "coach.answer.column.delta" },
      ], rows: [comparison("ctl", 46, 51, 5), comparison("atl", 54, 62, 8), comparison("form", -8, -11, -3)] },
      trend("ctl", [41, 45, 51]), trend("atl", [49, 54, 62]), trend("form", [-8, -9, -11]),
      { ...base("load_goal"), kind: "goal_progress", goalId: "goal_dynamic", sourceLoadFactsId: "load_facts_dynamic",
        current: value(51, "score"), target: goalTarget },
    ];
    document.evidence = evidence;
    render(<CoachAnswerDocumentView response={response} locale="ko-KR" onAction={vi.fn()} />);

    const comparisonTable = screen.getByRole("table", { name: "현재 상태 비교" });
    expect(within(comparisonTable).getByRole("columnheader", { name: "이전 비교값" })).toBeInTheDocument();
    expect(within(comparisonTable).getByRole("row", { name: /CTL/ })).toHaveTextContent(/46\s*점51\s*점\+5\s*점/);
    expect(screen.getByLabelText("CTL 추세 값")).toHaveTextContent(/41\s*점 → 45\s*점 → 51\s*점/);
    expect(screen.getByRole("heading", { name: "CTL 목표" })).toBeInTheDocument();
    expect(documentElement().querySelector(`[data-evidence-id="${goalTarget.evidenceId}"]`)).toHaveTextContent(/48\s*점/);
    expect(screen.queryByText("달성")).not.toBeInTheDocument();
    expect(screen.queryByText("진행 중")).not.toBeInTheDocument();
    expect(screen.queryByText("7일 전 정본 일마감")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "서버가 제공한 시계열의 추세 차트" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "차트와 표로 보기" }));
    expect(screen.getAllByRole("img", { name: "서버가 제공한 시계열의 추세 차트" })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "차트와 표 접기" })).toHaveAttribute("aria-expanded", "true");
  });

  it("renders the typed load assessment without deriving goal, band, ordering or partial state", async () => {
    const { response, document, evidence, value, base } = fixture();
    const metrics = (ctl: number, atl: number, form: number) => ({ ctl: value(ctl, "score"), atl: value(atl, "score"), form: value(form, "score") });
    document.blocks = [{ ...base("typed_load"), kind: "load_analysis", assessment: {
      schemaVersion: "coach-load-assessment-v1", capabilityVersion: "p1", factsId: "load_facts_dynamic",
      asOf: value("2026-07-18T03:00:00.000Z"), timezone: "Asia/Seoul", discipline: "bike", sourceDateConvention: "utc_calendar_day",
      current: metrics(51, 62, -11), previousComparable: metrics(46, 54, -8), delta: metrics(5, 8, -3),
      comparisonBasis: "canonical_utc_day_7d_delta", weeklyTss: { basis: "user_local_monday_to_as_of",
        current: value(214, "tss"), previousComparable: value(180, "tss"), delta: value(34, "tss") },
      weeklyTrend: [
        { weekId: "2026-W28", period: { fromCanonicalDate: value("2026-07-06"), toCanonicalDate: value("2026-07-12") },
          partial: false, sampleBasis: "completed_week_end", ...metrics(46, 54, -8) },
        { weekId: "2026-W29", period: { fromCanonicalDate: value("2026-07-13"), toCanonicalDate: value("2026-07-18") },
          partial: true, sampleBasis: "current_as_of", ...metrics(51, 62, -11) },
      ],
      drivers: [{ activityId: "ride_dynamic", date: value("2026-07-17"), title: value("Dynamic Ride"), discipline: "bike",
        tss: value(143, "tss"), durationMin: value(181), distanceKm: value(112, "kilometers"), weeklyLoadContributionPct: value(66, "percent") }],
      goalAssessment: { goalId: "goal_dynamic", type: "ctl_target", target: value(55, "score"), current: value(51, "score"),
        achieved: value(false), evidenceIds: [] }, bandAssessment: { catalogVersion: "form-band-catalog-v1", bands: [{ id: "productive_load",
          metric: "form", minInclusive: value(-20, "score"), maxExclusive: value(-10, "score"), classification: "productive_load",
          labelKey: "coach.load.band.productive_load.label", explanationKey: "coach.load.band.productive_load.explanation", referenceId: "policy_2026" }],
        currentBandId: "productive_load", currentValue: value(-11, "score") }, classification: "productive_load",
      reasonCodes: ["ctl_increased_week_over_week"], confidence: "medium", missingSignals: [],
    } }];
    document.evidence = evidence;
    const action = vi.fn();
    const view = render(<CoachAnswerDocumentView response={response} locale="ko-KR" onAction={action} />);
    const comparison = screen.getByRole("table", { name: "현재 상태 비교" });
    expect(within(comparison).getByRole("columnheader", { name: "7일 전 정본 일마감" })).toBeInTheDocument();
    expect(within(comparison).getByRole("row", { name: /CTL/ })).toHaveTextContent(/46\s*점51\s*점\+5\s*점/);
    expect(screen.getByText("아직 미달성")).toBeInTheDocument();
    expect(screen.getByText("생산적 부하")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "차트와 표로 보기" }));
    expect(screen.getByRole("table", { name: "주간 정본 CTL·ATL·Form" })).toHaveTextContent("2026-07-06");
    expect(screen.getByText("진행 중")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dynamic Ride" }));
    expect(action).toHaveBeenCalledWith("OPEN_ACTIVITY", expect.objectContaining({ entityId: "ride_dynamic" }));
    view.unmount();
    const chartView = render(<CoachAnswerDocumentView response={response} responseFormat="chart" locale="ko-KR" onAction={action} />);
    expect(within(chartView.container).getByRole("img", { name: "서버가 제공한 시계열의 추세 차트" })).toBeInTheDocument();
    expect(within(chartView.container).queryByRole("button", { name: "차트와 표로 보기" })).not.toBeInTheDocument();
    chartView.unmount();
    const tableView = render(<CoachAnswerDocumentView response={response} responseFormat="table" locale="ko-KR" onAction={action} />);
    expect(within(tableView.container).getByRole("table", { name: "주간 정본 CTL·ATL·Form" })).toBeInTheDocument();
    expect(within(tableView.container).queryByRole("img", { name: "서버가 제공한 시계열의 추세 차트" })).not.toBeInTheDocument();
  });
});

function documentElement(): HTMLElement {
  return window.document.documentElement;
}

function formatEvidenceDate(value: string, locale: string, timezone: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
}
