import { act, cleanup, render, screen } from "@testing-library/react";
import ImpersonationBanner from "./ImpersonationBanner";

const mocks = vi.hoisted(() => ({
  auth: { user: { uid: "qa-user", email: "qa@example.test" }, profile: { nickname: "검수 사용자" }, loading: false },
  read: { status: "active", state: { targetUid: "qa-user", by: "검수 관리자", at: 1 } } as import("../services/impersonation").ImpersonationRead,
  height: 61,
  resize: () => {},
  disconnect: vi.fn(),
}));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("../services/impersonation", () => ({
  readImpersonation: () => mocks.read,
  subscribeImpersonation: () => () => {},
  clearImpersonationState: vi.fn(),
}));

beforeEach(() => {
  mocks.read = { status: "active", state: { targetUid: "qa-user", by: "검수 관리자", at: 1 } };
  mocks.height = 61;
  mocks.disconnect.mockClear();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, 393, mocks.height));
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { mocks.resize = callback; }
    observe() {}
    disconnect() { mocks.disconnect(); }
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const offset = () => document.documentElement.style.getPropertyValue("--impersonation-banner-height");

it("shares the visible banner's measured height and tracks wrapping changes", () => {
  render(<ImpersonationBanner />);
  expect(screen.getByRole("alert")).toHaveTextContent("위임 세션");
  expect(offset()).toBe("61px");
  mocks.height = 89;
  act(() => mocks.resize());
  expect(offset()).toBe("89px");
});
it("clears the offset and observer when the delegated banner disappears", () => {
  const view = render(<ImpersonationBanner />);
  mocks.read = { status: "none" };
  view.rerender(<ImpersonationBanner />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(offset()).toBe("");
  expect(mocks.disconnect).toHaveBeenCalledOnce();
});
it("removes the offset on unmount and leaves ordinary sessions without a gap", () => {
  const view = render(<ImpersonationBanner />);
  view.unmount();
  expect(offset()).toBe("");
  mocks.read = { status: "none" };
  render(<ImpersonationBanner />);
  expect(offset()).toBe("");
});
it("keeps corrupt-session warnings measured but hides stale targets", () => {
  mocks.read = { status: "corrupt" };
  const view = render(<ImpersonationBanner />);
  expect(offset()).toBe("61px");
  mocks.read = { status: "active", state: { targetUid: "another-user", by: "検수", at: 1 } };
  view.rerender(<ImpersonationBanner />);
  expect(offset()).toBe("");
});
it("updates on viewport resize even without ResizeObserver", () => {
  vi.stubGlobal("ResizeObserver", undefined);
  render(<ImpersonationBanner />);
  mocks.height = 44;
  act(() => window.dispatchEvent(new Event("resize")));
  expect(offset()).toBe("44px");
});
