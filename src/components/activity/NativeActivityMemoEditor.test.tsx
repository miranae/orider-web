import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NativeActivityMemoEditor from "./NativeActivityMemoEditor";
const mocks = vi.hoisted(() => ({ load: vi.fn(), setNativeMemo: vi.fn() }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner" } }) }));
vi.mock("../../services/publicActivityDetail", () => ({ createPublicActivityClient: () => mocks }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue({ activity: { id: "ride", userId: "owner" }, nativeMemoRevision: "revision1", content: { memo: "기존 본문" } }); });
describe("native memo editing", () => {
  it("saves authored memo separately with the read revision", async () => {
    mocks.setNativeMemo.mockResolvedValue({ memoRevision: "revision2", status: "updated" });
    const saved = vi.fn();
    render(<NativeActivityMemoEditor activityId="ride" onSaved={saved} />);
    fireEvent.click(screen.getByRole("button", { name: "라이딩 본문 작성·수정" }));
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "새 본문" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith("새 본문"));
    expect(mocks.setNativeMemo).toHaveBeenCalledWith("ride", "새 본문", "revision1");
  });
  it("preserves an edited draft on conflict and requires a fresh revision", async () => {
    mocks.setNativeMemo.mockRejectedValue({ code: "functions/aborted" });
    render(<NativeActivityMemoEditor activityId="ride" onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "라이딩 본문 작성·수정" }));
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "내 초안" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("textbox")).toHaveValue("내 초안");
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    mocks.load.mockResolvedValue({ activity: { userId: "owner" }, nativeMemoRevision: "revision3", content: { memo: "다른 변경" } });
    fireEvent.click(screen.getByRole("button", { name: "최신 본문으로 작성 내용 교체" }));
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("다른 변경"));
    expect(screen.getByRole("button", { name: "저장" })).not.toBeDisabled();
  });
  it("does not offer a write for a non-owner response", async () => {
    mocks.load.mockResolvedValue({ activity: { userId: "someone" }, nativeMemoRevision: "revision1", content: { memo: "hidden" } });
    render(<NativeActivityMemoEditor activityId="ride" onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "라이딩 본문 작성·수정" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(mocks.setNativeMemo).not.toHaveBeenCalled();
  });
});
