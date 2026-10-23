import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import i18n from "../../i18n";
import { SufficiencyCard, SufficiencyInline, SufficiencyGroup } from "./SufficiencyBlock";
import { resetSufficiencyViewDedupeForTest } from "./sufficiencyAnalytics";
import { sufficiencyBlock, sufficiencySet } from "./__fixtures__";

const track = vi.hoisted(() => vi.fn());
vi.mock("../../services/analytics", () => ({ track }));
vi.mock("../../services/impersonation", () => ({ readImpersonation: () => ({ status: "none" }) }));

const renderUi = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("SufficiencyCard", () => {
  beforeEach(async () => { track.mockClear(); resetSufficiencyViewDedupeForTest(); await i18n.changeLanguage("ko"); });

  it("충분조건 하나만 남으면 「바로 열려요」와 입력 링크", () => {
    const block = sufficiencyBlock();
    renderUi(<SufficiencyCard set={sufficiencySet([block])} block={block} testId="K5-1-3-sufficiency" />);
    expect(screen.getByTestId("K5-1-3-sufficiency-state").textContent).toBe("체중 입력하면 바로 열려요");
    expect(screen.getByTestId("K5-1-3-sufficiency-action").getAttribute("href")).toContain("/settings/account#body-info");
  });

  it("최소조건이 남으면 「바로」라고 하지 않고 남은 개수와 제외 사유를 말한다", () => {
    const block = sufficiencyBlock({ featureId: "power_model", viewId: "cp_w_prime", remainingRequirementCount: 2,
      nextAction: { code: "connect_power_meter" }, requirements: [
        { requirementId: "measured_power_activities", kind: "count", satisfaction: "not_met", guarantee: "minimum",
          target: { value: 1, unit: "activity" }, current: { value: 0, unit: "activity" },
          excluded: [{ reason: "virtual_power", count: 4 }] },
        { requirementId: "effort_3_20min_points", kind: "count", satisfaction: "not_met", guarantee: "minimum",
          target: { value: 2, unit: "point" }, current: { value: 0, unit: "point" } },
      ] });
    renderUi(<SufficiencyCard set={sufficiencySet([block])} block={block} testId="K5-1-4-sufficiency" />);
    const state = screen.getByTestId("K5-1-4-sufficiency-state").textContent ?? "";
    expect(state).toBe("계산에 필요한 조건이 2개 남았어요");
    expect(state).not.toContain("바로");
    expect(screen.getByTestId("sufficiency-req-measured_power_activities").textContent)
      .toContain("최소 1개부터 계산을 시도해요 · 지금 0개 (제외 가상 파워 4개)");
    expect(screen.getByTestId("K5-1-4-sufficiency-action").getAttribute("href")).toContain("/settings/device");
  });

  it("지연이면 요건·행동·현재값을 보여 주지 않는다", () => {
    const block = sufficiencyBlock();
    renderUi(<SufficiencyCard set={sufficiencySet([block], { staleAfter: 1 })} block={block} testId="K" />);
    expect(screen.getByTestId("K-state").textContent).toBe("지금은 확인할 수 없어요");
    expect(screen.queryByTestId("K-requirements")).toBeNull();
    expect(screen.queryByTestId("K-action")).toBeNull();
  });

  it.each(["delayed", "processing"] as const)("%s: 이미 충족한 조건과 미확정 분석을 알리고 추가 기록 행동은 요구하지 않는다", state => {
    const block = sufficiencyBlock({ featureId: "power_model", state, remainingRequirementCount: 0,
      nextAction: { code: "record_power_ride" }, requirements: [
        { requirementId: "measured_power_activities", kind: "count", satisfaction: "met", guarantee: "minimum",
          target: { value: 1, unit: "activity" }, current: { value: 20, unit: "activity" },
          excluded: [{ reason: "metrics_pending", count: 1 }] },
      ] });
    renderUi(<SufficiencyCard set={sufficiencySet([block], { nextUpdateAt: Date.now() + 86400000 })} block={block} testId="pending" />);
    expect(screen.getByTestId("pending-explanation")).toHaveTextContent("일부 활동의 분석 결과가 확정되지 않아");
    expect(screen.getByTestId("pending-explanation")).toHaveTextContent("확인된 계산 조건은 모두 충족");
    expect(screen.getByTestId("pending-requirements")).toHaveTextContent("실측 파워 기록 20개");
    expect(screen.getByTestId("pending-requirements")).toHaveTextContent("분석 결과 미확정 1개");
    expect(screen.getByTestId("pending")).toHaveTextContent("결과를 확인할 수 있는 날짜는 아직 정해지지 않았어요");
    expect(screen.queryByTestId("pending-action")).toBeNull();
    expect(screen.queryByTestId("pending-remaining")).toBeNull();
  });

  it("만료된 조건은 현재 충족 여부나 미확정 분석 원인으로 단정하지 않는다", () => {
    const block = sufficiencyBlock({ state: "delayed", remainingRequirementCount: 0, nextAction: null,
      requirements: [{ requirementId: "measured_power_activities", kind: "count", satisfaction: "met", guarantee: "minimum",
        current: { value: 20, unit: "activity" }, excluded: [{ reason: "metrics_pending", count: 1 }] }] });
    renderUi(<SufficiencyCard set={sufficiencySet([block], { staleAfter: 1 })} block={block} testId="stale" />);
    expect(screen.getByTestId("stale-explanation")).toHaveTextContent("갱신 기한이 지나");
    expect(screen.getByTestId("stale-explanation")).not.toHaveTextContent("모두 충족");
    expect(screen.queryByTestId("stale-requirements")).toBeNull();
  });

  it("노출 이벤트는 같은 블록에 한 번만, uid 없이 보낸다", () => {
    const block = sufficiencyBlock();
    const set = sufficiencySet([block]);
    const { rerender } = renderUi(<SufficiencyCard set={set} block={block} testId="K" />);
    rerender(<MemoryRouter><SufficiencyCard set={set} block={block} testId="K" /></MemoryRouter>);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("data_sufficiency_view", expect.objectContaining({
      subject_key: "a".repeat(32), feature_id: "vo2max", state: "locked", surface: "card", delegated: false }));
  });
});

describe("SufficiencyInline", () => {
  beforeEach(async () => { track.mockClear(); resetSufficiencyViewDedupeForTest(); await i18n.changeLanguage("ko"); });

  it("가정값 결과에는 칩과 확인 행동을 함께 둔다", () => {
    const block = sufficiencyBlock({ state: "low_evidence", nextAction: { code: "confirm_weight" },
      source: { basis: "measured", assumedInputs: ["weightKg"] } });
    renderUi(<SufficiencyInline set={sufficiencySet([block])} block={block} testId="K5-1-3-sufficiency-inline" />);
    const inline = screen.getByTestId("K5-1-3-sufficiency-inline");
    expect(inline.textContent).toContain("가정값");
    expect(screen.getByTestId("K5-1-3-sufficiency-inline-action").textContent).toContain("내 체중 확인");
  });

  it("열린 기능에는 아무것도 그리지 않는다", () => {
    const block = sufficiencyBlock({ state: "open", nextAction: null, remainingRequirementCount: 0 });
    renderUi(<SufficiencyInline set={sufficiencySet([block])} block={block} testId="I" />);
    expect(screen.queryByTestId("I")).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });
});


describe("충분도 표시의 대기·묶음 규칙", () => {
 it("만료된 값 옆에서도 가정값 칩을 보존하고 현재 요건·행동은 숨긴다",()=>{
  const block=sufficiencyBlock({state:"low_evidence",nextAction:{code:"confirm_weight"},source:{basis:"measured",assumedInputs:["weightKg"]}});
  renderUi(<SufficiencyInline set={sufficiencySet([block],{staleAfter:1})} block={block} testId="I"/>);
  expect(screen.getByTestId("I")).toHaveTextContent("가정값");
  expect(screen.getByTestId("I")).toHaveTextContent("지금은 확인할 수 없어요");
  expect(screen.queryByTestId("I-action")).toBeNull();
  expect(screen.queryByTestId("I-requirement")).toBeNull();
 });
 it("열린 컨디션에서는 지연된 계산 근거를 잠김으로 바꾸거나 상세에 숨기지 않는다",()=>{
  const blocks=["power_model","vo2max","ftp_estimate","rider_profile"].map(featureId=>sufficiencyBlock({featureId,state:"delayed",remainingRequirementCount:0,nextAction:null}));
  renderUi(<SufficiencyGroup inline set={sufficiencySet(blocks, { nextUpdateAt: Date.now() + 86400000 })} testId="G"/>);
  expect(screen.getByTestId("G")).toHaveTextContent("계산 근거 확인 · 4개 지표");
  expect(screen.getAllByText("마지막 계산에서 확인한 조건")).toHaveLength(4);
  expect(screen.getAllByTestId("sufficiency-req-power_5min_or_cp")).toHaveLength(4);
  expect(screen.getAllByText("재계산 예정일이며, 결과를 확인할 수 있는 날짜는 아직 정해지지 않았어요.")).toHaveLength(1);
  expect(screen.getByTestId("G").querySelector("details")).toBeNull();
  expect(screen.getAllByText("지금은 확인할 수 없어요")).toHaveLength(4);
  expect(screen.getByTestId("G")).not.toHaveTextContent("잠긴 기능");
 });
 it("기능 4개의 남은 수를 더하지 않고 대표 행동은 하나만 표시한다",()=>{
  const blocks=["power_model","vo2max","ftp_estimate","rider_profile"].map(featureId=>sufficiencyBlock({featureId,remainingRequirementCount:2}));
  renderUi(<SufficiencyGroup set={sufficiencySet(blocks)} testId="G"/>);
  expect(screen.getByTestId("G")).toHaveTextContent("잠긴 기능 4개");
  expect(screen.getAllByTestId("G-action")).toHaveLength(1);
  expect(screen.getByTestId("G")).not.toHaveTextContent("남은 요건 8개");
 });
});


it("compact open evidence preserves each requirement/action and deduplicates identical timing only", () => {
  const blocks = ["power_model", "vo2max", "ftp_estimate", "rider_profile"].map(featureId => sufficiencyBlock({ featureId }));
  renderUi(<SufficiencyGroup inline set={sufficiencySet(blocks)} testId="compact" />);
  const group = screen.getByTestId("compact");
  expect(group.querySelectorAll("article")).toHaveLength(4);
  expect(group.querySelectorAll("details")).toHaveLength(0);
  expect(group.querySelectorAll('a[href="/ko/settings/account#body-info"]')).toHaveLength(4);
  expect(screen.getAllByTestId("sufficiency-req-weight")).toHaveLength(4);
});

it("does not present expired or pending evidence as current unmet requirements", () => {
  const delayed = sufficiencyBlock({ state: "delayed", remainingRequirementCount: 0, nextAction: null });
  const pending = sufficiencyBlock({ featureId: "power_model", state: "processing", remainingRequirementCount: 2 });
  const view = renderUi(<SufficiencyGroup sets={[sufficiencySet([delayed, pending, { ...delayed, featureId: "rider_profile" }, { ...pending, featureId: "ftp_estimate" }])]} testId="status-group" />);
  expect(screen.getByTestId("status-group")).not.toHaveTextContent("잠긴 기능");
  expect(screen.getByTestId("status-group")).not.toHaveTextContent("남은 요건");
  view.unmount();
  const zero = sufficiencyBlock({ remainingRequirementCount: 0, nextAction: null });
  renderUi(<SufficiencyCard set={sufficiencySet([zero])} block={zero} testId="zero" />);
  expect(screen.getByTestId("zero")).toHaveTextContent("계산 결과를 아직 확인할 수 없어요");
  expect(screen.queryByTestId("zero-remaining")).not.toBeInTheDocument();
});

it("keeps each server action available behind a native evidence disclosure", () => {
  const rows = ["power_model", "vo2max", "rider_profile", "ftp_estimate"].map(featureId => sufficiencyBlock({ featureId }));
  renderUi(<SufficiencyGroup collapsible set={sufficiencySet(rows)} testId="readiness" />);
  const group = screen.getByTestId("readiness");
  const summary = screen.getByText("계산 근거 확인 · 4개 지표").closest("summary")!;
  expect(group.querySelector("details")).not.toHaveAttribute("open");
  fireEvent.click(summary);
  expect(group.querySelector("details")).toHaveAttribute("open");
  expect(screen.getByTestId("readiness-vo2max-current-action")).toBeVisible();
  fireEvent.click(summary);
  expect(group.querySelector("details")).not.toHaveAttribute("open");
});


it("shows one existing actionable requirement without a long repeated block list in the coach summary", () => {
  const blocks = ["power_model", "vo2max", "rider_profile", "ftp_estimate"].map(featureId => sufficiencyBlock({ featureId, nextAction: { code: "connect_power_meter" } }));
  renderUi(<SufficiencyGroup summaryOnly set={sufficiencySet(blocks)} testId="summary" />);
  expect(screen.getByTestId("summary-action")).toHaveAttribute("href", "/ko/settings/device");
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.queryByTestId("summary-expand")).not.toBeInTheDocument();
});


describe("load quality evidence without activity-count claims", () => {
  const load = (extra: Partial<ReturnType<typeof sufficiencyBlock>> = {}) => sufficiencyBlock({
    featureId: "load_history", viewId: "form", state: "low_evidence", remainingRequirementCount: 1,
    nextAction: { code: "record_activity" }, source: { basis: "estimated", assumedInputs: [] },
    requirements: [
      { requirementId: "load_days", kind: "count", satisfaction: "met", guarantee: "sufficient", current: {value:300,unit:"day"},target:{value:1,unit:"day"} },
      { requirementId: "load_history_period", kind: "period", satisfaction: "met", guarantee: "sufficient",current:{value:42,unit:"day"},target:{value:42,unit:"day"} },
      { requirementId: "load_quality", kind: "quality", satisfaction: "not_met", guarantee: "unpredictable" },
    ], ...extra,
  });
  beforeEach(async () => { await i18n.changeLanguage("ko"); });
  it("names the quality requirement alongside a long established history, without asking for one more ride or hardware", () => {
    const block=load();
    renderUi(<SufficiencyInline set={sufficiencySet([block])} block={block} testId="quality" />);
    expect(screen.getByTestId("quality")).toHaveTextContent("부하가 잡힌 날 300일");
    expect(screen.getByTestId("quality")).toHaveTextContent("추정 또는 혼합 부하 포함");
    expect(screen.getByTestId("quality")).toHaveTextContent("수치로 정한 완료 기준이 제공되지 않아요");
    expect(screen.getByTestId("quality")).not.toHaveTextContent("파워미터 연결");
    expect(screen.getByTestId("quality")).not.toHaveTextContent("남은 요건 1개");
    expect(screen.getByTestId("quality-review")).toHaveAttribute("href","/ko/athlete/me/activities?sport=bike");
    expect(screen.getByTestId("quality-action")).toHaveAttribute("href","/ko/settings/connections");
  });
  it("shows both period and quality issues rather than only the first one", () => {
    const block=load(); block.remainingRequirementCount=2;
    block.requirements[1]={...block.requirements[1]!,satisfaction:"not_met",current:{value:10,unit:"day"}};
    renderUi(<SufficiencyInline set={sufficiencySet([block])} block={block} testId="mixed" />);
    expect(screen.getByTestId("mixed")).toHaveTextContent("첫 기록 10일째");
    expect(screen.getByTestId("mixed")).toHaveTextContent("추정 또는 혼합 부하 포함");
    expect(screen.queryByTestId("mixed-remaining")).not.toBeInTheDocument();
    expect(screen.getByTestId("mixed")).toHaveTextContent("품질 평가 기준 시점");
    expect(screen.getByTestId("mixed")).toHaveTextContent("시작·끝과 원인 날짜가 제공되지 않습니다");
  });
  it.each(["processing","delayed"] as const)("does not present stale or unfinished quality as a current actionable requirement: %s", state => {
    const block=load({state,nextAction:null});
    renderUi(<SufficiencyInline set={sufficiencySet([block])} block={block} testId="pending" />);
    expect(screen.queryByTestId("pending-requirement")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pending-action")).not.toBeInTheDocument();
  });
  it("admits that an owner supplied a count without the requirement details", () => {
    const block=load({requirements:[],nextAction:null});
    renderUi(<SufficiencyInline set={sufficiencySet([block])} block={block} testId="unknown" />);
    expect(screen.getByTestId("unknown")).toHaveTextContent("일부 항목의 설명을 확인할 수 없어요");
  });
});
