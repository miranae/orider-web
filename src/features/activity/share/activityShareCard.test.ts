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
    closePath: vi.fn(),
    fill: vi.fn(),
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
      elevationProfileLabel: "Elevation profile",
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
      elevationProfileLabel: long, performanceLabel: long, footer: long, includeRouteImage: false,
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

  it("draws a finite filled elevation profile and preserves its final point", async () => {
    const ctx = context();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    const elevationProfile = Array.from({ length: 500 }, (_, index) => ({ distance: index * 10, elevation: 100 + Math.sin(index / 10) * 30 }));
    elevationProfile.splice(120, 0, { distance: Number.NaN, elevation: 999 });
    await drawActivityShareCard({ ...cardInput(), elevationProfile });
    const coordinates = vi.mocked(ctx.lineTo).mock.calls.flat();
    expect(ctx.fill).toHaveBeenCalledOnce();
    expect(coordinates.every(Number.isFinite)).toBe(true);
    expect(vi.mocked(ctx.lineTo).mock.calls.some(([x]) => x === 1024)).toBe(true);
  });

  it("handles a flat elevation profile without invalid coordinates", async () => {
    const ctx = context();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    await drawActivityShareCard({ ...cardInput(), elevationProfile: [{ distance: 0, elevation: 120 }, { distance: 1_000, elevation: 120 }] });
    expect(vi.mocked(ctx.lineTo).mock.calls.flat().every(Number.isFinite)).toBe(true);
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
    elevationProfileLabel: "Elevation profile",
    performanceLabel: "Ride performance",
    footer: "O-Rider", includeRouteImage: false,
  };
}
