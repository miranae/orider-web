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
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    filter: "none",
    font: "",
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    measureText: vi.fn(() => ({ width: 100 })),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRectStyles: [] as string[],
    fillTextStyles: [] as string[],
    drawImageFilters: [] as string[],
  };
  ctx.fillRect.mockImplementation(() => ctx.fillRectStyles.push(ctx.fillStyle));
  ctx.fillText.mockImplementation(() => ctx.fillTextStyles.push(ctx.fillStyle));
  ctx.drawImage.mockImplementation(() => ctx.drawImageFilters.push(ctx.filter));
  return ctx as unknown as CanvasRenderingContext2D & { fillRectStyles: string[]; fillTextStyles: string[]; drawImageFilters: string[] };
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
    const lineCalls = vi.mocked(ctx.lineTo).mock.calls;
    const coordinates = lineCalls.flat();
    const chartLineCalls = lineCalls.slice(4);
    expect(ctx.fill).toHaveBeenCalledOnce();
    expect(coordinates.every(Number.isFinite)).toBe(true);
    expect(chartLineCalls.some(([x]) => x === 332)).toBe(true);
    expect(chartLineCalls.every(([x, y]) => Number(x) >= 32 && Number(x) <= 332 && Number(y) >= 490 && Number(y) <= 542)).toBe(true);
    expect(ctx.stroke).toHaveBeenCalledTimes(3);
    expect(ctx.strokeStyle).toBe("#4FD5D1");
    expect(ctx.lineWidth).toBe(2.5);
    expect(ctx.fillText).toHaveBeenCalledWith("Elevation profile · Elevation 100 m", 332, 480);
    const overlayCall = vi.mocked(ctx.fillRect).mock.calls.findIndex(([x, y, width, height]) =>
      x === 24 && y === 464 && width === 316 && height === 92,
    );
    expect(overlayCall).toBeGreaterThanOrEqual(0);
    expect(ctx.fillRectStyles[overlayCall]).toBe("rgba(0,0,0,.10)");
    expect(ctx.fillRect).toHaveBeenCalledWith(32, 548, 300, 1);
  });

  it("handles a flat elevation profile without invalid coordinates", async () => {
    const ctx = context();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    await drawActivityShareCard({ ...cardInput(), elevationProfile: [{ distance: 0, elevation: 120 }, { distance: 1_000, elevation: 120 }] });
    expect(vi.mocked(ctx.lineTo).mock.calls.flat().every(Number.isFinite)).toBe(true);
    expect(vi.mocked(ctx.lineTo).mock.calls.some(([, y]) => y === 516)).toBe(true);
  });

  it("renders compact activity weather on the map", async () => {
    const ctx = context();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    await drawActivityShareCard({
      ...cardInput(),
      weather: { temperature: 25, feelsLike: 29.8, humidity: 89, windSpeed: 1.5, windDirection: 90, weatherCode: 1 },
    });
    const labels = vi.mocked(ctx.fillText).mock.calls.map(([text]) => String(text));
    expect(labels).toContain("☀︎ 25°C  ·  ≈ 30°C");
    expect(labels).toContain("RH 89%  ·  E 1.5 m/s");
  });

  it("places the Orider lockup at the top left", async () => {
    const ctx = context();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    await drawActivityShareCard(cardInput());
    expect(ctx.fillText).toHaveBeenCalledWith("O·RIDER", 44, 28);
    expect(ctx.fillRect).toHaveBeenCalledWith(24, 15, 14, 14);
    const markCall = vi.mocked(ctx.fillRect).mock.calls.findIndex(([x, y, width, height]) =>
      x === 24 && y === 15 && width === 14 && height === 14,
    );
    expect(ctx.fillRectStyles[markCall]).toBe("#008986");
    const activityLineCall = vi.mocked(ctx.fillText).mock.calls.findIndex(([text]) => text === "Ride · Today");
    expect(ctx.fillTextStyles[activityLineCall]).toBe("#FFFFFF");
  });

  it("restores saturation for the Korean static map only", async () => {
    const ctx = context();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    class LoadedImage {
      crossOrigin = ""; naturalWidth = 1080; naturalHeight = 600;
      onload: (() => void) | null = null; onerror: (() => void) | null = null; private value = "";
      set src(value: string) { this.value = value; if (value) queueMicrotask(() => this.onload?.()); }
      get src() { return this.value; }
    }
    vi.stubGlobal("Image", LoadedImage);

    await drawActivityShareCard({
      ...cardInput(), includeRouteImage: true,
      routeImageUrl: "https://api.mapbox.com/styles/v1/orider/cmp9okm6p006c01snfd3dexqb/static/map.png",
    });
    expect(ctx.drawImageFilters).toEqual(["saturate(2) brightness(.91) hue-rotate(-12deg) contrast(1.08)"]);
    expect(ctx.filter).toBe("none");
  });

  it("draws the route map once without a map-wide shade overlay", async () => {
    const ctx = context();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    class LoadedImage {
      crossOrigin = ""; naturalWidth = 1080; naturalHeight = 600;
      onload: (() => void) | null = null; onerror: (() => void) | null = null; private value = "";
      set src(value: string) { this.value = value; if (value) queueMicrotask(() => this.onload?.()); }
      get src() { return this.value; }
    }
    vi.stubGlobal("Image", LoadedImage);
    const canvas = await drawActivityShareCard({ ...cardInput(), includeRouteImage: true, routeImageUrl: "https://example.com/map.png" });
    expect(canvas.height).toBe(600);
    expect(ctx.drawImage).toHaveBeenCalledOnce();
    expect(ctx.drawImageFilters).toEqual(["none"]);
    expect(ctx.filter).toBe("none");
    expect(ctx.createLinearGradient).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalledWith("© Mapbox · © OpenStreetMap", 1056, 558);
  });

  it("adds map attribution when the non-static fallback image is used", async () => {
    const ctx = context();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    class FallbackImage {
      crossOrigin = ""; naturalWidth = 1080; naturalHeight = 600;
      onload: (() => void) | null = null; onerror: (() => void) | null = null; private value = "";
      set src(value: string) {
        this.value = value;
        if (value) queueMicrotask(() => value.includes("static") ? this.onerror?.() : this.onload?.());
      }
      get src() { return this.value; }
    }
    vi.stubGlobal("Image", FallbackImage);
    await drawActivityShareCard({
      ...cardInput(), includeRouteImage: true,
      routeImageUrl: "https://example.com/static-map.png",
      backgroundImageUrl: "https://example.com/canvas-map.png",
    });
    expect(ctx.drawImage).toHaveBeenCalledOnce();
    expect(ctx.fillText).toHaveBeenCalledWith("© Mapbox · © OpenStreetMap", 1056, 558);
  });

  it("keeps activity text inside the right rail and groups profile text with its chart", async () => {
    const ctx = context();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    await drawActivityShareCard({
      ...cardInput(),
      elevationProfile: [{ distance: 0, elevation: 115 }, { distance: 1_000, elevation: 229 }],
      performanceMetrics: Array.from({ length: 6 }, (_, index) => ({ label: `Metric ${index}`, value: String(index) })),
    });
    const localProfileText = "Elevation profile · Elevation 100 m";
    expect(vi.mocked(ctx.fillText).mock.calls.every(([text, x]) =>
      text === "O·RIDER" ? x === 44 : text === localProfileText ? x === 332 : Number(x) >= 756,
    )).toBe(true);
    const labels = vi.mocked(ctx.fillText).mock.calls.map(([text]) => String(text));
    expect(labels.filter((text) => text === "100 m")).toHaveLength(0);
    expect(labels.filter((text) => text === "Elevation")).toHaveLength(0);
    expect(labels.filter((text) => text === localProfileText)).toHaveLength(1);
    expect(ctx.textAlign).toBe("right");
  });

  it("does not render an empty elevation section or duplicate the footer", async () => {
    const ctx = context();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    await drawActivityShareCard({ ...cardInput(), elevationProfile: [] });
    const labels = vi.mocked(ctx.fillText).mock.calls.map(([text]) => text);
    expect(labels).not.toContain("Elevation profile");
    expect(labels.filter((text) => text === "O-Rider")).toHaveLength(1);
    expect(ctx.fillRect).not.toHaveBeenCalledWith(24, 464, 316, 92);
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
