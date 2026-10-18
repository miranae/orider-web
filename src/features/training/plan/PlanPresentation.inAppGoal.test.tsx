import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlanModel } from "../../../hooks/usePlanModel";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import PlanPresentation from "./PlanPresentation";

const wizard = vi.hoisted(() => ({ props: null as null | { inAppHost?: boolean; onCreated?: (goalId: string) => void } }));
vi.mock("../../../pages/GoalSetupPage", () => ({
  GoalWizard: (props: { inAppHost?: boolean; onCreated?: (goalId: string) => void }) => {
    wizard.props = props;
    return <button type="button" onClick={() => props.onCreated?.("goal-new")}>목표 마법사</button>;
  },
}));

const emptyModel = (retryLoad = vi.fn()) => ({
  discipline: "bike", goal: null, weeks: [], loading: false, loadError: null, goalMatchesDiscipline: false,
  revalidating: false, justRecomputed: false, isTodayCell: () => false, retryLoad,
}) as unknown as PlanModel;

describe("PlanPresentation in-app goal setup", () => {
  it("opens the goal wizard inside the embedded plan instead of a dead-end retry", async () => {
    const retryLoad = vi.fn();
    renderWithProviders(<PlanPresentation model={emptyModel(retryLoad)} embedded mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
    expect(screen.getByText("아래에서 사이클 목표를 정하면 바로 계획이 만들어집니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    (await screen.findByRole("button", { name: "목표 마법사" })).click();
    expect(wizard.props?.inAppHost).toBe(true);
    expect(retryLoad).toHaveBeenCalled();
  });

  it("keeps the goal setup link on the standalone web", () => {
    renderWithProviders(<PlanPresentation model={emptyModel()} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
    expect(screen.getByRole("link", { name: "사이클 목표 설정하기" })).toHaveAttribute("href", expect.stringContaining("/goal-setup?sport=bike"));
    expect(screen.queryByTestId("embedded-plan-goal-wizard")).not.toBeInTheDocument();
  });
});
