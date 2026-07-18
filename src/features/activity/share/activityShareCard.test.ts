import { afterEach, describe, expect, it, vi } from "vitest";
import { drawActivityShareCard, downloadShareCard } from "./activityShareCard";
import { saveAs } from "file-saver";

vi.mock("file-saver", () => ({ saveAs: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function context() {
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    measureText: vi.fn(() => ({ width: 100 })),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe("drawActivityShareCard privacy", () => {
  it("does not load a route image when privacy filtering disables it", async () => {
    const ctx = context();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    const image = vi.spyOn(globalThis, "Image");

    await drawActivityShareCard({
      title: "Private ride", athlete: "Rider", sport: "Ride", date: "Today",
      distance: "10 km", duration: "30:00", elevation: "100 m",
      distanceLabel: "Distance", durationLabel: "Time", elevationLabel: "Elevation",
      performanceLabel: "Ride performance",
      footer: "O-Rider", routeImageUrl: "https://example.com/static-route.png", backgroundImageUrl: "https://example.com/precise-route.png",
      includeRouteImage: false,
    });

    expect(image).not.toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it("bounds every user-provided text field to its drawing column", async () => {
    const ctx = context();
    vi.mocked(ctx.measureText).mockImplementation((text) => ({ width: String(text).length * 20 }) as TextMetrics);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    const long = "x".repeat(200);
    await drawActivityShareCard({
      title: long, athlete: long, sport: long, date: long,
      distance: long, duration: long, elevation: long,
      distanceLabel: long, durationLabel: long, elevationLabel: long,
      footer: long, includeRouteImage: false,
    });
    const drawn = vi.mocked(ctx.fillText).mock.calls.map(([text]) => String(text));
    expect(drawn.filter((text) => text.includes("…")).length).toBeGreaterThanOrEqual(9);
    expect(drawn.every((text) => text === "O·RIDER" || text.includes("orider.co.kr") || text.length < long.length)).toBe(true);
  });

  it("uses the established Safari-safe file saver", () => {
    const blob = new Blob(["png"], { type: "image/png" });
    downloadShareCard(blob, "ride.png");
    expect(saveAs).toHaveBeenCalledWith(blob, "ride.png");
  });

  it("stops waiting for a route image after the timeout", async () => {
    vi.useFakeTimers();
    const ctx = context();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    class PendingImage { crossOrigin = ""; onload: (() => void) | null = null; onerror: (() => void) | null = null; src = ""; }
    vi.stubGlobal("Image", PendingImage);
    const drawing = drawActivityShareCard({ ...cardInput(), includeRouteImage: true, backgroundImageUrl: "https://example.com/map.png" });
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(drawing).resolves.toBeInstanceOf(HTMLCanvasElement);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it("settles route image loading when generation is aborted", async () => {
    const ctx = context();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    class PendingImage { crossOrigin = ""; onload: (() => void) | null = null; onerror: (() => void) | null = null; src = ""; }
    vi.stubGlobal("Image", PendingImage);
    const controller = new AbortController();
    const drawing = drawActivityShareCard({ ...cardInput(), includeRouteImage: true, backgroundImageUrl: "https://example.com/map.png" }, controller.signal);
    controller.abort();
    await expect(drawing).resolves.toBeInstanceOf(HTMLCanvasElement);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});

function cardInput() {
  return {
    title: "Ride", athlete: "Rider", sport: "Ride", date: "Today",
    distance: "10 km", duration: "30:00", elevation: "100 m",
    distanceLabel: "Distance", durationLabel: "Time", elevationLabel: "Elevation",
    performanceLabel: "Ride performance",
    footer: "O-Rider", includeRouteImage: false,
  };
}
