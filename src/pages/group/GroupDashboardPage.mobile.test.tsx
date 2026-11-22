import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getVisibleEventPage } from "../../services/eventDiscovery";
import GroupDashboardPage from "./GroupDashboardPage";

const state = vi.hoisted(() => ({ mobile: true, membersQueried: [] as Array<string | undefined> }));
vi.mock("../../hooks/useMobile", () => ({ useMobile: () => state.mobile }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "member", isAnonymous: false }, loading: false }) }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("../../hooks/useGroup", () => ({
  useGroup: () => ({ group: { id: "group-1", creatorId: "owner", name: "미라내 라이딩", description: "주말 라이딩 클럽", rules: "헬멧 필수", visibility: "public", memberCount: 42, sports: ["bike"] }, loading: false }),
  useGroupMemberRole: () => ({ role: "member", error: null, retry: vi.fn() }),
  useGroupMembers: (groupId: string | undefined) => { state.membersQueried.push(groupId); return { members: [], loading: false }; },
}));
vi.mock("../../hooks/useGroupRides", () => ({ useGroupRideStats: () => ({ rides: [{ groupRideId: "ride-1", participantCount: 2 }], loading: false, error: null, retry: vi.fn(), aggregate: null }) }));
vi.mock("../../hooks/useGroupPosts", () => ({
  useGroupPosts: () => ({ posts: [{ id: "post-1", content: "이번 주 공지", authorId: "owner", authorName: "운영자", kind: "announcement", createdAt: 1 }], loading: false }),
  createGroupPost: vi.fn(), updateGroupPost: vi.fn(),
}));
vi.mock("../../services/eventDiscovery", () => ({ getVisibleEventPage: vi.fn(async () => ({ docs: [], nextCursor: null })) }));
vi.mock("../../components/group/RideCard", () => ({ default: () => <div>ride card</div> }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));

function show() {
  render(<MemoryRouter initialEntries={["/ko/club/group-1/news"]}><Routes><Route path="/:lang/club/:groupId/news" element={<GroupDashboardPage />} /></Routes></MemoryRouter>);
}

describe("phone club news tab", () => {
  beforeEach(() => { state.mobile = true; state.membersQueried = []; vi.mocked(getVisibleEventPage).mockClear(); });

  it("keeps intro, rules, posts and club info without meeting, ride and member previews", () => {
    show();
    expect(screen.getByText("주말 라이딩 클럽")).toBeInTheDocument();
    expect(screen.getByText("헬멧 필수")).toBeInTheDocument();
    expect(screen.getByText("이번 주 공지")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "클럽 정보" })).toBeInTheDocument();
    expect(screen.queryByTestId("C1-4")).not.toBeInTheDocument();
    expect(screen.queryByTestId("C1-4-2")).not.toBeInTheDocument();
    expect(screen.queryByText("ride card")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "멤버" })).not.toBeInTheDocument();
    // 겹치는 미리보기는 읽지도 않는다.
    expect(getVisibleEventPage).not.toHaveBeenCalled();
    expect(state.membersQueried.every((groupId) => groupId === undefined)).toBe(true);
  });

  it("keeps the desktop news previews", () => {
    state.mobile = false;
    show();
    expect(screen.getByTestId("C1-4-2")).toBeInTheDocument();
    expect(state.membersQueried).toContain("group-1");
  });
});
