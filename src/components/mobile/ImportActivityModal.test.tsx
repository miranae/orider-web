import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ImportActivityModal from "./ImportActivityModal";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";

const mocks = vi.hoisted(() => {
  const token = vi.fn().mockResolvedValue("test-only-token");
  const user = { uid: "test", isAnonymous: false, getIdToken: token };
  return { navigate: vi.fn(), toast: vi.fn(), token, user,
    services: { auth: { currentUser: user, app: { name: "test" } } },
    listeners: new Set<(user: unknown) => void>() };
});
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_auth: unknown, callback: (user: unknown) => void) => {
  mocks.listeners.add(callback); return () => mocks.listeners.delete(callback);
} }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({showToast: mocks.toast}) }));
vi.mock("../../hooks/useLocalizedNavigate", async (importOriginal) => ({ ...await importOriginal<typeof import("../../hooks/useLocalizedNavigate")>(), useLocalizedNavigate: () => mocks.navigate }));

beforeEach(() => {
  mocks.navigate.mockClear(); mocks.toast.mockClear(); mocks.listeners.clear();
  mocks.token.mockReset().mockResolvedValue("test-only-token");
  mocks.user = { uid: "test", isAnonymous: false, getIdToken: mocks.token };
  mocks.services = { auth: { currentUser: mocks.user, app: { name: "test" } } };
});
afterEach(() => { vi.unstubAllGlobals(); resetRuntimeConfigForTests(); });

it("portals upload above its caller, traps focus, and closes safely with Escape", () => {
  const close = vi.fn();
  const view = render(<MemoryRouter><ImportActivityModal open onClose={close} /></MemoryRouter>);
  const dialog = screen.getByRole("dialog");
  expect(dialog.parentElement).toBe(document.body);
  expect(view.container).not.toContainElement(dialog);
  expect(screen.getByRole("button", {name: "닫기"})).toHaveFocus();
  fireEvent.keyDown(document, {key: "Escape"});
  expect(close).toHaveBeenCalledOnce();
});

it("submits the chosen file and privacy through the unchanged endpoint, then presents a focused completion", async () => {
  const close = vi.fn();
  let resolveFetch!: (response: Response) => void;
  const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(resolve => {resolveFetch = resolve;}));
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><ImportActivityModal open onClose={close} /></MemoryRouter>);
  const file = new File(["mock-fit"], "run.fit", {type: "application/octet-stream"});
  fireEvent.change(screen.getByTestId("P1-3-1"), {target: {files: [file]}});
  fireEvent.click(screen.getByRole("button", {name: "비공개"}));
  fireEvent.click(screen.getByRole("button", {name: "업로드"}));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  const [endpoint, request] = fetchMock.mock.calls[0]!;
  expect(endpoint).toBe("/api/v1/import/activity");
  expect(request.body.get("file")).toBe(file);
  expect(request.body.get("visibility")).toBe("private");
  fireEvent.keyDown(document, {key: "Escape"});
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("button", {name: "닫기"})).toBeDisabled();
  expect(screen.queryByRole("link", {name: "설정"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("설정"));
  expect(close).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
  resolveFetch({ok: true, json: async () => ({data: {activityId: "result-1"}})} as Response);
  await waitFor(() => expect(screen.getByRole("dialog")).toHaveAccessibleName("처리 완료"));
  fireEvent.click(screen.getByRole("button", {name: "가져온 기록 보기"}));
  expect(mocks.navigate).toHaveBeenCalledWith("/activity/result-1");
  expect(close).toHaveBeenCalledOnce();
});

it("completion coach navigation clears the form without referencing an uninitialized reset callback", async () => {
  const close = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok: true, json: async () => ({data: {activityId: "result-2"}})}));
  render(<MemoryRouter><ImportActivityModal open onClose={close} /></MemoryRouter>);
  fireEvent.change(screen.getByTestId("P1-3-1"), {target: {files: [new File(["sample"], "run.fit")]}});
  fireEvent.click(screen.getByRole("button", {name: "업로드"}));
  await waitFor(() => expect(screen.getByRole("dialog")).toHaveAccessibleName("처리 완료"));
  const coachLink = screen.getByRole("link", {name: /코치에서 보기/});
  expect(coachLink).toHaveAttribute("href", "/ko/coach/condition");
  fireEvent.click(coachLink);
  expect(close).toHaveBeenCalledOnce();
});

it.each([["run.fit", "activity"], ["activities.zip", "batch"]])("uploads %s to the configured production API with the existing user token", async (filename, route) => {
  resetRuntimeConfigForTests({ appEnvironment: "production", personalApiBase: "https://orider.co.kr/" });
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { activityId: "result", created: 1 } }) });
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><ImportActivityModal open onClose={vi.fn()} /></MemoryRouter>);
  fireEvent.change(screen.getByTestId("P1-3-1"), { target: { files: [new File(["synthetic"], filename)] } });
  fireEvent.click(screen.getByRole("button", { name: "업로드" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(fetchMock).toHaveBeenCalledWith(`https://orider.co.kr/api/v1/import/${route}`, expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer test-only-token" } }));
  await waitFor(() => expect(screen.getByRole("dialog")).toHaveAccessibleName("처리 완료"));
});


it("locks only while open and restores the previous body styles and scroll position on close", () => {
  const previousPosition = document.body.style.position;
  const previousOverflow = document.body.style.overflow;
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const close = vi.fn();
  const view = render(<MemoryRouter><ImportActivityModal open={false} onClose={close} /></MemoryRouter>);
  try {
    expect(document.body.style.position).toBe(previousPosition);
    expect(document.body.style.overflow).toBe(previousOverflow);
    view.rerender(<MemoryRouter><ImportActivityModal open onClose={close} /></MemoryRouter>);
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.overflow).toBe("hidden");
    view.rerender(<MemoryRouter><ImportActivityModal open={false} onClose={close} /></MemoryRouter>);
    expect(document.body.style.position).toBe(previousPosition);
    expect(document.body.style.overflow).toBe(previousOverflow);
    expect(scrollTo).toHaveBeenCalled();
  } finally {
    view.unmount();
    scrollTo.mockRestore();
  }
});

function selectFileAndUpload() {
  fireEvent.change(screen.getByTestId("P1-3-1"), { target: { files: [new File(["synthetic"], "ride.fit")] } });
  fireEvent.click(screen.getByRole("button", { name: "업로드" }));
}

it.each(["different-user", "same-user-new-session", "app", "close"])("prevents dispatch after token wait when %s changes", async change => {
  let resolveToken!: (token: string) => void;
  mocks.token.mockImplementation(() => new Promise<string>(resolve => { resolveToken = resolve; }));
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  const close = vi.fn();
  const view = render(<MemoryRouter><ImportActivityModal open onClose={close} /></MemoryRouter>);
  selectFileAndUpload();
  if (change === "close") view.rerender(<MemoryRouter><ImportActivityModal open={false} onClose={close} /></MemoryRouter>);
  else if (change === "app") {
    mocks.services = { auth: { currentUser: mocks.user, app: { name: "replacement" } } };
    view.rerender(<MemoryRouter><ImportActivityModal open onClose={close} /></MemoryRouter>);
  } else {
    mocks.services.auth.currentUser = { ...mocks.user, uid: change === "different-user" ? "other" : "test" };
    // AuthContext 렌더보다 SDK 교체가 먼저 일어나도 dispatch 하면 안 된다.
  }
  await act(async () => resolveToken("old-session-token"));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(mocks.toast).not.toHaveBeenCalled();
});

it.each(["success", "failure", "json"])("drops late %s and aborts transport on account change without touching the new form", async outcome => {
  let resolveFetch!: (response: Response) => void;
  let rejectFetch!: (error: Error) => void;
  let resolveJson!: (value: unknown) => void;
  const fetchMock = vi.fn(() => new Promise<Response>((resolve, reject) => { resolveFetch = resolve; rejectFetch = reject; }));
  vi.stubGlobal("fetch", fetchMock);
  const close = vi.fn();
  const view = render(<MemoryRouter><ImportActivityModal open onClose={close} /></MemoryRouter>);
  selectFileAndUpload();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  const signal = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
  if (outcome === "json") {
    await act(async () => resolveFetch({ ok: true, json: () => new Promise(resolve => { resolveJson = resolve; }) } as Response));
  }
  mocks.user = { ...mocks.user, uid: "next" };
  mocks.services.auth.currentUser = mocks.user;
  view.rerender(<MemoryRouter><ImportActivityModal open onClose={close} /></MemoryRouter>);
  expect(signal.aborted).toBe(true);
  const nextFile = new File(["next"], "next.gpx");
  fireEvent.change(screen.getByTestId("P1-3-1"), { target: { files: [nextFile] } });
  await act(async () => {
    if (outcome === "failure") rejectFetch(new Error("old failure"));
    else if (outcome === "json") resolveJson({ data: { activityId: "old-private-id" } });
    else resolveFetch({ ok: true, json: async () => ({ data: { activityId: "old-private-id" } }) } as Response);
  });
  expect(screen.getByText("next.gpx")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "가져온 기록 보기" })).not.toBeInTheDocument();
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "업로드" })).toBeEnabled();
});

it("clears the form and aborts immediately on SDK logout before context rerenders", async () => {
  const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
  vi.stubGlobal("fetch", fetchMock);
  const close = vi.fn();
  render(<MemoryRouter><ImportActivityModal open onClose={close} /></MemoryRouter>);
  selectFileAndUpload();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  const signal = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
  act(() => { mocks.listeners.forEach(listener => listener(null)); });
  expect(signal.aborted).toBe(true);
  expect(close).toHaveBeenCalledOnce();
  expect(screen.queryByText("ride.fit")).not.toBeInTheDocument();
  expect(mocks.toast).not.toHaveBeenCalled();
});

it("keeps the new session upload busy when the old session finally settles", async () => {
  const responses: Array<(response: Response) => void> = [];
  const fetchMock = vi.fn(() => new Promise<Response>(resolve => { responses.push(resolve); }));
  vi.stubGlobal("fetch", fetchMock);
  const close = vi.fn();
  const view = render(<MemoryRouter><ImportActivityModal open onClose={close} /></MemoryRouter>);
  selectFileAndUpload();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  mocks.user = { ...mocks.user };
  mocks.services.auth.currentUser = mocks.user;
  view.rerender(<MemoryRouter><ImportActivityModal open onClose={close} /></MemoryRouter>);
  selectFileAndUpload();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  await act(async () => responses[0]({ ok: true, json: async () => ({ data: { activityId: "old" } }) } as Response));
  expect(screen.getByRole("button", { name: "닫기" })).toBeDisabled();
  expect(mocks.toast).not.toHaveBeenCalled();
  await act(async () => responses[1]({ ok: true, json: async () => ({ data: { activityId: "new" } }) } as Response));
  fireEvent.click(screen.getByRole("button", { name: "가져온 기록 보기" }));
  expect(mocks.navigate).toHaveBeenCalledWith("/activity/new");
});

it("preserves the chosen file for a real network failure and retries in the same session", async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network failure"))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { activityId: "retry" } }) });
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><ImportActivityModal open onClose={vi.fn()} /></MemoryRouter>);
  selectFileAndUpload();
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("network failure"));
  expect(screen.getByText("ride.fit")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "업로드" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "가져온 기록 보기" })).toBeInTheDocument());
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
