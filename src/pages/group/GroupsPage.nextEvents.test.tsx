import { installEventDiscoveryFixture } from "../../__tests__/fixtures/eventDiscovery";
import { screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockCallableInvocations, setCollectionDocs } from "../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupsPage from "./GroupsPage";

const state = vi.hoisted(() => ({ mobile: false }));
vi.mock("../../hooks/useMobile", () => ({ useMobile: () => state.mobile }));
vi.mock("../../hooks/useGroup", () => ({
  useGroupMemberRole: () => ({ role: "member", loading: false }),
  useMyGroups: () => ({ groups: [{ id: "ride", name: "미라내 라이딩", discipline: "bike", memberCount: 42 }], loading: false, error: null, incomplete: false, retry: vi.fn() }),
  usePendingGroupRequestIds: () => new Set(),
  usePublicGroups: () => ({ groups: [], loading: false, error: null, retry: vi.fn() }),
}));
vi.mock("../../components/group/GroupRequestHistory", () => ({ default: () => null }));

function renderPage() {
  return renderWithProviders(<Routes><Route path="/ko/clubs" element={<GroupsPage />} /></Routes>, { route: "/ko/clubs", authenticated: true });
}

/** 다음 모임은 서버가 지원하는 목록 조회로 읽는다 — 지운 묶음 조회(getGroupNextEvents, orider-g1-web #3835)는 부르지 않는다. */
describe("GroupsPage next meetings from the supported list callable", () => {
  beforeEach(() => {
    installEventDiscoveryFixture();
    mockCallableInvocations.length = 0;
    setCollectionDocs("events", [
      { id: "later", info: { groupId: "ride", status: "OPEN", startTime: Date.now() + 9 * 86400000, name: "남산 야간" } },
      // 클럽 모임의 info.name 은 서버 고정값이다 — 화면은 작성 제목(info.title)을 보인다.
      { id: "next", info: { groupId: "ride", status: "OPEN", startTime: Date.now() + 86400000, kind: "CLUB_MEETING", name: "동호회 모임", title: "북악 업힐 정모" }, counters: { totalRegistered: 14 } },
    ]);
  });

  it("shows the next meeting on the club card", async () => {
    state.mobile = false;
    renderPage();
    expect(await screen.findByText(/북악 업힐 정모/)).toBeInTheDocument();
    expect(screen.queryByText(/남산 야간/)).not.toBeInTheDocument();
    expect(mockCallableInvocations.some((call) => call.name === "getGroupNextEvents")).toBe(false);
  });

  it("shows the next meeting in the phone upcoming block with the server participant count", async () => {
    state.mobile = true;
    renderPage();
    const upcoming = await screen.findByRole("region", { name: "다가오는 모임" });
    expect(within(upcoming).getByText("북악 업힐 정모")).toBeInTheDocument();
    expect(within(upcoming).getByText(/14명 참여/)).toBeInTheDocument();
    expect(within(upcoming).queryByText("동호회 모임")).not.toBeInTheDocument();
    expect(within(upcoming).getByRole("link", { name: "참여" })).toHaveAttribute("href", "/ko/club/ride/meetings/next");
    expect(mockCallableInvocations.some((call) => call.name === "getGroupNextEvents")).toBe(false);
  });
});
