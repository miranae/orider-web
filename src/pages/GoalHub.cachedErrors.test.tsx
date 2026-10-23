import { fireEvent, screen, waitFor } from "@testing-library/react";
import { getDocs } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setCollectionDocs } from "../__tests__/mocks/firebase";
import { clearTrainingSurfaceCache, prepareTrainingSurfaceCacheOwner, setTrainingSurfaceCache } from "../embedded/trainingSurfaceCache";
import GoalHub from "./GoalHub";

const session = vi.hoisted(() => ({ user: { uid: "owner" } }));
vi.mock("../contexts/AuthContext", async importOriginal => ({ ...await importOriginal<typeof import("../contexts/AuthContext")>(), useAuth: () => session }));

vi.mock("../hooks/useFreshTraining", () => ({ useFreshTraining: () => ({ revalidating: false, justRecomputed: false, currentTsb: null }) }));
vi.mock("./ClimbGoalSetupPage", () => ({ default: () => <div>climb form</div> }));

beforeEach(() => {
  clearTrainingSurfaceCache();
  prepareTrainingSurfaceCacheOwner("owner");
  setTrainingSurfaceCache({ uid: "owner", surface: "plan", sport: "bike", locale: "ko" }, {
    goal: { id: "cached-goal", title: "Saved goal", discipline: "bike", eventDate: Date.now() + 86400000 },
    weeks: [],
  });
  setCollectionDocs("goals", [{ id: "fresh-goal", title: "Confirmed goal", userId: "owner", status: "active", discipline: "bike", eventDate: Date.now() + 86400000 }]);
  setCollectionDocs("goals/fresh-goal/plan", []);
});

describe("GoalHub cached plan read failures with the real model", () => {
  it.each(["goal", "plan"])("retains saved information, explains %s failure, and recovers through retry", async stage => {
    const reads = vi.mocked(getDocs);
    if (stage === "plan") reads.mockResolvedValueOnce({ empty: false, docs: [{ id: "fresh-goal", data: () => ({ title: "Confirmed goal", discipline: "bike", eventDate: Date.now() + 86400000 }) }] } as never);
    reads.mockRejectedValueOnce(new Error("offline"));
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />, { authenticated: true, user: { uid: "owner" }, route: "/ko/coach/goals?sport=bike" });
    expect(await screen.findByRole("alert")).toHaveTextContent("기존 목표를 확인하지 못했습니다");
    expect(screen.getByTestId("K3-1-1")).toHaveTextContent("Saved goal");
    expect(screen.getByText("저장된 이전 정보를 표시하고 있습니다.")).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "목표 포기" })).toBeDisabled();
    expect(screen.getByTestId("K3-1-2")).toHaveTextContent("—");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("K3-1-1")).toHaveTextContent("Confirmed goal"));
    expect(screen.queryByText("저장된 이전 정보를 표시하고 있습니다.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "목표 포기" })).toBeEnabled();
    expect(screen.getByTestId("K3-1-2")).toHaveTextContent("0%");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
});
