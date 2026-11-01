import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import StartJourney from "./StartJourney";
const fixture = vi.hoisted(() => ({ user: null as { uid: string; isAnonymous?: boolean } | null, signIn: vi.fn(), request: vi.fn(), available: true }));
vi.mock("../../../contexts/AuthContext", async importOriginal => ({ ...await importOriginal<typeof import("../../../contexts/AuthContext")>(), useAuth: () => ({ user: fixture.user, loading: false, signIn: fixture.signIn }) }));
vi.mock("./firstWorkoutClient", () => ({ firstWorkoutLocalAvailable: () => fixture.available, firstWorkoutRequest: fixture.request }));
beforeEach(() => {
  fixture.user = null; fixture.available = true; fixture.signIn.mockReset(); fixture.request.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
describe("shared starting journey", () => {
  it("lets a guest switch sports and preview without authentication or saving", () => {
    renderWithProviders(<StartJourney sport="bike" activeGoal={false} />, { route: "/ko/coach/goals?sport=bike&start=choose" });
    fireEvent.click(screen.getByRole("button", { name: "러닝", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "운동 골라보기" }));
    expect(screen.getByRole("button", { name: "30분 달리기 입문 보기" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "처음이에요" }));
    fireEvent.click(screen.getByRole("button", { name: "첫 운동 미리보기" }));
    expect(screen.getByRole("heading", { name: "걷기부터 시작하는 첫 러닝" })).toBeVisible();
    expect(fixture.signIn).not.toHaveBeenCalled();
    expect(fixture.request).not.toHaveBeenCalled();
  });
  it("never creates a workout from sign-in alone", async () => {
    fixture.signIn.mockResolvedValue(undefined);
    renderWithProviders(<StartJourney sport="bike" activeGoal={false} />, { route: "/ko/coach/goals?sport=bike&start=preview" });
    fireEvent.click(screen.getByRole("button", { name: "로그인하고 이어가기" }));
    await waitFor(() => expect(fixture.signIn).toHaveBeenCalledOnce());
    expect(fixture.request).not.toHaveBeenCalled();
    expect(screen.getByLabelText("운동할 날짜")).toBeVisible();
  });
  it("routes existing plans to their own sport without an extra workout", () => {
    fixture.user = { uid: "owner" };
    renderWithProviders(<StartJourney sport="run" activeGoal />, { route: "/ko/coach/goals?sport=run&start=preview" });
    expect(screen.getByRole("link", { name: "현재 계획 보기" })).toHaveAttribute("href", "/ko/coach/plan?sport=run");
    expect(screen.queryByRole("button", { name: "이 운동을 내 계획에 저장" })).not.toBeInTheDocument();
    expect(fixture.request).not.toHaveBeenCalled();
  });
  it("keeps unshipped single workouts hidden outside the local capability", () => {
    fixture.available = false;
    renderWithProviders(<StartJourney sport="bike" activeGoal={false} />, { route: "/ko/coach/goals?sport=bike&start=workout" });
    expect(screen.queryByRole("button", { name: "첫 운동 미리보기" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "코스·완주 목표 선택" })).toBeVisible();
  });
});
