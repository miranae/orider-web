import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClubHomePage from "./ClubHomePage";
const state = vi.hoisted(() => ({ user: { uid: "member", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null, role: "member" as string | null, loading: false, error: null as Error | null, retry: vi.fn() }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock("../../hooks/useGroup", () => ({ useGroupMemberRole: () => state }));
vi.mock("./GroupEventsPage", () => ({ default: () => <h2>Meetings home</h2> }));
vi.mock("../../components/group/PublicClubPreview", () => ({ default: () => <h2>Original public club preview</h2> }));
vi.mock("./GroupDashboardPage", () => ({ default: () => <h2>Club introduction and news</h2> }));
vi.mock("../../components/redesign", () => ({ LoadingSkeleton: () => <p>Checking membership</p>, ErrorState: () => <p>Membership unavailable</p> }));
function show() { render(<MemoryRouter initialEntries={["/ko/club/one"]}><Routes><Route path="/:lang/club/:groupId" element={<ClubHomePage />} /></Routes></MemoryRouter>); }
afterEach(() => { state.user = { uid: "member", isAnonymous: false }; state.role = "member"; state.loading = false; state.error = null; });
describe("single club entry", () => {
  it.each(["member", "leader", "co-leader"])("opens meetings for confirmed %s", role => { state.role = role; show(); expect(screen.getByText("Meetings home")).toBeInTheDocument(); });
  it("retains the introduction and join flow for a non-member", () => { state.role = null; show(); expect(screen.getByText("Club introduction and news")).toBeInTheDocument(); });
  it.each([true, false])("retains visitor access (anonymous=%s)", anonymous => { state.user = anonymous ? { uid: "guest", isAnonymous: true } : null; state.error = new Error("not a member query"); show(); expect(screen.getByText("Original public club preview")).toBeInTheDocument(); });
  it("waits for membership rather than flashing a join screen", () => { state.loading = true; show(); expect(screen.getByText("Checking membership")).toBeInTheDocument(); expect(screen.queryByText("Meetings home")).not.toBeInTheDocument(); });
  it("does not mistake lookup failure for non-membership", () => { state.error = new Error("network"); show(); expect(screen.getByText("Membership unavailable")).toBeInTheDocument(); expect(screen.queryByText("Club introduction and news")).not.toBeInTheDocument(); });
});
