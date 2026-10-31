import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ActivityPublicAccess } from "./ActivityPublicAccess";
import type { PublicActivityDetail } from "../../../services/publicActivityDetail";
const state = vi.hoisted(() => ({ user: { uid: "viewer" }, load: vi.fn() }));
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("../../../services/publicActivityDetail", () => ({ createPublicActivityClient: () => ({ load: state.load }), isPublicActivityAccessError: (error: {code?: string}) => ["functions/permission-denied", "functions/not-found"].includes(error.code ?? "") }));
const detail = { activity: { id: "a", userId: "owner", source: "health_connect", groupId: "g", groupRideId: "ride", segmentEffortCount: 4, description: "기존 상세", summary: {}, activityRevision: "r1" }, viewerHasKudos: false, metrics: { schemaVersion: 3, status: "final", metrics: { version: 41, avgPower: 0 } }, content: { activityId: "a", status: "ready", comments: [] } } as unknown as PublicActivityDetail;
const options = { activityId: "a", retryKey: 0, onReady: () => {}, onError: () => {} };
function Probe() { return <MemoryRouter><ActivityPublicAccess {...options}>{({model}) => <output>{JSON.stringify({ source: model.activity?.source, group: model.activity?.groupRideId, count: model.activity?.segmentEffortCount, power: model.metrics.metrics?.avgPower })}</output>}</ActivityPublicAccess></MemoryRouter>; }
beforeEach(() => { state.user = { uid: "viewer" }; state.load.mockReset().mockResolvedValue(detail); });
it("retains the server's source, group, segment count and measured zero in the shared model", async () => {
  render(<Probe />);
  expect(await screen.findByText('{"source":"health_connect","group":"ride","count":4,"power":0}')).toBeVisible();
});
it("masks the previous detail immediately on same-UID session replacement", async () => {
  const view = render(<Probe />);
  await screen.findByText(/health_connect/);
  let resolve!: (value: PublicActivityDetail) => void;
  state.load.mockReturnValue(new Promise(yes => { resolve = yes; }));
  state.user = { uid: "viewer" }; view.rerender(<Probe />);
  expect(screen.queryByText(/health_connect/)).not.toBeInTheDocument();
  await act(async () => resolve(detail));
  expect(await screen.findByText(/health_connect/)).toBeVisible();
});
it("hides existing analysis during current-permission revalidation and removes it after denial", async () => {
  render(<Probe />); await screen.findByText(/health_connect/);
  state.load.mockRejectedValue({ code: "functions/permission-denied" });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(screen.getByText(/health_connect/)).not.toBeVisible();
  await waitFor(() => expect(screen.queryByText(/health_connect/)).not.toBeInTheDocument());
});

afterEach(() => vi.restoreAllMocks());
it("preserves the authorized layout but blocks stale content during refresh, then restores it", async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 2400 } as DOMRect);
  render(<Probe />);
  const body = await screen.findByText(/health_connect/);
  let resolve!: (value: PublicActivityDetail) => void;
  state.load.mockReturnValue(new Promise(yes => { resolve = yes; }));
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  const shield = body.closest("[inert]");
  expect(shield).toHaveAttribute("aria-hidden", "true");
  expect(shield).toHaveStyle({ height: "2400px", opacity: "0", pointerEvents: "none", visibility: "hidden", overflow: "hidden" });
  expect(body).not.toBeVisible();
  await act(async () => resolve(detail));
  expect(body).toBeVisible();
  expect(body.closest("[inert]")).toBeNull();
  expect(shield).not.toHaveStyle({ height: "2400px" });
});
it("removes the preserved layout when current access is denied", async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 2400 } as DOMRect);
  render(<Probe />); await screen.findByText(/health_connect/);
  state.load.mockRejectedValue({ code: "functions/permission-denied" });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await waitFor(() => expect(screen.queryByText(/health_connect/)).not.toBeInTheDocument());
  expect(document.querySelector("[inert]")).toBeNull();
  expect(document.querySelector('[style*="2400px"]')).toBeNull();
});
it("removes map geometry from the model while preserving only layout during revalidation", async () => {
  const mapped = { ...detail, mapPreview: { encodedPolyline: "authorized-track", imageUrl: "https://example.test/map" } } as PublicActivityDetail;
  state.load.mockResolvedValue(mapped);
  render(<MemoryRouter><ActivityPublicAccess {...options}>{({ model }) => <output data-testid="map-model">{JSON.stringify({ track: model.activity?.thumbnailTrack, image: model.activity?.mapImageUrl })}</output>}</ActivityPublicAccess></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId("map-model")).toHaveTextContent("authorized-track"));
  state.load.mockReturnValue(new Promise(() => {}));
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(screen.getByTestId("map-model")).toHaveTextContent('{"track":"","image":null}');
  expect(screen.getByTestId("map-model")).not.toBeVisible();
});

it.each(["functions/permission-denied", "functions/not-found", "functions/unauthenticated"])("keeps a recent visible session interactive during focus, then removes access on %s", async code => {
 const click = vi.fn();
 render(<MemoryRouter><ActivityPublicAccess {...options}>{() => <button onClick={click}>React</button>}</ActivityPublicAccess></MemoryRouter>);
 const button = await screen.findByRole("button", { name: "React" });
 let reject!: (reason: unknown) => void;
 state.load.mockReturnValue(new Promise((_, no) => { reject = no; }));
 fireEvent.focus(window);
 expect(state.load).toHaveBeenCalledTimes(2);
 expect(button).toBeVisible(); expect(button.closest("[inert]")).toBeNull();
 fireEvent.click(button); expect(click).toHaveBeenCalledTimes(1);
 await act(async () => reject({ code }));
 expect(screen.queryByRole("button", { name: "React" })).not.toBeInTheDocument();
});
it("shields focus immediately when the last successful verification is old", async () => {
 const now = vi.spyOn(Date, "now").mockReturnValue(100_000);
 render(<Probe />); const body = await screen.findByText(/health_connect/);
 now.mockReturnValue(130_001);
 state.load.mockReturnValue(new Promise(() => {}));
 fireEvent.focus(window);
 expect(body).not.toBeVisible(); expect(body.closest("[inert]")).not.toBeNull();
});
it("bounds visible focus retention by the remaining verification lifetime and never unmasks a hidden tab", async () => {
 const now = vi.spyOn(Date, "now").mockReturnValue(100_000);
 render(<Probe />); const body = await screen.findByText(/health_connect/);
 now.mockReturnValue(129_900); vi.useFakeTimers();
 try {
   state.load.mockReturnValue(new Promise(() => {}));
   fireEvent.focus(window); expect(body).toBeVisible();
   await act(async () => { await vi.advanceTimersByTimeAsync(100); });
   expect(body).not.toBeVisible();
   fireEvent.focus(window); expect(body).not.toBeVisible();
 } finally { vi.useRealTimers(); }
});

it("does not reveal the previous account from a pending focus response", async () => {
 const view = render(<Probe />); await screen.findByText(/health_connect/);
 let old!: (value: PublicActivityDetail) => void;
 state.load.mockReturnValueOnce(new Promise(yes => { old = yes; })).mockReturnValue(new Promise(() => {}));
 fireEvent.focus(window);
 state.user = { uid: "another-viewer" }; view.rerender(<Probe />);
 expect(screen.queryByText(/health_connect/)).not.toBeInTheDocument();
 await act(async () => old(detail));
 expect(screen.queryByText(/health_connect/)).not.toBeInTheDocument();
 expect(document.querySelector("[inert]")).toBeNull();
});
