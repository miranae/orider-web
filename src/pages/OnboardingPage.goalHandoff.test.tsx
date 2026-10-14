import { fireEvent, screen, within } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { mockCallableInvocations, setCallableImplementation, setCollectionDocs } from "../__tests__/mocks/firebase";
import OnboardingPage from "./OnboardingPage";
import GoalSetupPage from "./GoalSetupPage";
import PlanPage from "./PlanPage";

vi.mock("../hooks/useMobile", () => ({ useMobile: () => false }));
vi.mock("../hooks/useStrava", () => ({ useStrava: () => ({ connectStrava: vi.fn() }) }));
vi.mock("../hooks/useFreshTraining", () => ({ useFreshTraining: () => ({ revalidating: false, justRecomputed: false, currentTsb: null }) }));
vi.mock("../features/training/run30/useRun30Program", () => ({ useRun30Program: () => ({ status: "ready", program: null, api: {}, refresh: vi.fn(), retry: vi.fn() }) }));

function LocationReceipt() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

describe("actual onboarding goal handoff", () => {
  it("creates a running goal through the real wizard and renders its plan instead of landing at home", async () => {
    const before = mockCallableInvocations.length;
    setCallableImplementation("createGoal", data => {
      expect(data).toMatchObject({ discipline: "run", eventId: "half", eventDate: expect.any(String) });
      setCollectionDocs("goals", [{ id: "created-run-goal", userId: "test-uid", status: "active", discipline: "run",
        title: "Created running goal", courseName: "Half marathon", courseDist: 21.1, courseElev: 140, eventType: "time", eventDate: Date.now() + 40 * 86400000, createdAt: Date.now() }]);
      setCollectionDocs("goals/created-run-goal/plan", []);
      return { data: { goalId: "created-run-goal" } };
    });
    const { container } = renderWithProviders(<><LocationReceipt /><Routes>
      <Route path="/:lang/onboarding" element={<OnboardingPage />} />
      <Route path="/:lang/goal-setup" element={<GoalSetupPage />} />
      <Route path="/:lang/coach/plan" element={<PlanPage />} />
      <Route path="/:lang/" element={<p>Home landing</p>} />
    </Routes></>, { authenticated: true, route: "/ko/onboarding", profile: { onboardingStep: "goal", primaryDiscipline: "run" } });

    fireEvent.click(await screen.findByRole("button", { name: "목표 설정하기" }));
    expect(await screen.findByRole("heading", { name: "3분 안에 나만의 러닝 운동 계획 만들기" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/ko/goal-setup?source=onboarding&sport=run&returnTo=%2F");
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(container.querySelector('button[aria-haspopup="dialog"]')!);
    const calendar = screen.getByRole("dialog");
    fireEvent.click(within(calendar).getByRole("button", { name: /다음 달/ }));
    const enabledDate = within(calendar).getAllByRole("gridcell").find(cell => !(cell as HTMLButtonElement).disabled)!;
    fireEvent.click(enabledDate);
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByTestId("K3-3-7"));
    expect(await screen.findByRole("heading", { name: "Created running goal" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/ko/coach/plan?sport=run&goalId=created-run-goal");
    expect(screen.queryByText("Home landing")).not.toBeInTheDocument();
    expect(mockCallableInvocations.slice(before).filter(call => call.name === "createGoal")).toHaveLength(1);
  });
});
