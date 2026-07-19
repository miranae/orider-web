import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActivityShareMapCapture, type ActivityShareMapCaptureHandle } from "./ActivityShareMapCapture";

const routeMapProps = vi.hoisted(() => ({ latest: null as Record<string, unknown> | null }));

vi.mock("../../../components/RouteMap", () => ({
  default: (props: Record<string, unknown>) => {
    routeMapProps.latest = props;
    return <canvas data-testid="capture-map" width="2160" height="1200" onClick={() => (props.onLoad as () => void)()} />;
  },
}));

describe("ActivityShareMapCapture", () => {
  it("copies the 2x RouteMap canvas after its idle callback", async () => {
    const ref = createRef<ActivityShareMapCaptureHandle>();
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);

    render(<ActivityShareMapCapture ref={ref} enabled track="37.5,127;37.6,127.1" />);
    await screen.findByTestId("capture-map");
    expect(routeMapProps.latest).toMatchObject({
      preserveDrawingBuffer: true,
      pixelRatio: 2,
      fitPadding: 64,
      showRouteEndpoints: true,
    });

    fireEvent.click(screen.getByTestId("capture-map"));
    const copy = await ref.current?.capture();
    expect(copy).toBeInstanceOf(HTMLCanvasElement);
    expect(copy).toMatchObject({ width: 2160, height: 1200 });
    expect(drawImage).toHaveBeenCalledWith(screen.getByTestId("capture-map"), 0, 0);
  });

  it("does not mount or capture a route when privacy filtering disables it", async () => {
    const ref = createRef<ActivityShareMapCaptureHandle>();
    render(<ActivityShareMapCapture ref={ref} enabled={false} track="37.5,127;37.6,127.1" />);
    expect(screen.queryByTestId("capture-map")).not.toBeInTheDocument();
    await expect(ref.current?.capture()).resolves.toBeNull();
  });

  it("settles a pending capture when it is aborted", async () => {
    const ref = createRef<ActivityShareMapCaptureHandle>();
    render(<ActivityShareMapCapture ref={ref} enabled track="37.5,127;37.6,127.1" />);
    await screen.findByTestId("capture-map");
    const controller = new AbortController();
    const capture = ref.current!.capture(controller.signal);
    controller.abort();
    await expect(capture).resolves.toBeNull();
  });

  it("waits for the remounted map when the track changes", async () => {
    const ref = createRef<ActivityShareMapCaptureHandle>();
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    const { rerender } = render(<ActivityShareMapCapture ref={ref} enabled track="old-track" />);
    await screen.findByTestId("capture-map");
    const oldLoad = routeMapProps.latest!.onLoad as () => void;

    rerender(<ActivityShareMapCapture ref={ref} enabled track="new-track" />);
    await screen.findByTestId("capture-map");
    const newLoad = routeMapProps.latest!.onLoad as () => void;
    const capture = ref.current!.capture();
    let settled = false;
    void capture.then(() => { settled = true; });

    oldLoad();
    await Promise.resolve();
    expect(settled).toBe(false);
    newLoad();
    await expect(capture).resolves.toBeInstanceOf(HTMLCanvasElement);
  });

  it("returns null when copying the WebGL canvas fails", async () => {
    const ref = createRef<ActivityShareMapCaptureHandle>();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: () => { throw new DOMException("The canvas is tainted"); },
    } as unknown as CanvasRenderingContext2D);
    render(<ActivityShareMapCapture ref={ref} enabled track="route" />);
    fireEvent.click(await screen.findByTestId("capture-map"));
    await expect(ref.current!.capture()).resolves.toBeNull();
  });
});
