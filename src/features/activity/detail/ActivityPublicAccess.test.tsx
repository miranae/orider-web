import { encodePolyline } from "../../../utils/polyline";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: "metric" }) }));
import { ActivityPublicAccess } from "./ActivityPublicAccess";
import type { PublicActivityDetail } from "../../../services/publicActivityDetail";
import { PUBLIC_ACCESS_VERIFIED_TTL_MS } from "../../../hooks/usePublicActivitySession";
const state = vi.hoisted(() => ({ user: { uid: "viewer" } as { uid: string } | null, load: vi.fn(), signIn: vi.fn() }));
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user, signIn: state.signIn }) }));
vi.mock("../../../services/publicActivityDetail", () => ({ createPublicActivityClient: () => ({ load: state.load }), isPublicActivityAccessError: (error: {code?: string}) => ["functions/permission-denied", "functions/not-found"].includes(error.code ?? "") }));
const detail = { activity: { id: "a", userId: "owner", source: "health_connect", groupId: "g", groupRideId: "ride", segmentEffortCount: 4, description: "기존 상세", summary: {}, activityRevision: "r1" }, viewerHasKudos: false, metrics: { schemaVersion: 3, status: "final", metrics: { version: 41, avgPower: 0 } }, content: { activityId: "a", status: "ready", comments: [] } } as unknown as PublicActivityDetail;
const options = { activityId: "a", retryKey: 0, onReady: () => {}, onError: () => {} };
function Probe() { return <MemoryRouter><ActivityPublicAccess {...options}>{({model}) => <output>{JSON.stringify({ source: model.activity?.source, group: model.activity?.groupRideId, count: model.activity?.segmentEffortCount, power: model.metrics.metrics?.avgPower })}</output>}</ActivityPublicAccess></MemoryRouter>; }
beforeEach(() => { state.user = { uid: "viewer" }; state.signIn.mockReset(); state.load.mockReset().mockResolvedValue(detail); });
it("로그인하지 않은 사람의 접근 거부 문구를 누르면 로그인 창을 연다 — 새 버튼은 없다", async () => {
  state.user = null;
  state.load.mockRejectedValue({ code: "functions/permission-denied" });
  render(<Probe />);
  const message = await screen.findByRole("button", { name: /활동을 볼 수 없습니다/ });
  expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual([message.textContent, "다시 시도"]);
  fireEvent.click(message);
  expect(state.signIn).toHaveBeenCalledTimes(1);
});
it("로그인한 사람의 접근 거부 문구는 글자 그대로다", async () => {
  state.load.mockRejectedValue({ code: "functions/permission-denied" });
  render(<Probe />);
  expect(await screen.findByText(/활동을 볼 수 없습니다/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /활동을 볼 수 없습니다/ })).not.toBeInTheDocument();
});
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
  const visibilityRegistration = vi.spyOn(document, "addEventListener");
  render(<Probe />); await screen.findByText(/health_connect/);
  await waitFor(() => expect(visibilityRegistration).toHaveBeenCalledWith("visibilitychange", expect.any(Function)));
  state.load.mockRejectedValue({ code: "functions/permission-denied" });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(screen.getByText(/health_connect/)).not.toBeVisible();
  await waitFor(() => expect(screen.queryByText(/health_connect/)).not.toBeInTheDocument());
});

afterEach(() => vi.restoreAllMocks());
it("preserves the authorized layout but blocks stale content during refresh, then restores it", async () => {
  const visibilityRegistration = vi.spyOn(document, "addEventListener");
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 2400 } as DOMRect);
  render(<Probe />);
  const body = await screen.findByText(/health_connect/);
  await waitFor(() => expect(visibilityRegistration).toHaveBeenCalledWith("visibilitychange", expect.any(Function)));
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
  const visibilityRegistration = vi.spyOn(document, "addEventListener");
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 2400 } as DOMRect);
  render(<Probe />); await screen.findByText(/health_connect/);
  await waitFor(() => expect(visibilityRegistration).toHaveBeenCalledWith("visibilitychange", expect.any(Function)));
  state.load.mockRejectedValue({ code: "functions/permission-denied" });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await waitFor(() => expect(screen.queryByText(/health_connect/)).not.toBeInTheDocument());
  expect(document.querySelector("[inert]")).toBeNull();
  expect(document.querySelector('[style*="2400px"]')).toBeNull();
});
it("removes map geometry from the model while preserving only layout during revalidation", async () => {
  const visibilityRegistration = vi.spyOn(document, "addEventListener");
  const mapped = { ...detail, mapPreview: { encodedPolyline: "authorized-track", imageUrl: "https://example.test/map" } } as PublicActivityDetail;
  state.load.mockResolvedValue(mapped);
  render(<MemoryRouter><ActivityPublicAccess {...options}>{({ model }) => <output data-testid="map-model">{JSON.stringify({ track: model.activity?.thumbnailTrack, image: model.activity?.mapImageUrl })}</output>}</ActivityPublicAccess></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId("map-model")).toHaveTextContent("authorized-track"));
  await waitFor(() => expect(visibilityRegistration).toHaveBeenCalledWith("visibilitychange", expect.any(Function)));
  state.load.mockReturnValue(new Promise(() => {}));
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(screen.getByTestId("map-model")).toHaveTextContent('{"track":"","image":null}');
  expect(screen.getByTestId("map-model")).not.toBeVisible();
});

it.each(["functions/permission-denied", "functions/not-found", "functions/unauthenticated"])("keeps a recent visible session interactive during focus, then removes access on %s", async code => {
 const click = vi.fn();
 const focusRegistration = vi.spyOn(window, "addEventListener");
 render(<MemoryRouter><ActivityPublicAccess {...options}>{() => <button onClick={click}>React</button>}</ActivityPublicAccess></MemoryRouter>);
 const button = await screen.findByRole("button", { name: "React" });
 // 준비 DOM은 passive effect보다 먼저 보일 수 있으므로 실제 재검증 구독을 기다린다.
 await waitFor(() => expect(focusRegistration).toHaveBeenCalledWith("focus", expect.any(Function)));
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
 const focusRegistration = vi.spyOn(window, "addEventListener");
 render(<Probe />); const body = await screen.findByText(/health_connect/);
 await waitFor(() => expect(focusRegistration).toHaveBeenCalledWith("focus", expect.any(Function)));
 now.mockReturnValue(100_000 + PUBLIC_ACCESS_VERIFIED_TTL_MS + 1);
 state.load.mockReturnValue(new Promise(() => {}));
 fireEvent.focus(window);
 expect(body).not.toBeVisible(); expect(body.closest("[inert]")).not.toBeNull();
});
it("bounds visible focus retention by the remaining verification lifetime and never unmasks a hidden tab", async () => {
 const now = vi.spyOn(Date, "now").mockReturnValue(100_000);
 const focusRegistration = vi.spyOn(window, "addEventListener");
 render(<Probe />); const body = await screen.findByText(/health_connect/);
 await waitFor(() => expect(focusRegistration).toHaveBeenCalledWith("focus", expect.any(Function)));
 now.mockReturnValue(100_000 + PUBLIC_ACCESS_VERIFIED_TTL_MS - 100); vi.useFakeTimers();
 try {
   state.load.mockReturnValue(new Promise(() => {}));
   fireEvent.focus(window); expect(body).toBeVisible();
   await act(async () => { await vi.advanceTimersByTimeAsync(100); });
   expect(body).not.toBeVisible();
   fireEvent.focus(window); expect(body).not.toBeVisible();
 } finally { vi.useRealTimers(); }
});

it("does not reveal the previous account from a pending focus response", async () => {
 const focusRegistration = vi.spyOn(window, "addEventListener");
 const view = render(<Probe />); await screen.findByText(/health_connect/);
 await waitFor(() => expect(focusRegistration).toHaveBeenCalledWith("focus", expect.any(Function)));
 let old!: (value: PublicActivityDetail) => void;
 state.load.mockReturnValueOnce(new Promise(yes => { old = yes; })).mockReturnValue(new Promise(() => {}));
 fireEvent.focus(window);
 state.user = { uid: "another-viewer" }; view.rerender(<Probe />);
 expect(screen.queryByText(/health_connect/)).not.toBeInTheDocument();
 await act(async () => old(detail));
 expect(screen.queryByText(/health_connect/)).not.toBeInTheDocument();
 expect(document.querySelector("[inert]")).toBeNull();
});

it("keeps an identical revalidation response from re-rendering the detail", async () => {
 const focusRegistration = vi.spyOn(window, "addEventListener");
 const seen: unknown[] = [];
 render(<MemoryRouter><ActivityPublicAccess {...options}>{({ model }) => { seen.push(model.activity); return <output>{model.activity?.source}</output>; }}</ActivityPublicAccess></MemoryRouter>);
 await screen.findByText("health_connect");
 await waitFor(() => expect(focusRegistration).toHaveBeenCalledWith("focus", expect.any(Function)));
 const before = seen.at(-1);
 state.load.mockResolvedValue(structuredClone(detail));
 fireEvent.focus(window);
 await waitFor(() => expect(state.load).toHaveBeenCalledTimes(2));
 await act(async () => {});
 expect(seen.at(-1)).toBe(before);
});

it("passes bounded disconnected detail geometry separately and drops it during ACL revalidation", async () => {
 const parts: [number,number][][] = [[[37,127],[37.01,127.01]],[[38,128],[38.01,128.01]]];
 state.load.mockResolvedValue({ ...detail, mapPreview: { encodedPolyline:null, encodedPolylineParts:parts.map(encodePolyline), imageUrl:"https://example.test/stale-joined" } });
 render(<MemoryRouter><ActivityPublicAccess {...options}>{({model,routeParts}) => <output data-testid="segmented-model">{JSON.stringify({parts:routeParts,track:model.activity?.thumbnailTrack,image:model.activity?.mapImageUrl})}</output>}</ActivityPublicAccess></MemoryRouter>);
 await waitFor(() => expect(screen.getByTestId("segmented-model")).toHaveTextContent(JSON.stringify({parts,track:"",image:null})));
 state.load.mockReturnValue(new Promise(() => {}));
 act(() => document.dispatchEvent(new Event("visibilitychange")));
 expect(screen.getByTestId("segmented-model")).toHaveTextContent('{"track":"","image":null}');
 expect(screen.getByTestId("segmented-model")).not.toBeVisible();
});
