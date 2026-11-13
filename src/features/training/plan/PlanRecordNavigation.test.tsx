import { screen } from "@testing-library/react";
import { it, expect } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import PlanRecordNavigation from "./PlanRecordNavigation";
it("keeps selected sport and date for plan/records and has no today tab", () => {
  renderWithProviders(<PlanRecordNavigation date="2026-09-03" />, { route: "/ko/coach/plan?sport=run&date=2026-09-03" });
  // 코치 "오늘 훈련" 탭은 없앴다(2026-11-13).
  expect(screen.queryByRole("link", { name: "오늘 훈련" })).toBeNull();
  expect(screen.getByRole("link", { name: "훈련 계획" })).toHaveAttribute("href", "/ko/coach/plan?sport=run&date=2026-09-03");
  expect(screen.getByRole("link", { name: "활동 기록·수행 확인" })).toHaveAttribute("href", "/ko/athlete/me/activities?sport=run&date=2026-09-03");
});

it.each([
  ["all", "bike", "all"], ["tri", "bike", "all"], ["", "bike", "all"],
])("keeps record all and coach tri semantics distinct sport=%s", (sport, coach, records) => {
  renderWithProviders(<PlanRecordNavigation date="2026-09-03" />, { route: `/ko/athlete/me/activities${sport ? `?sport=${sport}` : ""}` });
  expect(screen.getByRole("link", { name: "훈련 계획" })).toHaveAttribute("href", `/ko/coach/plan?sport=${coach}&date=2026-09-03`);
  expect(screen.getByRole("link", { name: "활동 기록·수행 확인" })).toHaveAttribute("href", `/ko/athlete/me/activities?sport=${records}&date=2026-09-03`);
});

it("러닝 활동 기록에서 프로그램이 유지된 계획 탭으로 종목을 넘긴다", () => {
  renderWithProviders(<PlanRecordNavigation />, { route: "/ko/athlete/me/activities?sport=run" });
  expect(screen.getByRole("link", { name: "훈련 계획" })).toHaveAttribute("href", "/ko/coach/plan?sport=run");
});
