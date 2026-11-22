import { fireEvent, screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupRidesPage from "./GroupRidesPage";
import GroupWeekPage from "./GroupWeekPage";

const state = vi.hoisted(() => ({
  sports: ["bike"] as string[], role: "member" as string | null,
  weekly: true, error: null as "failed" | "unavailable" | null, loadMoreError: null as "failed" | null,
  retry: vi.fn(), loadMore: vi.fn(),
}));

vi.mock("../../hooks/useMobile", () => ({ useMobile: () => true }));
vi.mock("../../hooks/useGroup", () => ({
  useGroup: () => ({ group: { id: "club", name: "Club", creatorId: "owner", memberCount: 10, sports: state.sports }, loading: false, error: null, retry: vi.fn() }),
  useGroupMemberRole: () => ({ role: state.role, loading: false, error: null, retry: vi.fn() }),
}));
vi.mock("../../hooks/useGroupRides", () => ({ useGroupRideStats: () => ({
  weeklyStats: state.weekly && !state.error ? { totalDistance: 12000, totalTime: 1800000, totalElevation: 80, rideCount: 1, activeMembers: 1 } : null,
  rides: state.error ? [] : [{ groupRideId: "r7-ride", participantCount: 1 }],
  loading: false, loadingMore: false, error: state.error, loadMoreError: state.loadMoreError, hasMore: !!state.loadMoreError, loadMore: state.loadMore, retry: state.retry,
}) }));
vi.mock("../../hooks/useGroupWeekRanking", () => ({ useGroupWeekRanking: () => ({
  entries: [{ userId: "member-1", nickname: "Rider", distance: 12000, time: 1800000, elevation: 80 }],
  loading: false, error: false, moreError: false, loadingMore: false, hasMore: false, loadMore: vi.fn(), retry: vi.fn(),
}) }));
vi.mock("../../components/group/RideCard", () => ({ default: ({ ride }: { ride: { groupRideId: string } }) => <a href={`/ko/club/club/rides/${ride.groupRideId}`}>ride {ride.groupRideId}</a> }));

function show(page: "week" | "rides", authenticated = true) {
  return renderWithProviders(<Routes>
    <Route path="/:lang/club/:groupId/week" element={<GroupWeekPage />} />
    <Route path="/:lang/club/:groupId/rides" element={<GroupRidesPage />} />
  </Routes>, { route: `/ko/club/club/${page}`, authenticated });
}

describe("phone club activity tab", () => {
  beforeEach(() => {
    state.sports = ["bike"]; state.role = "member"; state.weekly = true; state.error = null; state.loadMoreError = null;
    state.retry.mockClear(); state.loadMore.mockClear();
  });

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

  it.each([true, false])("keeps the shared rides screen for a visitor on /rides (signed in=%s)", (authenticated) => {
    state.role = null;
    show("rides", authenticated);
    expect(screen.getByTestId("club-ride-list-scope")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ride r7-ride" })).toBeInTheDocument();
    expect(screen.queryByTestId("C5-1")).not.toBeInTheDocument();
    expect(screen.queryByText("주간 집계를 불러오지 못했어요")).not.toBeInTheDocument();
  });

  it("keeps the rides list when only the week summary is missing and retries in the summary", () => {
    state.weekly = false;
    show("rides");
    const summary = screen.getByTestId("C5-1");
    expect(within(summary).getByRole("status")).toHaveTextContent("주간 집계를 아직 확인할 수 없어요");
    fireEvent.click(within(summary).getByRole("button", { name: "다시 시도" }));
    expect(state.retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "ride r7-ride" })).toBeInTheDocument();
  });

  it("keeps the week summary when only the next rides page fails and retries in the rides area", () => {
    state.loadMoreError = "failed";
    show("rides");
    expect(within(screen.getByTestId("C5-1-1")).getByText("12.0 km")).toBeInTheDocument();
    const rides = screen.getByRole("region", { name: "공동 기록" });
    expect(within(rides).getByRole("alert")).toBeInTheDocument();
    expect(within(rides).getByRole("link", { name: "ride r7-ride" })).toBeInTheDocument();
    fireEvent.click(within(rides).getByRole("button", { name: "다시 시도" }));
    expect(state.loadMore).toHaveBeenCalledOnce();
  });

  it("shows the failed first read in each area instead of replacing the screen", () => {
    state.error = "failed";
    show("week");
    expect(screen.getByRole("link", { name: "활동" })).toHaveAttribute("aria-current", "page");
    expect(within(screen.getByTestId("C5-1")).getByText("주간 집계를 불러오지 못했어요")).toBeInTheDocument();
    const rides = screen.getByRole("region", { name: "공동 기록" });
    fireEvent.click(within(rides).getByRole("button", { name: /다시/ }));
    expect(state.retry).toHaveBeenCalled();
  });
});
