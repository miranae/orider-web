import { render, screen } from "@testing-library/react";
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
    expect(screen.getByTestId("K5-1-3-sufficiency-action").getAttribute("href")).toContain("/coach/condition#thresholds");
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
 it("기능 4개의 남은 수를 더하지 않고 대표 행동은 하나만 표시한다",()=>{
  const blocks=["power_model","vo2max","ftp_estimate","rider_profile"].map(featureId=>sufficiencyBlock({featureId,remainingRequirementCount:2}));
  renderUi(<SufficiencyGroup set={sufficiencySet(blocks)} testId="G"/>);
  expect(screen.getByTestId("G")).toHaveTextContent("잠긴 기능 4개");
  expect(screen.getAllByTestId("G-action")).toHaveLength(1);
  expect(screen.getByTestId("G")).not.toHaveTextContent("남은 요건 8개");
 });
});
