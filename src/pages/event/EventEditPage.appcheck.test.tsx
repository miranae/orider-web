import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { getAppCheckToken } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { mockCallableInvocations, setCallableImplementation, setCallableResult, setCollectionDocs, setDocData, simulateLogin } from "../../__tests__/mocks/firebase";
import EventEditPage from "./EventEditPage";

vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));

const START_MS = Date.parse("2026-10-12T15:00:00+09:00");
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const updateCalls = () => mockCallableInvocations.filter((call) => call.name === "updateEvent");
const constructedUpdates = () => vi.mocked(httpsCallable).mock.calls.filter((call) => call[1] === "updateEvent");

async function editor() {
  const view = renderWithProviders(
    <Routes><Route path="/:lang/event/:eventId/edit" element={<EventEditPage />} /></Routes>,
    { authenticated: true, route: "/ko/event/ev/edit" },
  );
  await screen.findByDisplayValue("QA 원본 이벤트");
  return view;
}
async function changedEditor() {
  const view = await editor();
  fireEvent.change(screen.getByDisplayValue("QA 원본 이벤트"), { target: { value: "QA 수정 이벤트" } });
  return view;
}
async function confirmCancel() {
  fireEvent.click(screen.getByRole("button", { name: "이벤트 취소", exact: true }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByPlaceholderText("QA 원본 이벤트"), { target: { value: "QA 원본 이벤트" } });
  return within(dialog).getByRole("button", { name: "이벤트 취소", exact: true });
}

describe("EventEditPage bundled App Check update admission", () => {
  beforeEach(() => {
    vi.mocked(httpsCallable).mockClear();
    vi.mocked(logClientError).mockClear();
    vi.mocked(getAppCheckToken).mockResolvedValue("test-app-check-token");
    setDocData("events/ev", {
      info: { name: "QA 원본 이벤트", status: "OPEN", creatorId: "test-uid", type: "TOUR", visibility: "GROUP",
        startTime: START_MS, hostName: "QA 주최자", hostPhone: "01000000000", meetLocation: "QA 집결지", meetTime: "14:30",
        expectedDuration: "01:00", feeType: "FREE", categories: [{ id: "c1", name: "시민", capacity: 100 }],
        openAt: "2026-10-12T00:00:00+09:00", closeAt: "2026-10-12T14:00:00+09:00" },
    });
    setCollectionDocs("events/ev/participants", []);
    setCallableResult("updateEvent", { data: { success: true } });
  });

  it("awaits a cold bundled token before constructing updateEvent and preserves the save payload and KST time", async () => {
    const ready = deferred<string | null>();
    vi.mocked(getAppCheckToken).mockReturnValueOnce(ready.promise);
    await changedEditor();
    const save = screen.getByRole("button", { name: /^변경사항 저장/ });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(constructedUpdates()).toHaveLength(0);
    expect(updateCalls()).toHaveLength(0);
    await act(async () => { ready.resolve("cold-token"); });
    await waitFor(() => expect(updateCalls()).toHaveLength(1));
    expect(updateCalls()[0].data).toMatchObject({ eventId: "ev", name: "QA 수정 이벤트", type: "TOUR", visibility: "GROUP",
      startTime: START_MS, meetTime: "14:30", feeType: "FREE", entryFee: 0,
      openAt: "2026-10-12T00:00:00+09:00", closeAt: "2026-10-12T14:00:00+09:00" });
    expect(constructedUpdates()).toHaveLength(1);
  });

  it("rejects an empty token without constructing a callable or writing", async () => {
    vi.mocked(getAppCheckToken).mockResolvedValueOnce(null);
    await changedEditor();
    fireEvent.click(screen.getByRole("button", { name: /^변경사항 저장/ }));
    await screen.findByText("저장에 실패했습니다.");
    expect(updateCalls()).toHaveLength(0);
    expect(constructedUpdates()).toHaveLength(0);
  });

  it("keeps the original error UI and allows a normal retry after token rejection with zero failed writes", async () => {
    vi.mocked(getAppCheckToken).mockRejectedValueOnce(new Error("app-check/token-timeout"));
    await changedEditor();
    fireEvent.click(screen.getByRole("button", { name: /^변경사항 저장/ }));
    await screen.findByText("저장에 실패했습니다.");
    expect(updateCalls()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /^변경사항 저장/ }));
    await waitFor(() => expect(updateCalls()).toHaveLength(1));
  });

  it("invalidates token preparation when Auth changes away and back in one React batch", async () => {
    const ready = deferred<string | null>();
    vi.mocked(getAppCheckToken).mockReturnValueOnce(ready.promise);
    await changedEditor();
    fireEvent.click(screen.getByRole("button", { name: /^변경사항 저장/ }));
    await act(async () => { simulateLogin({ uid: "another-user" }); simulateLogin({ uid: "test-uid" }); });
    await act(async () => { ready.resolve("old-token"); });
    expect(constructedUpdates()).toHaveLength(0);
    expect(updateCalls()).toHaveLength(0);
  });

  it("does not construct or write after the editor unmounts while preparing its token", async () => {
    const ready = deferred<string | null>();
    vi.mocked(getAppCheckToken).mockReturnValueOnce(ready.promise);
    const view = await changedEditor();
    fireEvent.click(screen.getByRole("button", { name: /^변경사항 저장/ }));
    view.unmount();
    await act(async () => { ready.resolve("late-token"); });
    expect(constructedUpdates()).toHaveLength(0);
    expect(updateCalls()).toHaveLength(0);
  });

  it("preserves the original callable error object and permission message without automatic retry", async () => {
    const original = Object.assign(new Error("original denial"), { code: "functions/permission-denied" });
    setCallableImplementation("updateEvent", () => { throw original; });
    await changedEditor();
    fireEvent.click(screen.getByRole("button", { name: /^변경사항 저장/ }));
    await screen.findByText("호스트 권한이 없습니다.");
    expect(logClientError).toHaveBeenCalledWith("EventEditPage.save", original, { eventId: "ev" });
    expect(updateCalls()).toHaveLength(1);
  });

  it("uses the same cold gate for confirmed whole-event cancellation and suppresses duplicate pending confirmation", async () => {
    const ready = deferred<string | null>();
    vi.mocked(getAppCheckToken).mockReturnValueOnce(ready.promise);
    await editor();
    const confirm = await confirmCancel();
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(constructedUpdates()).toHaveLength(0);
    await act(async () => { ready.resolve("cancel-token"); });
    await waitFor(() => expect(updateCalls()).toHaveLength(1));
    expect(updateCalls()[0].data).toEqual({ eventId: "ev", cancel: true });
    expect(screen.getByRole("button", { name: "이벤트 취소", exact: true })).toBeDisabled();
  });

  it("does not cancel without a token and retains the existing cancellation error message", async () => {
    vi.mocked(getAppCheckToken).mockResolvedValueOnce(null);
    await editor();
    fireEvent.click(await confirmCancel());
    await screen.findByText("이벤트 취소에 실패했습니다.");
    expect(updateCalls()).toHaveLength(0);
    expect(constructedUpdates()).toHaveLength(0);
  });
});


it("names cutoff and safety controls without changing their initial values", async () => {
  setDocData("events/ev", { info: { name: "QA 원본 이벤트", status: "OPEN", creatorId: "test-uid", type: "TOUR", startTime: START_MS } });
  await editor();
  for (const name of ["컷오프 적용", "SOS 알림 활성화", "LIVE 트래킹 공개", "정비 지원 차량 안내"]) {
    expect(screen.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed");
  }
  expect(updateCalls()).toHaveLength(0);
});
