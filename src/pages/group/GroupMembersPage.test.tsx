import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockUpdateDoc, setCollectionDocs } from "../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupMembersPage from "./GroupMembersPage";

const { mockConfirm, mockGetPublicUserProfiles, mockMembers } = vi.hoisted(() => ({
  mockConfirm: vi.fn(),
  mockGetPublicUserProfiles: vi.fn(),
  mockMembers: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../services/publicProfiles", () => ({
  getPublicUserProfiles: mockGetPublicUserProfiles,
}));

vi.mock("../../contexts/DialogContext", () => ({
  useDialog: () => ({ confirm: mockConfirm, alert: vi.fn() }),
}));

vi.mock("../../hooks/useGroup", () => ({
  useGroup: () => ({
    group: {
      id: "group-1",
      name: "Test Group",
      creatorId: "test-uid",
      memberCount: 1,
      inviteCode: "TESTCODE",
    },
    loading: false,
  }),
  useGroupMembers: () => ({ members: mockMembers, loading: false }),
}));

vi.mock("../../hooks/useGroupRides", () => ({
  useGroupRideStats: () => ({ memberStats: {} }),
}));

describe("GroupMembersPage", () => {
  beforeEach(() => {
    mockConfirm.mockReset();
    mockConfirm.mockResolvedValue(true);
    mockUpdateDoc.mockClear();
    mockMembers.splice(0);
    mockGetPublicUserProfiles.mockReset();
    mockGetPublicUserProfiles.mockResolvedValue(new Map([
      ["requester-1", { id: "requester-1", nickname: "Pending Rider", photoURL: "https://example.com/rider.jpg" }],
    ]));
    setCollectionDocs("groups/group-1/pending", [
      { id: "requester-1", requestedAt: Date.now(), message: "함께 타고 싶어요" },
    ]);
  });

  it("loads the pending badge before its tab is selected and shows requester profile details", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/ko/group/:groupId/members" element={<GroupMembersPage />} />
      </Routes>,
      { route: "/ko/group/group-1/members", authenticated: true },
    );

    const pendingTab = await screen.findByRole("tab", { name: "대기중 1" });
    expect(pendingTab).toHaveAttribute("aria-selected", "false");

    fireEvent.click(pendingTab);
    expect(await screen.findByText("Pending Rider")).toBeInTheDocument();
    expect(screen.getByText(/함께 타고 싶어요/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("프로필 비공개 사용자")).not.toBeInTheDocument());
  });

  it("updates the badge when a pending request arrives after the page loads", async () => {
    setCollectionDocs("groups/group-1/pending", []);
    renderMembersPage();

    expect(await screen.findByRole("tab", { name: "대기중 0" })).toHaveAttribute("aria-selected", "false");

    setCollectionDocs("groups/group-1/pending", [
      { id: "requester-1", requestedAt: Date.now() },
    ]);

    expect(await screen.findByRole("tab", { name: "대기중 1" })).toHaveAttribute("aria-selected", "false");
  });

  it("retains the authoritative pending count and list when profile enrichment fails", async () => {
    mockGetPublicUserProfiles.mockRejectedValue(new Error("profile lookup failed"));
    renderMembersPage();

    const pendingTab = await screen.findByRole("tab", { name: "대기중 1" });
    fireEvent.click(pendingTab);

    expect(await screen.findByText("프로필 비공개 사용자")).toBeInTheDocument();
    expect(screen.getByText(/함께 타고 싶어요/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "대기중 1" })).toBeInTheDocument();
  });

  it("lets only the creator promote a regular member to co-leader after confirmation", async () => {
    mockMembers.push({
      id: "member-1",
      userId: "member-1",
      joinedAt: Date.now(),
      status: "active",
      role: "member",
      profile: { id: "member-1", nickname: "Rider One", photoURL: null },
    });
    renderMembersPage();

    fireEvent.click(await screen.findByRole("button", { name: "Rider One님 부리더 지정" }));

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith(
      "Rider One님을 부리더로 지정하시겠습니까?",
    ));
    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "groups/group-1/members/member-1" }),
      { role: "co-leader" },
    ));
    expect(await screen.findByText("Rider One님을 부리더로 지정했습니다.")).toBeInTheDocument();
  });

  it("targets the named eligible member and exposes no role action for a leader", async () => {
    mockMembers.push(
      {
        id: "member-2",
        userId: "member-2",
        joinedAt: Date.now(),
        status: "active",
        role: "member",
        profile: { id: "member-2", nickname: "Second Rider", photoURL: null },
      },
      {
        id: "co-leader-1",
        userId: "co-leader-1",
        joinedAt: Date.now(),
        status: "active",
        role: "co-leader",
        profile: { id: "co-leader-1", nickname: "Helper", photoURL: null },
      },
      {
        id: "leader-1",
        userId: "leader-1",
        joinedAt: Date.now(),
        status: "active",
        role: "leader",
        profile: { id: "leader-1", nickname: "Other Leader", photoURL: null },
      },
    );
    renderMembersPage();

    expect(await screen.findByRole("button", { name: "Second Rider님 부리더 지정" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Helper님 부리더 해제" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Other Leader님 부리더 지정" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Other Leader님 부리더 해제" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Helper님 부리더 해제" }));

    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "groups/group-1/members/co-leader-1" }),
      { role: "member" },
    ));
  });
});

function renderMembersPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/ko/group/:groupId/members" element={<GroupMembersPage />} />
    </Routes>,
    { route: "/ko/group/group-1/members", authenticated: true },
  );
}
