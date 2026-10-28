import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInCancelledError } from "../../utils/signInCancelled";
import GroupInvitePage from "../../pages/group/GroupInvitePage";

const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("react-router-dom", async importOriginal => ({ ...await importOriginal<typeof import("react-router-dom")>(), useParams: () => ({ code: "qa" }) }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ signIn, user: null, loading: false }) }));
function RouteProbe() { const location = useLocation(); return <output>{location.pathname}{location.search}{location.hash}</output>; }
function page() { return render(<MemoryRouter initialEntries={["/ko/group/join/qa?source=ad#intro"]}><GroupInvitePage /><RouteProbe /></MemoryRouter>); }
beforeEach(() => { signIn.mockReset().mockResolvedValue(undefined); });
describe("invite login recovery", () => {
  it("opens sign-in in place, preserving the club path, query and anchor", async () => {
    page();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "로그인", exact: true })));
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(screen.getByText("/ko/group/join/qa?source=ad#intro")).toBeInTheDocument();
    expect(screen.queryByText("비공개 클럽입니다")).not.toBeInTheDocument();
  });
  it("keeps the destination and offers retry after a login failure", async () => {
    signIn.mockRejectedValueOnce(new Error("offline"));
    page();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "로그인", exact: true })));
    expect(screen.getByText("로그인에 실패했습니다. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(screen.getByText("/ko/group/join/qa?source=ad#intro")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "로그인", exact: true })));
    expect(signIn).toHaveBeenCalledTimes(2);
  });
  it("deduplicates sign-in and permits retry after cancellation", async () => {
    let reject!: (error: Error) => void;
    signIn.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
    page();
    fireEvent.click(screen.getByRole("button", { name: "로그인", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "로그인 중…", exact: true }));
    expect(signIn).toHaveBeenCalledTimes(1);
    await act(async () => reject(signInCancelledError()));
    expect(screen.queryByText("로그인에 실패했습니다. 다시 시도해 주세요.")).not.toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "로그인", exact: true })));
    expect(signIn).toHaveBeenCalledTimes(2);
  });
});
