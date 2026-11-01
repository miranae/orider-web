import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPublicClubs } from "../../services/publicClubs";
import GroupsPage from "./GroupsPage";
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: null, signIn: vi.fn() }) }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("../../hooks/useGroup", () => ({ useGroupMemberRole: () => ({ role: null }), useMyGroups: () => ({ groups: [], loading: false }), usePublicGroups: () => ({ groups: [], loading: false }) }));
vi.mock("../../hooks/useGroupNextEvents", () => ({ useGroupNextEvents: () => ({ byGroup: new Map() }) }));
vi.mock("../../services/publicClubs", async original => ({ ...await original<typeof import("../../services/publicClubs")>(), listPublicClubs: vi.fn() }));
const fixture = { id: "public-club", name: "공개 클럽 fixture", description: "공개 소개", approval: "auto" as const, city: "용인" };
beforeEach(() => { vi.mocked(listPublicClubs).mockReset().mockResolvedValue({ items: [fixture], cursor: null, hasMore: false }); });
const page = () => render(<MemoryRouter><GroupsPage /></MemoryRouter>);
describe("anonymous public directory", () => {
  it("provides introduction links without join, create, invite or membership actions", async () => {
    page(); expect(await screen.findByRole("link", { name: fixture.name })).toHaveAttribute("href", "/ko/club/public-club");
    expect(screen.queryByRole("button", { name: "가입 신청" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "클럽 만들기" })).not.toBeInTheDocument();
    expect(screen.queryByText("내가 속한 클럽")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그인", exact: true })).toBeInTheDocument();
  });
  it("debounces filters and queries the API rather than filtering a partial first page", async () => {
    page(); await screen.findByText(fixture.name);
    fireEvent.change(screen.getByRole("searchbox", { name: "클럽 이름 검색", exact: true }), { target: { value: "서울" } });
    await waitFor(() => expect(listPublicClubs).toHaveBeenLastCalledWith(expect.objectContaining({ searchText: "서울" }), null));
  });
  it("paginates using the returned cursor", async () => {
    vi.mocked(listPublicClubs).mockResolvedValueOnce({ items: [fixture], cursor: "page-2", hasMore: true }).mockResolvedValueOnce({ items: [{ ...fixture, id: "second", name: "두번째 공개 클럽" }], cursor: null, hasMore: false });
    page(); await screen.findByText(fixture.name);
    fireEvent.click(screen.getByRole("button", { name: /더보기/ }));
    expect(await screen.findByText("두번째 공개 클럽")).toBeInTheDocument();
    expect(listPublicClubs).toHaveBeenLastCalledWith(expect.anything(), "page-2");
  });
  it("does not turn an API failure into an empty successful directory", async () => {
    vi.mocked(listPublicClubs).mockRejectedValueOnce(new Error("offline")); page();
    expect(await screen.findByRole("button", { name: /다시/ })).toBeInTheDocument();
    expect(screen.queryByText("공개 클럽이 없습니다")).not.toBeInTheDocument();
  });
});
