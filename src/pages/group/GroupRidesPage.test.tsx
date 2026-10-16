import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupRidesPage from "./GroupRidesPage";

const state = vi.hoisted(() => ({ groupError: null as Error | null, roleError: null as Error | null,
  pageError: null as "failed" | null, groupRetry: vi.fn(), roleRetry: vi.fn(), loadMore: vi.fn() }));
beforeEach(() => { state.groupError = null; state.roleError = null; state.pageError = null; vi.clearAllMocks(); });
vi.mock("../../hooks/useGroup", () => ({
  useGroup: () => ({ group: { id: "club", creatorId: "someone-else" }, loading: false, error: state.groupError, retry: state.groupRetry }),
  useGroupMemberRole: () => ({ role: "co-leader", loading: false, error: state.roleError, retry: state.roleRetry }),
}));
vi.mock("../../hooks/useGroupRides", () => ({ useGroupRideStats: () => ({
  rides: [{ groupRideId: "small", participantCount: 2 }, { groupRideId: "large", participantCount: 5 }],
  loading: false, loadingMore: false, error: null, loadMoreError: state.pageError, hasMore: !!state.pageError, loadMore: state.loadMore,
}) }));
vi.mock("../../components/group/GroupSubNav", () => ({ default: ({ isCreator }: { isCreator: boolean }) => <div>{isCreator ? "management visible" : "management hidden"}</div> }));
vi.mock("../../components/group/RideCard", () => ({ default: ({ ride }: { ride: { groupRideId: string } }) => <div>{ride.groupRideId}</div> }));

describe("GroupRidesPage activity-record filters", () => {
  it.each(["group", "role"])("retries the failed %s query rather than treating the club as missing", (query) => {
    if (query === "group") state.groupError = new Error("offline"); else state.roleError = new Error("offline");
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides" element={<GroupRidesPage />} /></Routes>, { route: "/ko/club/club/rides", authenticated: true });
    expect(screen.getByText("클럽 정보를 불러오지 못했습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /다시/ }));
    expect(query === "group" ? state.groupRetry : state.roleRetry).toHaveBeenCalledOnce();
  });
  it("keeps successful ride cards visible and retries the failed next page", () => {
    state.pageError = "failed";
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides" element={<GroupRidesPage />} /></Routes>, { route: "/ko/club/club/rides", authenticated: true });
    expect(screen.getByText("small")).toBeInTheDocument();
    expect(screen.getByText("large")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(state.loadMore).toHaveBeenCalledOnce();
  });
  it("uses explicit activity-record counts and retains co-leader management navigation", () => {
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides" element={<GroupRidesPage />} /></Routes>, { route: "/ko/club/club/rides", authenticated: true });
    expect(screen.getByText("management visible")).toBeInTheDocument();
    expect(screen.getByText("활동 기록 수:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2개+" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "5개+" }));
    expect(screen.getByRole("button", { name: "5개+" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("small")).not.toBeInTheDocument();
    expect(screen.getByText("large")).toBeInTheDocument();
  });
});
