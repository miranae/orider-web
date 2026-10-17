import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ImportActivityModal from "./ImportActivityModal";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), toast: vi.fn(), token: vi.fn().mockResolvedValue("test-only-token") }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({user: {uid: "test", getIdToken: mocks.token}}) }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({showToast: mocks.toast}) }));
vi.mock("../../hooks/useLocalizedNavigate", async (importOriginal) => ({ ...await importOriginal<typeof import("../../hooks/useLocalizedNavigate")>(), useLocalizedNavigate: () => mocks.navigate }));

beforeEach(() => { mocks.navigate.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); });

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
