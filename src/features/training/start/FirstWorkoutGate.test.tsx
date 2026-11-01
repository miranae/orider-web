import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { seoulDate } from "./firstWorkout";
import FirstWorkoutGate from "./FirstWorkoutGate";
const fixture = vi.hoisted(() => ({ user: { uid: "owner" } as { uid: string } | null, request: vi.fn() }));
vi.mock("../../../contexts/AuthContext", async importOriginal => ({ ...await importOriginal<typeof import("../../../contexts/AuthContext")>(), useAuth: () => ({ user: fixture.user }) }));
vi.mock("./firstWorkoutClient", () => ({ firstWorkoutLocalAvailable: () => true, firstWorkoutRequest: fixture.request }));
const saved = () => ({ id: "first-session", sport: "bike", date: seoulDate(), revision: 1, template: "bike-first-local-v1", status: "scheduled" });
beforeEach(() => { fixture.user = { uid: "owner" }; fixture.request.mockReset(); });
describe("saved first workout", () => {
  it("saves native date input edits with the current revision", async () => {
    const next = seoulDate(Date.now() + 86400000);
    fixture.request.mockResolvedValueOnce(saved()).mockResolvedValueOnce({ ...saved(), date: next, revision: 2 });
    renderWithProviders(<FirstWorkoutGate sport="bike"><div>Existing plan</div></FirstWorkoutGate>);
    fireEvent.click(await screen.findByRole("button", { name: "날짜 바꾸기" }));
    fireEvent.input(screen.getByLabelText("운동할 날짜"), { target: { value: next } });
    fireEvent.click(screen.getByRole("button", { name: "날짜 변경 저장" }));
    await waitFor(() => expect(fixture.request).toHaveBeenLastCalledWith("bike", { action: "move", id: "first-session", revision: 1, date: next }));
    expect(await screen.findByText(next)).toBeVisible();
  });
  it("keeps a failed cancellation visible and offers a fresh read", async () => {
    fixture.request.mockResolvedValueOnce(saved()).mockRejectedValueOnce(new Error("stale"));
    renderWithProviders(<FirstWorkoutGate sport="bike"><div>Existing plan</div></FirstWorkoutGate>);
    fireEvent.click(await screen.findByRole("button", { name: "예약 취소" }));
    expect(await screen.findByRole("button", { name: "다시 확인하기" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "편안하게 시작하는 첫 라이딩" })).toBeVisible();
    expect(screen.queryByText("Existing plan")).not.toBeInTheDocument();
  });
  it("does not expose an old account workout while the next account loads", async () => {
    fixture.request.mockResolvedValueOnce(saved());
    const view = renderWithProviders(<FirstWorkoutGate sport="bike"><div>Existing plan</div></FirstWorkoutGate>);
    await screen.findByRole("button", { name: "예약 취소" });
    fixture.user = { uid: "different-owner" };
    fixture.request.mockImplementationOnce(() => new Promise(() => {}));
    view.rerender(<FirstWorkoutGate sport="bike"><div>Existing plan</div></FirstWorkoutGate>);
    expect(screen.queryByRole("button", { name: "예약 취소" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeVisible();
  });
});
