import { installEventDiscoveryFixture } from "../../__tests__/fixtures/eventDiscovery";
vi.mock("../../services/clubMeetings", () => { const api = { listClubMeetings: vi.fn(async () => ({ meetings: [], nextCursor: null })) }; return { ...api, createClubMeetingsApi: () => api }; });
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupEventsPage from "./GroupEventsPage";

const state = vi.hoisted(() => ({ mobile: true }));
vi.mock("../../hooks/useMobile", () => ({ useMobile: () => state.mobile }));
vi.mock("../../hooks/useGroup", () => ({
  useGroup: () => ({ group: { id: "club", name: "Club", creatorId: "owner", memberCount: 2 }, loading: false }),
  useGroupMemberRole: () => ({ role: "member", loading: false }),
}));

beforeEach(() => { installEventDiscoveryFixture(); state.mobile = true; });

function show() {
  renderWithProviders(<Routes><Route path="/:lang/club/:groupId" element={<GroupEventsPage />} /></Routes>, { route: "/ko/club/club", authenticated: true });
}

describe("phone club meetings tab", () => {
  it("drops the heading copy and keeps the window toggle, the list and a wide create button below", async () => {
    show();
    const upcoming = await screen.findByRole("button", { name: "예정" });
    expect(screen.getByRole("button", { name: "지난 이벤트" })).toBeInTheDocument();
    expect(screen.queryByText("클럽에서 함께할 모임과 대회를 확인하세요.")).not.toBeInTheDocument();
    const create = screen.getByTestId("C3-0-3");
    expect(create).toHaveAttribute("href", "/ko/club/club/meetings/new");
    expect(create).toHaveTextContent("모임 만들기");
    expect(upcoming.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the desktop heading and description", async () => {
    state.mobile = false;
    show();
    expect(await screen.findByText("클럽에서 함께할 모임과 대회를 확인하세요.")).toBeInTheDocument();
    expect(screen.queryByTestId("C3-0-3")).not.toBeInTheDocument();
  });
});
