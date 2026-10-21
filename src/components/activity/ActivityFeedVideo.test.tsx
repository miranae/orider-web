import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import ActivityFeedVideo from "./ActivityFeedVideo";

const mocks = vi.hoisted(() => ({
  supported: true,
  instances: [] as Array<{ handlers: Record<string, (...args: unknown[]) => void>; destroy: ReturnType<typeof vi.fn>; loadSource: ReturnType<typeof vi.fn> }>,
  observers: [] as Array<IntersectionObserverCallback>,
  resizes: [] as Array<() => void>,
  playing: new Set<HTMLMediaElement>(),
}));
vi.mock("hls.js", () => ({ default: class {
  static isSupported() { return mocks.supported; }
  static Events = { MANIFEST_PARSED: "manifest", ERROR: "error" };
  handlers: Record<string, (...args: unknown[]) => void> = {};
  destroy = vi.fn();
  loadSource = vi.fn();
  attachMedia = vi.fn();
  constructor() { mocks.instances.push(this); }
  on(event: string, callback: (...args: unknown[]) => void) { this.handlers[event] = callback; }
} }));
const media = { id: "video", kind: "video" as const, url: "https://images.example.test/poster.jpg", caption: null,
  videoUrl: "https://video.example.test/master.m3u8", durationSeconds: 21 };
const playButton = () => screen.getAllByRole("button", { name: "동영상 재생" }).find(node => node.tagName === "BUTTON")!;
beforeEach(() => {
  mocks.supported = true; mocks.instances = []; mocks.observers = []; mocks.resizes = []; mocks.playing.clear();
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("probably");
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    mocks.playing.add(this); this.dispatchEvent(new Event("playing")); return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    mocks.playing.delete(this); this.dispatchEvent(new Event("pause"));
  });
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(function (this: HTMLMediaElement) { return !mocks.playing.has(this); });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { mocks.observers.push(callback); }
    observe() {} disconnect() {}
  });
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { mocks.resizes.push(callback); }
    observe() {} disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("leaves the poster idle, then plays native HLS muted with keyboard, mute and remaining-time controls", async () => {
  const view = renderWithProviders(<ActivityFeedVideo media={media} />);
  const video = view.container.querySelector("video")!;
  expect(video).not.toHaveAttribute("src");
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  fireEvent.click(playButton());
  await waitFor(() => expect(video).toHaveAttribute("src", media.videoUrl));
  expect(video.muted).toBe(true);
  expect(video).toHaveAttribute("playsinline");
  expect(mocks.instances).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "소리 켜기" }));
  expect(video.muted).toBe(false);
  Object.defineProperty(video, "duration", { configurable: true, value: 21 });
  video.currentTime = 3.2;
  fireEvent.timeUpdate(video);
  expect(screen.getByText("0:18")).toBeVisible();
  fireEvent.keyDown(video, { key: " " });
  expect(video.paused).toBe(true);
  fireEvent.keyDown(video, { key: "Enter" });
  expect(video.paused).toBe(false);
  fireEvent.ended(video);
  expect(screen.getByText("0:00")).toBeVisible();
  view.unmount();
  expect(video).not.toHaveAttribute("src");
});
it("lazy-loads HLS.js, reports a fatal error without a URL, and destroys it on retry/unmount", async () => {
  vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue("");
  const view = renderWithProviders(<ActivityFeedVideo media={media} />);
  expect(mocks.instances).toHaveLength(0);
  fireEvent.click(playButton());
  await waitFor(() => expect(mocks.instances).toHaveLength(1));
  expect(mocks.instances[0].loadSource).toHaveBeenCalledWith(media.videoUrl);
  act(() => mocks.instances[0].handlers.manifest());
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  act(() => mocks.instances[0].handlers.error("error", { fatal: true }));
  expect(screen.getByRole("status")).toHaveTextContent("동영상을 재생하지 못했어요.");
  expect(screen.queryByText(media.videoUrl)).not.toBeInTheDocument();
  expect(mocks.instances[0].destroy).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "동영상 다시 재생" }));
  await waitFor(() => expect(mocks.instances).toHaveLength(2));
  view.unmount();
  expect(mocks.instances[1].destroy).toHaveBeenCalledOnce();
});
it("keeps an unsupported browser on the poster with a retry action", async () => {
  mocks.supported = false;
  vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue("");
  renderWithProviders(<ActivityFeedVideo media={media} />);
  fireEvent.click(playButton());
  expect(await screen.findByRole("status")).toBeVisible();
  expect(mocks.instances).toHaveLength(0);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});
it("pauses and releases HLS resources when its player leaves the viewport", async () => {
  vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue("");
  renderWithProviders(<ActivityFeedVideo media={media} />);
  fireEvent.click(playButton());
  await waitFor(() => expect(mocks.instances).toHaveLength(1));
  act(() => mocks.instances[0].handlers.manifest());
  act(() => mocks.observers[0]([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
  expect(mocks.instances[0].destroy).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "소리 켜기" })).not.toBeInTheDocument();
});
it("expands a narrow video below the unchanged poster row, then closes back to the idle tile", async () => {
  function Gallery() {
    const [outlet, setOutlet] = useState<HTMLDivElement | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    return <><div data-testid="poster-row"><ActivityFeedVideo media={media} expanded={expanded === media.id} expandedOutlet={outlet} onExpansionChange={setExpanded} /><span>next photo</span></div><div data-testid="player-outlet" ref={setOutlet} /></>;
  }
  const view = renderWithProviders(<Gallery />);
  const tile = view.container.querySelector(".mobile-feed-photo") as HTMLElement;
  tile.style.setProperty("--space-7", "32px"); tile.style.setProperty("--space-3", "12px");
  vi.spyOn(tile, "getBoundingClientRect").mockReturnValue({ width: 69 } as DOMRect);
  act(() => mocks.resizes[0]());
  fireEvent.click(playButton());
  const outlet = screen.getByTestId("player-outlet");
  await waitFor(() => expect(outlet.querySelector("video")).toBeInTheDocument());
  expect(screen.getByTestId("poster-row").querySelector("video")).not.toBeInTheDocument();
  expect(screen.getByTestId("poster-row")).toHaveTextContent("next photo");
  expect(outlet.querySelectorAll("button")).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "동영상 닫기" }));
  expect(outlet).toBeEmptyDOMElement();
  expect(screen.getByTestId("poster-row").querySelector("video")).not.toHaveAttribute("src");
});

it.each([false, true])("moves a wide video to the inline outlet on resize and preserves its paused=%s state", async paused => {
  function Gallery() {
    const [outlet, setOutlet] = useState<HTMLDivElement | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    return <><ActivityFeedVideo media={media} expanded={expanded === media.id} expandedOutlet={outlet} onExpansionChange={setExpanded} /><div data-testid="outlet" ref={setOutlet} /></>;
  }
  const view = renderWithProviders(<Gallery />);
  const tile = view.container.querySelector(".mobile-feed-photo") as HTMLElement;
  tile.style.setProperty("--space-7", "32px"); tile.style.setProperty("--space-3", "12px");
  let width = 200;
  vi.spyOn(tile, "getBoundingClientRect").mockImplementation(() => ({ width }) as DOMRect);
  act(() => mocks.resizes[0]());
  fireEvent.click(playButton());
  const original = view.container.querySelector("video")!;
  await waitFor(() => expect(original.paused).toBe(false));
  original.currentTime = 8;
  if (paused) fireEvent.keyDown(original, { key: " " });
  else mocks.playing.delete(original); // Browsers pause a detached video before React effect cleanup.
  width = 69;
  act(() => mocks.resizes[0]());
  const outlet = screen.getByTestId("outlet");
  await waitFor(() => expect(outlet.querySelector("video")).toBeInTheDocument());
  const resized = outlet.querySelector("video")!;
  Object.defineProperty(resized, "duration", { configurable: true, value: 21 });
  fireEvent.loadedMetadata(resized);
  expect(resized.currentTime).toBe(8);
  expect(resized.paused).toBe(paused);
  expect(original).not.toHaveAttribute("src");
});
