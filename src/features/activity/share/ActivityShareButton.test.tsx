import { forwardRef, useImperativeHandle } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityShareButton } from "./ActivityShareButton";
import * as cardModule from "./activityShareCard";
import { track } from "../../../services/analytics";

vi.mock("../../../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("../../../services/analytics", () => ({ track: vi.fn() }));
const captureMap = vi.hoisted(() => vi.fn(async () => null as HTMLCanvasElement | null));
vi.mock("./ActivityShareMapCapture", () => ({
  ActivityShareMapCapture: forwardRef(function MockActivityShareMapCapture(_props, ref) {
    useImperativeHandle(ref, () => ({ capture: captureMap }));
    return null;
  }),
}));
vi.mock("./activityShareCard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./activityShareCard")>();
  return {
    ...actual,
    drawActivityShareCard: vi.fn(),
    canvasToPng: vi.fn(),
    downloadShareCard: vi.fn(),
  };
});

const card = {
  title: "Morning Ride",
  athlete: "Rider",
  sport: "Ride",
  date: "2026-07-11",
  distance: "42 km",
  duration: "1:30:00",
  elevation: "500 m",
  distanceLabel: "Distance",
  durationLabel: "Time",
  elevationLabel: "Elevation",
  performanceLabel: "Ride performance",
  elevationProfileLabel: "Elevation profile",
  footer: "Ride card",
  includeRouteImage: true,
};
const props = { card, filename: "ride.png", url: "https://orider.net/a/1", activityId: "a1", visibility: "everyone", onFeedback: vi.fn() };

afterEach(() => {
  vi.clearAllMocks();
  captureMap.mockResolvedValue(null);
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
});

describe("ActivityShareButton", () => {
  it("downloads the generated PNG even when native file sharing is supported", async () => {
    const routeCanvas = document.createElement("canvas");
    captureMap.mockResolvedValue(routeCanvas);
    const blob = new Blob(["png"], { type: "image/png" });
    vi.mocked(cardModule.drawActivityShareCard).mockResolvedValue(document.createElement("canvas"));
    vi.mocked(cardModule.canvasToPng).mockResolvedValue(blob);
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: canShare, configurable: true });

    render(<ActivityShareButton {...props} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(cardModule.downloadShareCard).toHaveBeenCalledWith(blob, "ride.png"));
    expect(cardModule.drawActivityShareCard).toHaveBeenCalledWith(
      expect.objectContaining({ routeCanvas }),
      expect.any(AbortSignal),
    );
    expect(share).not.toHaveBeenCalled();
    expect(canShare).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith("activity_share_download", { activityId: "a1", visibility: "everyone" });
  });

  it("downloads once when native file sharing is unavailable and blocks duplicate clicks", async () => {
    let resolveCanvas!: (canvas: HTMLCanvasElement) => void;
    vi.mocked(cardModule.drawActivityShareCard).mockReturnValue(new Promise((resolve) => { resolveCanvas = resolve; }));
    vi.mocked(cardModule.canvasToPng).mockResolvedValue(new Blob(["png"], { type: "image/png" }));

    render(<ActivityShareButton {...props} />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(cardModule.drawActivityShareCard).toHaveBeenCalledTimes(1));
    expect(button).toBeDisabled();
    resolveCanvas(document.createElement("canvas"));

    await waitFor(() => expect(cardModule.downloadShareCard).toHaveBeenCalledTimes(1));
    expect(track).toHaveBeenCalledWith("activity_share_download", { activityId: "a1", visibility: "everyone" });
  });

  it("copies the safe activity link if image generation fails", async () => {
    vi.mocked(cardModule.drawActivityShareCard).mockRejectedValue(new Error("tainted canvas"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<ActivityShareButton {...props} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://orider.net/a/1"));
    expect(track).toHaveBeenCalledWith("activity_share_link", { activityId: "a1", visibility: "everyone" });
  });

  it("aborts generation and suppresses feedback after unmount", async () => {
    let resolveCanvas!: (canvas: HTMLCanvasElement) => void;
    vi.mocked(cardModule.drawActivityShareCard).mockReturnValue(new Promise((resolve) => { resolveCanvas = resolve; }));
    const onFeedback = vi.fn();
    const { unmount } = render(<ActivityShareButton {...props} onFeedback={onFeedback} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(cardModule.drawActivityShareCard).toHaveBeenCalledOnce());
    const signal = vi.mocked(cardModule.drawActivityShareCard).mock.calls[0][1];
    unmount();
    expect(signal?.aborted).toBe(true);
    resolveCanvas(document.createElement("canvas"));
    await Promise.resolve();
    expect(cardModule.canvasToPng).not.toHaveBeenCalled();
    expect(onFeedback).not.toHaveBeenCalled();
  });

  it("does not request a map capture for a private activity", async () => {
    vi.mocked(cardModule.drawActivityShareCard).mockResolvedValue(document.createElement("canvas"));
    vi.mocked(cardModule.canvasToPng).mockResolvedValue(new Blob(["png"], { type: "image/png" }));

    render(<ActivityShareButton {...props} card={{ ...card, includeRouteImage: false }} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(cardModule.downloadShareCard).toHaveBeenCalledOnce());
    expect(captureMap).not.toHaveBeenCalled();
  });
});
