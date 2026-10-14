import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupWeekPage from "./GroupWeekPage";
vi.mock("../../hooks/useGroup", () => ({
  useGroup: () => ({ group: { id: "club", name: "Club", creatorId: "owner", memberCount: 10 }, loading: false }),
  useGroupMemberRole: () => ({ role: "member", loading: false }),
  useGroupMembers: () => ({ members: Array.from({ length: 10 }, (_, index) => ({ id: `member-${index}`, profile: { nickname: `Rider ${index}` } })) }),
}));
vi.mock("../../hooks/useGroupRides", () => ({ useGroupRideStats: () => ({
  weeklyStats: { totalDistance: 10000, totalTime: 3600000, totalElevation: 200, rideCount: 2, activeMembers: 10 },
  memberWeekStats: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`member-${index}`, { distance: index * 1000, time: 60000, elevation: index, tss: 999 }])),
  loading: false, error: null,
}) }));
describe("GroupWeekPage", () => {
  it("shows all server participants and only distance, time and elevation comparisons", () => {
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/week" element={<GroupWeekPage />} /></Routes>, { route: "/ko/club/club/week", authenticated: true });
    expect(screen.queryByText(/1인당|참여율/)).not.toBeInTheDocument();
    expect(screen.getByText("10.0 km")).toBeInTheDocument();
    expect(screen.getByText("Rider 0")).toBeInTheDocument();
    expect(screen.getByText("Rider 9")).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(10);
    expect(screen.queryByText(/TSS|FTP\/kg/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "시간" }));
    expect(screen.getAllByText("0h 1m")).toHaveLength(10);
    expect(screen.getByText("함께 탄 공개 라이딩 기준 · 서버 집계")).toBeInTheDocument();
  });
});
