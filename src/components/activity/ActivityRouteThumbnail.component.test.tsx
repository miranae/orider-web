import { act, waitFor } from "@testing-library/react";
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
