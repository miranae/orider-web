import { useEffect, useRef, useState } from "react";
import userEvent from "@testing-library/user-event";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import NativeActivityMemoEditor, { NativeActivityMemoEditorView, useNativeMemoEditor } from "./NativeActivityMemoEditor";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
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
    fireEvent.click(screen.getByRole("button", { name: "메모 작성·수정" }));
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "새 본문" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith("새 본문"));
    expect(mocks.setNativeMemo).toHaveBeenCalledWith("ride", "새 본문", "revision1");
  });
  it("starts the draft from the shown generated memo when no authored memo exists on the server", async () => {
    mocks.load.mockResolvedValue({ activity: { id: "ride", userId: "owner" }, nativeMemoRevision: sha(""), content: { memo: "옛 판 메모" } });
    mocks.setNativeMemo.mockResolvedValue({ memoRevision: "revision2", status: "updated" });
    render(<NativeActivityMemoEditor activityId="ride" currentMemoAuthored={false} currentMemo={"▰ 라이딩 종합\n이동 00:04:07"} onSaved={vi.fn()}><p>보이는 메모</p></NativeActivityMemoEditor>);
    expect(screen.getByText("보이는 메모")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "메모 작성·수정" }));
    expect(await screen.findByRole("textbox")).toHaveValue("▰ 라이딩 종합\n이동 00:04:07");
    expect(screen.queryByText("보이는 메모")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mocks.setNativeMemo).toHaveBeenCalledWith("ride", "▰ 라이딩 종합\n이동 00:04:07", sha("")));
  });
  it("uses the server memo over a stale screen memo so another device's edit is not overwritten", async () => {
    mocks.load.mockResolvedValue({ activity: { id: "ride", userId: "owner" }, nativeMemoRevision: sha("다른 기기 수정 B"), content: { memo: "다른 기기 수정 B" } });
    render(<NativeActivityMemoEditor activityId="ride" currentMemo="화면의 옛 메모 A" onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "메모 작성·수정" }));
    expect(await screen.findByRole("textbox")).toHaveValue("다른 기기 수정 B");
  });
  it("keeps the shown memo when it is exactly the server's authored memo", async () => {
    mocks.load.mockResolvedValue({ activity: { id: "ride", userId: "owner" }, nativeMemoRevision: sha("내 메모"), content: { memo: "피드 옛 본문" } });
    render(<NativeActivityMemoEditor activityId="ride" currentMemo="내 메모" onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "메모 작성·수정" }));
    expect(await screen.findByRole("textbox")).toHaveValue("내 메모");
  });
  it("does not resurrect an authored memo deleted on another device", async () => {
    mocks.load.mockResolvedValue({ activity: { id: "ride", userId: "owner" }, nativeMemoRevision: sha(""), content: { memo: "지운 메모 A" } });
    render(<NativeActivityMemoEditor activityId="ride" currentMemo="지운 메모 A" onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "메모 작성·수정" }));
    expect(await screen.findByRole("textbox")).toHaveValue("");
  });
  it("preserves an edited draft on conflict and requires a fresh revision", async () => {
    mocks.setNativeMemo.mockRejectedValue({ code: "functions/aborted" });
    render(<NativeActivityMemoEditor activityId="ride" onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "메모 작성·수정" }));
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "내 초안" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("textbox")).toHaveValue("내 초안");
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    mocks.load.mockResolvedValue({ activity: { userId: "owner" }, nativeMemoRevision: "revision3", content: { memo: "다른 변경" } });
    fireEvent.click(screen.getByRole("button", { name: "최신 메모로 작성 내용 교체" }));
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("다른 변경"));
    expect(screen.getByRole("button", { name: "저장" })).not.toBeDisabled();
  });
  it("does not offer a write for a non-owner response", async () => {
    mocks.load.mockResolvedValue({ activity: { userId: "someone" }, nativeMemoRevision: "revision1", content: { memo: "hidden" } });
    render(<NativeActivityMemoEditor activityId="ride" onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "메모 작성·수정" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(mocks.setNativeMemo).not.toHaveBeenCalled();
  });
});

it("moves keyboard focus into the loaded memo and restores it after cancel and save", async () => {
  const user = userEvent.setup();
  mocks.setNativeMemo.mockResolvedValue({ memoRevision: "revision2" });
  render(<NativeActivityMemoEditor activityId="ride" onSaved={vi.fn()} />);
  await user.tab();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.getByRole("textbox")).toHaveFocus());
  await user.tab();
  await user.tab();
  expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: "메모 작성·수정" })).toHaveFocus();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.getByRole("textbox")).toHaveFocus());
  await user.tab();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.getByRole("button", { name: "메모 작성·수정" })).toHaveFocus());
});

it("does not restore focus into an editor removed by the parent after save", async () => {
  const user = userEvent.setup();
  mocks.setNativeMemo.mockResolvedValue({ memoRevision: "revision2" });
  function Parent() {
    const [saved, setSaved] = useState(false);
    const next = useRef<HTMLButtonElement>(null);
    useEffect(() => { if (saved) next.current?.focus(); }, [saved]);
    return saved ? <button ref={next}>다음 활동</button> : <NativeActivityMemoEditor activityId="ride" onSaved={() => setSaved(true)} />;
  }
  render(<Parent />);
  await user.tab();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.getByRole("textbox")).toHaveFocus());
  await user.tab();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.getByRole("button", { name: "다음 활동" })).toHaveFocus());
});

it("keeps an unsaved draft when the view is remounted by a content refresh", async () => {
  function Page({ revision }: { revision: string }) {
    const editor = useNativeMemoEditor({ activityId: "ride", currentMemo: "기존 본문", onSaved: vi.fn() });
    return <div key={revision}><NativeActivityMemoEditorView editor={editor}><p>기존 본문</p></NativeActivityMemoEditorView></div>;
  }
  mocks.load.mockResolvedValue({ activity: { id: "ride", userId: "owner" }, nativeMemoRevision: sha("기존 본문"), content: { memo: "기존 본문" } });
  const view = render(<Page revision="r1" />);
  fireEvent.click(screen.getByRole("button", { name: "메모 작성·수정" }));
  fireEvent.change(await screen.findByRole("textbox"), { target: { value: "쓰던 초안" } });
  view.rerender(<Page revision="r2" />);
  expect(screen.getByRole("textbox")).toHaveValue("쓰던 초안");
});
