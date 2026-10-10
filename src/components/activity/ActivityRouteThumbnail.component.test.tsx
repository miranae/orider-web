import { act, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import {
  mockCallableInvocations,
  setCallableImplementation,
} from "../../__tests__/mocks/firebase";
import ActivityRouteThumbnail from "./ActivityRouteThumbnail";

const routeMapControl = vi.hoisted(() => ({
  delayNextCapture: false,
  delayedOnLoad: null as (() => void) | null,
}));

vi.mock("../RouteMap", async () => {
  const React = await import("react");
  return {
    default: function RouteMapMock({
      onLoad,
      preserveDrawingBuffer,
    }: {
      onLoad?: () => void;
      preserveDrawingBuffer?: boolean;
    }) {
      React.useEffect(() => {
        if (!preserveDrawingBuffer) return;
        if (routeMapControl.delayNextCapture) {
          routeMapControl.delayNextCapture = false;
          routeMapControl.delayedOnLoad = onLoad ?? null;
          return;
        }
        onLoad?.();
      }, [onLoad, preserveDrawingBuffer]);
      return preserveDrawingBuffer
        ? <canvas data-testid="capture-map" width={2560} height={914} />
        : <div data-testid="route-map" />;
    },
  };
});

const baseProps = {
  activityId: "activity-123",
  userId: "owner-456",
  polyline: "37.5665,126.9780;37.5670,126.9790",
  mapImageUrl: null,
  visibility: "everyone" as const,
};

function thumbnailInvocations() {
  return mockCallableInvocations.filter(({ name }) => name.includes("ActivityMapThumbnailUpload"));
}

function installSuccessfulCoordinator() {
  setCallableImplementation("prepareActivityMapThumbnailUpload", (data) => {
    const request = data as { expectedFileName: string; expectedHeadRevision?: number };
    return {
      data: {
        expectedFileName: request.expectedFileName,
        ...(request.expectedHeadRevision != null
          ? { expectedHeadRevision: request.expectedHeadRevision }
          : {}),
      },
    };
  });
  setCallableImplementation("finalizeActivityMapThumbnailUpload", () => ({
    data: { mapImageUrl: "https://example.test/canonical.webp" },
  }));
}

describe("ActivityRouteThumbnail revision capture contract", () => {
  beforeEach(() => {
    routeMapControl.delayNextCapture = false;
    routeMapControl.delayedOnLoad = null;
  });

  it("shows a neutral skeleton for the priority card while the map is deferred", () => {
    const { container } = renderWithProviders(
      <ActivityRouteThumbnail {...baseProps} priority layout="mobile" />,
      { authenticated: false },
    );
    expect(container.querySelector("[data-map-thumbnail-skeleton]")).toBeInTheDocument();
    expect(container.querySelector("svg path")).not.toBeInTheDocument();
  });

  it("displays cached canonical images immediately on mount and remount without a load event", async () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    const width = vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(2560);
    const fileName = "activity-123.r1.route-v2-fcfef7dfc9b21144.webp";
    const mapImageUrl = `https://firebasestorage.googleapis.com/v0/b/test/o/${encodeURIComponent(`map_thumbnails/${baseProps.userId}/${fileName}`)}?alt=media`;
    try {
      for (let mount = 0; mount < 2; mount++) {
        const { container, unmount, queryByTestId } = renderWithProviders(
          <ActivityRouteThumbnail {...baseProps} mapImageUrl={mapImageUrl} contentRevision={3} contentSelectedRevision={1} priority />,
          { authenticated: false },
        );
        await waitFor(() => expect(container.querySelector("img")).toHaveStyle({ opacity: "1" }));
        expect(container.querySelector("[data-map-thumbnail-skeleton]")).not.toBeInTheDocument();
        expect(queryByTestId("route-map")).not.toBeInTheDocument();
        unmount();
      }
    } finally {
      complete.mockRestore();
      width.mockRestore();
    }
  });

  it("does not transfer image readiness or stale events to a replacement URL", async () => {
    const fileName = "activity-123.r1.route-v2-fcfef7dfc9b21144.webp";
    const firstUrl = `https://firebasestorage.googleapis.com/v0/b/test/o/${encodeURIComponent(`map_thumbnails/${baseProps.userId}/${fileName}`)}?alt=media&token=first`;
    const nextUrl = firstUrl.replace("token=first", "token=next");
    const { container, rerender } = renderWithProviders(
      <ActivityRouteThumbnail {...baseProps} mapImageUrl={firstUrl} contentRevision={3} contentSelectedRevision={1} priority />,
      { authenticated: false },
    );
    const firstImage = await waitFor(() => {
      const image = container.querySelector<HTMLImageElement>("img");
      expect(image).toHaveAttribute("src", firstUrl);
      return image!;
    });
    fireEvent.load(firstImage);
    expect(firstImage).toHaveStyle({ opacity: "1" });
    rerender(<ActivityRouteThumbnail {...baseProps} mapImageUrl={nextUrl} contentRevision={3} contentSelectedRevision={1} priority />);
    const nextImage = await waitFor(() => {
      const image = container.querySelector<HTMLImageElement>("img");
      expect(image).toHaveAttribute("src", nextUrl);
      return image!;
    });
    expect(nextImage).not.toBe(firstImage);
    fireEvent.load(firstImage);
    fireEvent.error(firstImage);
    expect(nextImage).toHaveStyle({ opacity: "0" });
    expect(container.querySelector("[data-map-thumbnail-skeleton]")).toBeInTheDocument();
    fireEvent.load(nextImage);
    expect(nextImage).toHaveStyle({ opacity: "1" });
  });

  it("shows the live route when a canonical image fails to load", async () => {
    const fileName = "activity-123.r1.route-v2-fcfef7dfc9b21144.webp";
    const mapImageUrl = `https://firebasestorage.googleapis.com/v0/b/test/o/${encodeURIComponent(`map_thumbnails/${baseProps.userId}/${fileName}`)}?alt=media`;
    const { container, queryByTestId } = renderWithProviders(
      <ActivityRouteThumbnail {...baseProps} mapImageUrl={mapImageUrl} contentRevision={3} contentSelectedRevision={1} priority />,
      { authenticated: false },
    );

    const image = await waitFor(() => {
      const element = container.querySelector<HTMLImageElement>(`img[src="${mapImageUrl}"]`);
      expect(element).toBeInTheDocument();
      return element!;
    });
    fireEvent.error(image);

    await waitFor(() => expect(queryByTestId("route-map")).toBeInTheDocument());
    expect(container.querySelector(`img[src="${mapImageUrl}"]`)).not.toBeInTheDocument();
    expect(thumbnailInvocations()).toEqual([]);
  });

  it("shows the live route after a stalled image request and accepts a late image load", async () => {
    const fileName = "activity-123.r1.route-v2-fcfef7dfc9b21144.webp";
    const mapImageUrl = `https://firebasestorage.googleapis.com/v0/b/test/o/${encodeURIComponent(`map_thumbnails/${baseProps.userId}/${fileName}`)}?alt=media`;
    vi.useFakeTimers();
    const { container, queryByTestId } = renderWithProviders(
      <ActivityRouteThumbnail {...baseProps} mapImageUrl={mapImageUrl} contentRevision={3} contentSelectedRevision={1} priority />,
      { authenticated: false },
    );
    try {
      await act(async () => { await Promise.resolve(); });
      const image = container.querySelector<HTMLImageElement>(`img[src="${mapImageUrl}"]`);
      expect(image).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(7_999); });
      expect(queryByTestId("route-map")).not.toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(1); });
      await act(async () => { await Promise.resolve(); });
      expect(queryByTestId("route-map")).toBeInTheDocument();
      expect(image).toBeInTheDocument();
      fireEvent.load(image!);
      expect(queryByTestId("route-map")).not.toBeInTheDocument();
      expect(image).toHaveStyle({ opacity: "1" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the revision filename and sends one head revision to prepare and finalize for the owner", async () => {
    installSuccessfulCoordinator();

    renderWithProviders(
      <ActivityRouteThumbnail
        {...baseProps}
        contentRevision={3}
        contentSelectedRevision={1}
      />,
      { authenticated: true, user: { uid: baseProps.userId } },
    );

    await waitFor(() => expect(thumbnailInvocations()).toHaveLength(2));
    const [prepare, finalize] = thumbnailInvocations();
    const expectedFileName = "activity-123.r1.route-v2-fcfef7dfc9b21144.webp";
    expect(prepare).toEqual({
      name: "prepareActivityMapThumbnailUpload",
      data: {
        activityId: baseProps.activityId,
        expectedFileName,
        expectedHeadRevision: 3,
      },
    });
    expect(finalize).toEqual({
      name: "finalizeActivityMapThumbnailUpload",
      data: {
        activityId: baseProps.activityId,
        expectedFileName,
        imageBase64: "",
        expectedHeadRevision: 3,
      },
    });
  });

  it.each([
    { label: "signed-out viewer", authenticated: false, uid: undefined },
    { label: "authenticated non-owner", authenticated: true, uid: "viewer-789" },
  ])("does not call the managed coordinator for a $label", async ({ authenticated, uid }) => {
    installSuccessfulCoordinator();

    const { queryByTestId } = renderWithProviders(
      <ActivityRouteThumbnail
        {...baseProps}
        contentRevision={3}
        contentSelectedRevision={1}
      />,
      { authenticated, user: uid ? { uid } : undefined },
    );

    await waitFor(() => expect(queryByTestId("route-map")).toBeInTheDocument());
    expect(queryByTestId("capture-map")).not.toBeInTheDocument();
    expect(thumbnailInvocations()).toEqual([]);
  });

  it.each([
    { contentRevision: 3, contentSelectedRevision: undefined },
    { contentRevision: undefined, contentSelectedRevision: 1 },
    { contentRevision: 0, contentSelectedRevision: 1 },
  ])("does not capture a partial or malformed revision pair: %o", async (revisionProps) => {
    installSuccessfulCoordinator();

    const { queryByTestId } = renderWithProviders(
      <ActivityRouteThumbnail {...baseProps} {...revisionProps} />,
      { authenticated: true, user: { uid: baseProps.userId } },
    );

    await waitFor(() => expect(queryByTestId("route-map")).toBeInTheDocument());
    expect(queryByTestId("capture-map")).not.toBeInTheDocument();
    expect(thumbnailInvocations()).toEqual([]);
  });

  it("preserves the legacy filename and payload", async () => {
    installSuccessfulCoordinator();

    renderWithProviders(
      <ActivityRouteThumbnail {...baseProps} />,
      { authenticated: false },
    );

    await waitFor(() => expect(thumbnailInvocations()).toHaveLength(2));
    const expectedFileName = "activity-123.route-v2-fcfef7dfc9b21144.webp";
    expect(thumbnailInvocations()[0]?.data).toEqual({
      activityId: baseProps.activityId,
      expectedFileName,
    });
    expect(thumbnailInvocations()[1]?.data).toEqual({
      activityId: baseProps.activityId,
      expectedFileName,
      imageBase64: "",
    });
  });

  it("does not let a stale settlement release a newer head-only retry before its map loads", async () => {
    let releaseHeadThree: (() => void) | undefined;
    const headThreePending = new Promise<void>((resolve) => {
      releaseHeadThree = resolve;
    });
    setCallableImplementation("prepareActivityMapThumbnailUpload", async (data) => {
      const request = data as { expectedFileName: string; expectedHeadRevision: number };
      if (request.expectedHeadRevision === 3) await headThreePending;
      return {
        data: {
          expectedFileName: request.expectedFileName,
          expectedHeadRevision: request.expectedHeadRevision,
        },
      };
    });
    setCallableImplementation("finalizeActivityMapThumbnailUpload", () => ({
      data: { mapImageUrl: "https://example.test/canonical.webp" },
    }));

    const { rerender } = renderWithProviders(
      <ActivityRouteThumbnail
        {...baseProps}
        contentRevision={3}
        contentSelectedRevision={1}
      />,
      { authenticated: true, user: { uid: baseProps.userId } },
    );
    await waitFor(() => expect(thumbnailInvocations()).toHaveLength(1));

    routeMapControl.delayNextCapture = true;
    rerender(
      <ActivityRouteThumbnail
        {...baseProps}
        contentRevision={4}
        contentSelectedRevision={1}
      />,
    );
    await waitFor(() => {
      expect(routeMapControl.delayedOnLoad).not.toBeNull();
    });
    expect(thumbnailInvocations()).toHaveLength(1);

    releaseHeadThree?.();
    await act(async () => {
      await Promise.resolve();
    });
    expect(routeMapControl.delayedOnLoad).not.toBeNull();

    await act(async () => {
      routeMapControl.delayedOnLoad?.();
    });
    await waitFor(() => {
      const finalizeHeads = thumbnailInvocations()
        .filter(({ name }) => name === "finalizeActivityMapThumbnailUpload")
        .map(({ data }) => (data as { expectedHeadRevision?: number }).expectedHeadRevision);
      expect(finalizeHeads).toEqual([4]);
    });
  });
});
