import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicClub, PublicClubUnavailable } from "../../services/publicClubs";
import PublicClubPreview from "./PublicClubPreview";
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: null, signIn: vi.fn() }) }));
vi.mock("../../services/publicClubs", async original => ({ ...await original<typeof import("../../services/publicClubs")>(), getPublicClub: vi.fn() }));
vi.mock("../../features/group/PublicCafeSchedulePanel", () => ({ default: ({ groupId }: { groupId: string }) => <div data-testid="public-cafe-schedule">{groupId}</div> }));
const club = { id: "club", name: "공개 소개 fixture", description: "소개 문구", approval: "manual" as const, city: "용인", sports: ["bike" as const] };
beforeEach(() => { vi.mocked(getPublicClub).mockReset().mockResolvedValue(club); });
const page = () => render(<MemoryRouter><PublicClubPreview groupId="club" /></MemoryRouter>);
describe("anonymous public club introduction", () => {
  it("shows the public cafe schedule on the LARA preview", async () => {
    vi.mocked(getPublicClub).mockResolvedValueOnce({ ...club, id: "club-lara" });
    render(<MemoryRouter><PublicClubPreview groupId="club-lara" /></MemoryRouter>);
    expect(await screen.findByTestId("public-cafe-schedule")).toHaveTextContent("club-lara");
  });
  it("shows the approved introduction and login action without member-only navigation", async () => {
    page(); expect(await screen.findByRole("heading", { name: club.name })).toBeInTheDocument();
    expect(screen.getByText("소개 문구")).toBeInTheDocument(); expect(screen.getByText("로그인 후 가입을 신청하면 운영진이 승인합니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그인", exact: true })).toBeInTheDocument();
    for (const name of ["멤버", "공동 기록", "운영"]) expect(screen.queryByRole("link", { name, exact: true })).not.toBeInTheDocument();
  });
  it("removes a formerly public introduction when a focus refresh confirms withdrawal", async () => {
    page(); await screen.findByText(club.name);
    vi.mocked(getPublicClub).mockRejectedValueOnce(new PublicClubUnavailable());
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(await screen.findByText("현재 공개 소개를 제공하지 않는 클럽입니다")).toBeInTheDocument();
    expect(screen.queryByText(club.name)).not.toBeInTheDocument(); expect(screen.queryByText("비공개 클럽입니다")).not.toBeInTheDocument();
  });
  it("shows a retryable failure instead of unavailable or stale introduction", async () => {
    vi.mocked(getPublicClub).mockRejectedValueOnce(new Error("offline")); page();
    expect(await screen.findByText("공개 클럽을 불러오지 못했어요. 다시 시도해 주세요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /다시/ }));
    await waitFor(() => expect(screen.getByText(club.name)).toBeInTheDocument());
  });
});
