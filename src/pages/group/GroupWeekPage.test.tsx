import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupWeekPage, { groupWeekRange } from "./GroupWeekPage";
const state = vi.hoisted(() => ({ groupError: null as Error | null, roleError: null as Error | null,
  statsError: null as "failed" | null, groupRetry: vi.fn(), roleRetry: vi.fn(), statsRetry: vi.fn() }));
beforeEach(() => { state.groupError = null; state.roleError = null; state.statsError = null; vi.clearAllMocks(); });
vi.mock("../../hooks/useGroup", () => ({
  useGroup: () => ({ group: { id: "club", name: "Club", creatorId: "owner", memberCount: 10 }, loading: false, error: state.groupError, retry: state.groupRetry }),
  useGroupMemberRole: () => ({ role: "member", loading: false, error: state.roleError, retry: state.roleRetry }),
  useGroupMembers: () => ({ members: Array.from({ length: 10 }, (_, index) => ({ id: `member-${index}`, profile: { nickname: `Rider ${index}` } })) }),
}));
vi.mock("../../hooks/useGroupRides", () => ({ useGroupRideStats: () => ({
  weeklyStats: { totalDistance: 10000, totalTime: 3600000, totalElevation: 200, rideCount: 2, activeMembers: 10 },
  memberWeekStats: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`member-${index}`, { distance: index * 1000, time: 60000, elevation: index, tss: 999 }])),
  loading: false, error: state.statsError, retry: state.statsRetry,
}) }));
describe("GroupWeekPage", () => {
  it.each(["group", "role", "stats"])("retries the failed %s query", (query) => {
    if (query === "group") state.groupError = new Error("offline");
    else if (query === "role") state.roleError = new Error("offline");
    else state.statsError = "failed";
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/week" element={<GroupWeekPage />} /></Routes>, { route: "/ko/club/club/week", authenticated: true });
    fireEvent.click(screen.getByRole("button", { name: /다시/ }));
    expect(query === "group" ? state.groupRetry : query === "role" ? state.roleRetry : state.statsRetry).toHaveBeenCalledOnce();
  });
  it.each([
    ["2026-10-18T14:59:59Z", "2026-10-11T15:00:00.000Z", "2026-10-17T15:00:00.000Z"],
    ["2026-10-18T15:00:00Z", "2026-10-18T15:00:00.000Z", "2026-10-24T15:00:00.000Z"],
    ["2026-10-18T23:30:00-07:00", "2026-10-18T15:00:00.000Z", "2026-10-24T15:00:00.000Z"],
  ])("uses the server KST week boundary for %s", (instant, monday, sunday) => {
    const range = groupWeekRange(Date.parse(instant));
    expect(range.monday.toISOString()).toBe(monday);
    expect(range.sunday.toISOString()).toBe(sunday);
    expect(range.monday.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })).toMatch(/2026/);
  });
  it("shows all server participants and only distance, time and elevation comparisons", () => {
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/week" element={<GroupWeekPage />} /></Routes>, { route: "/ko/club/club/week", authenticated: true });
    expect(screen.queryByText(/1인당|참여율/)).not.toBeInTheDocument();
    expect(screen.getByText("10.0 km")).toBeInTheDocument();
    expect(screen.getByText("Rider 0")).toBeInTheDocument();
    expect(screen.getByText("Rider 9")).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(10);
    expect(screen.getByRole("progressbar", { name: "Rider 9 · 이동거리" })).toHaveAttribute("value", "9000");
    expect(screen.getByText("활동 멤버 / 전체")).toBeInTheDocument();
    expect(screen.getByText("함께한 라이딩")).toBeInTheDocument();
    expect(screen.queryByText(/TSS|FTP\/kg/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "활동시간" }));
    expect(screen.getAllByText("0h 1m")).toHaveLength(10);
    expect(screen.getByText("함께한 공개 활동 기준")).toBeInTheDocument();
  });
});
