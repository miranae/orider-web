import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCollectionDocs } from "../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupMembersPage from "./GroupMembersPage";

const { mockGetPublicUserProfiles } = vi.hoisted(() => ({
  mockGetPublicUserProfiles: vi.fn(),
}));

vi.mock("../../services/publicProfiles", () => ({
  getPublicUserProfiles: mockGetPublicUserProfiles,
}));

vi.mock("../../contexts/DialogContext", () => ({
  useDialog: () => ({ confirm: vi.fn(), alert: vi.fn() }),
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
  useGroupMembers: () => ({ members: [], loading: false }),
}));

vi.mock("../../hooks/useGroupRides", () => ({
  useGroupRideStats: () => ({ memberStats: {} }),
}));

describe("GroupMembersPage", () => {
  beforeEach(() => {
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
});

function renderMembersPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/ko/group/:groupId/members" element={<GroupMembersPage />} />
    </Routes>,
    { route: "/ko/group/group-1/members", authenticated: true },
  );
}
