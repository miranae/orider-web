import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import PlanRecordEvidence from "./PlanRecordEvidence";
import PlanRecordNavigation from "./PlanRecordNavigation";

describe("plan / recorded activity loop", () => {
  it("preserves sport and selected period between the existing canonical screens", () => {
    renderWithProviders(<PlanRecordNavigation date="2026-10-14" />, { route: "/ko/coach/plan?sport=run&decisionId=unrelated" });
    expect(screen.getByRole("link", { name: "활동 기록·수행 확인" })).toHaveAttribute("href", "/ko/athlete/me/activities?sport=run&date=2026-10-14");
    expect(screen.getByRole("link", { name: "훈련 계획" })).toHaveAttribute("href", "/ko/coach/plan?sport=run&date=2026-10-14");
  });
  it("shows only saved linkage and load, and keeps an unlinked same-day workout distinct", () => {
    renderWithProviders(<PlanRecordEvidence date="2026-10-14" plans={[
      { discipline: "bike", workout: "z2", plannedTSS: 50, plannedDurationMin: 60, actualActivityId: "ride-1", actualTSS: 42 },
      { discipline: "run", workout: "tempo", plannedTSS: 40, plannedDurationMin: 30 },
    ]} />);
    const comparison = screen.getByRole("region", { name: "계획과 실제 기록" });
    expect(comparison).toHaveTextContent("계획 · 사이클 · Z2 지구력 · 50 TSS · 60분");
    expect(comparison).toHaveTextContent("저장된 연결 부하 · 42 TSS");
    expect(comparison).toHaveTextContent("같은 날의 기록이나 부하만으로 계획 완료를 판단하지 않습니다");
    expect(within(comparison).getByRole("link", { name: "활동 보기 →" })).toHaveAttribute("href", "/ko/activity/ride-1");
    expect(within(comparison).getAllByRole("link", { name: /다음 활동 조정/ })[1]).toHaveAttribute("href", "/ko/coach/plan?sport=run&date=2026-10-14");
  });
});


it("separates saved partial outcome, confirmed zero, and an ambiguous legacy candidate without offering mutations", () => {
  renderWithProviders(<PlanRecordEvidence date="2026-10-14" today="2026-10-15" plans={[
    { discipline: "bike", workout: "z2", plannedTSS: 50, plannedDurationMin: 60, actualActivityId: "ride/zero", actualTSS: 0, completed: true, executionStatus: "partial", matchMethod: "manual", matchConfidence: "manual" },
    { discipline: "run", workout: "tempo", plannedTSS: 0, plannedDurationMin: 30, actualActivityId: "possible-ride", actualTSS: 0, completed: true, matchMethod: "legacy-time-window", matchConfidence: "probable" },
  ]} />);
  expect(screen.getByText("부분 완료로 기록됨")).toBeVisible();
  expect(screen.getByText("계획에 저장된 연결 부하 · 0 TSS")).toBeVisible();
  expect(screen.getByText("완료 표시 · 연결 근거 확인 필요")).toBeVisible();
  expect(screen.getByRole("link", { name: "연결 후보 활동 보기" })).toHaveAttribute("href", "/ko/activity/possible-ride");
  expect(screen.getByRole("link", { name: "활동 보기 →" })).toHaveAttribute("href", "/ko/activity/ride%2Fzero");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getAllByText(/같은 날의 기록이나 부하만으로/)).toHaveLength(1);
});


it("does not ask an ordinary rest plan to acquire an activity link", () => {
  renderWithProviders(<PlanRecordEvidence date="2026-10-14" today="2026-10-15" plans={[
    { discipline: "bike", workout: "rest", plannedTSS: 0, plannedDurationMin: 0 },
  ]} />);
  expect(screen.getByText("휴식 계획")).toBeVisible();
  expect(screen.queryByText("활동 미연결")).not.toBeInTheDocument();
  expect(screen.queryByText("수행 여부 미확인")).not.toBeInTheDocument();
});


it("keeps the candidate snapshot separate from detail analysis and carries the full return context", async () => {
  const { fireEvent } = await import("@testing-library/react");
  const { Routes, Route, useLocation } = await import("react-router-dom");
  const { default: PlanComparisonReturn } = await import("./PlanComparisonReturn");
  const route = "/ko/athlete/me/activities?sport=bike&date=2026-10-14&range=90&detail=record-day#comparison";
  const Location = () => <output>{useLocation().search}</output>;
  renderWithProviders(<Routes><Route path="/ko/athlete/me/activities" element={<><Location /><PlanRecordEvidence date="2026-10-14" plans={[{ discipline: "bike", workout: "z2", plannedTSS: 65, plannedDurationMin: 90, probableActivityId: "synthetic-candidate", probableTSS: 100 }]} /></>} /><Route path="/ko/coach/plan" element={<PlanComparisonReturn />} /></Routes>, { route });
  expect(screen.getByText("추정 후보의 저장 부하 · 100 TSS")).toBeVisible();
  expect(screen.getByText(/산정 방식과 저장 시각이 제공되지 않아/)).toBeVisible();
  expect(screen.getByText(/연결 확인 전에는/)).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: /다음 활동 조정/ }));
  expect(screen.getByRole("link", { name: "원래 날짜의 수행 비교로 돌아가기" })).toHaveAttribute("href", route);
  fireEvent.click(screen.getByRole("link", { name: "원래 날짜의 수행 비교로 돌아가기" }));
  expect(screen.getByRole("status")).toHaveTextContent("range=90&detail=record-day");
});
