import { screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupRidesPage from "./GroupRidesPage";
import GroupWeekPage from "./GroupWeekPage";

const state = vi.hoisted(() => ({ sports: ["bike"] as string[] }));

vi.mock("../../hooks/useMobile", () => ({ useMobile: () => true }));
vi.mock("../../hooks/useGroup", () => ({
  useGroup: () => ({ group: { id: "club", name: "Club", creatorId: "owner", memberCount: 10, sports: state.sports }, loading: false, error: null, retry: vi.fn() }),
  useGroupMemberRole: () => ({ role: "member", loading: false, error: null, retry: vi.fn() }),
}));
vi.mock("../../hooks/useGroupRides", () => ({ useGroupRideStats: () => ({
  weeklyStats: { totalDistance: 12000, totalTime: 1800000, totalElevation: 80, rideCount: 1, activeMembers: 1 },
  rides: [{ groupRideId: "r7-ride", participantCount: 1 }],
  loading: false, loadingMore: false, error: null, loadMoreError: null, hasMore: false, loadMore: vi.fn(), retry: vi.fn(),
}) }));
vi.mock("../../hooks/useGroupWeekRanking", () => ({ useGroupWeekRanking: () => ({
  entries: [{ userId: "member-1", nickname: "Rider", distance: 12000, time: 1800000, elevation: 80 }],
  loading: false, error: false, moreError: false, loadingMore: false, hasMore: false, loadMore: vi.fn(), retry: vi.fn(),
}) }));
vi.mock("../../components/group/RideCard", () => ({ default: ({ ride }: { ride: { groupRideId: string } }) => <a href={`/ko/club/club/rides/${ride.groupRideId}`}>ride {ride.groupRideId}</a> }));

function show(page: "week" | "rides") {
  return renderWithProviders(<Routes>
    <Route path="/:lang/club/:groupId/week" element={<GroupWeekPage />} />
    <Route path="/:lang/club/:groupId/rides" element={<GroupRidesPage />} />
  </Routes>, { route: `/ko/club/club/${page}`, authenticated: true });
}

describe("phone club activity tab", () => {
  beforeEach(() => { state.sports = ["bike"]; });

  it.each(["week", "rides"] as const)("opens the same week-then-rides screen on /%s", (page) => {
    show(page);
    expect(screen.getByRole("link", { name: "활동" })).toHaveAttribute("aria-current", "page");
    const summary = screen.getByTestId("C5-1-1");
    // 요약은 거리·활동 멤버·횟수 세 칸 — 시간·상승은 지표 버튼으로 본다.
    expect(within(summary).getByText("12.0 km")).toBeInTheDocument();
    expect(within(summary).queryByText("0h 30m")).not.toBeInTheDocument();
    const rides = screen.getByRole("region", { name: "공동 기록" });
    expect(within(rides).getByRole("link", { name: "ride r7-ride" })).toBeInTheDocument();
    expect(summary.compareDocumentPosition(rides) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("gives running clubs the same week summary without the shared rides list", () => {
    state.sports = ["run"];
    show("week");
    expect(screen.getByTestId("C5-1-1")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "공동 기록" })).not.toBeInTheDocument();
  });
});
