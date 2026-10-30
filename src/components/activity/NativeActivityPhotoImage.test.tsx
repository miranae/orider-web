import { act, fireEvent, render, screen } from "@testing-library/react";
import { NativeActivityPhotoImage } from "./NativeActivityPhotoImage";
const mock = vi.hoisted(() => ({ hook: vi.fn(), retry: vi.fn() }));
vi.mock("../../hooks/useNativeActivityPhoto", () => ({ useNativeActivityPhoto: (...args: unknown[]) => mock.hook(...args) }));
const photo = { activityId: "ride", photoId: "photo" };
beforeEach(() => {
  mock.retry.mockReset(); mock.hook.mockReset().mockReturnValue({ url: null, error: null, retry: mock.retry });
  vi.stubGlobal("IntersectionObserver", undefined);
});
afterEach(() => vi.unstubAllGlobals());
it("keeps a missing photo retryable without revoking activity access", () => {
  const revoke = vi.fn();
  mock.hook.mockReturnValue({ url: null, error: { code: "functions/not-found" }, retry: mock.retry });
  render(<NativeActivityPhotoImage nativePhoto={photo} retryable onAccessRevoked={revoke} alt="Ride photo" />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(screen.getByRole("status").closest("[data-photo-state]")).toHaveAttribute("data-photo-state", "error");
  const retry = screen.getByRole("button", { name: "다시 시도" });
  expect(retry).toBeEnabled(); fireEvent.click(retry);
  expect(mock.retry).toHaveBeenCalledTimes(1); expect(revoke).not.toHaveBeenCalled();
  expect(screen.queryByRole("img")).toBeNull();
});
it("notifies the activity consumer when photo access is forbidden", () => {
  const revoke = vi.fn();
  mock.hook.mockReturnValue({ url: null, error: { code: "functions/permission-denied" }, retry: mock.retry });
  render(<NativeActivityPhotoImage nativePhoto={photo} onAccessRevoked={revoke} alt="Ride photo" />);
  expect(revoke).toHaveBeenCalledTimes(1); expect(screen.queryByRole("img")).toBeNull();
});
it("disables offscreen reads again after a photo has entered and left the viewport", () => {
  let observeEntries!: IntersectionObserverCallback;
  const observe = vi.fn(), disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { observeEntries = callback; }
    observe = observe; disconnect = disconnect;
  });
  const view = render(<NativeActivityPhotoImage nativePhoto={photo} alt="Ride photo" />);
  expect(observe).toHaveBeenCalledTimes(1); expect(mock.hook).toHaveBeenLastCalledWith(photo, false);
  const intersection = (isIntersecting: boolean) => act(() => observeEntries([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver));
  intersection(true); expect(mock.hook).toHaveBeenLastCalledWith(photo, true);
  expect(disconnect).not.toHaveBeenCalled();
  intersection(false); expect(mock.hook).toHaveBeenLastCalledWith(photo, false);
  intersection(true); expect(mock.hook).toHaveBeenLastCalledWith(photo, true);
  view.unmount(); expect(disconnect).toHaveBeenCalledTimes(1);
});
