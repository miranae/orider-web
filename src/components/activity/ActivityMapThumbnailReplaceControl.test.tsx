import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { mockCallableInvocations, setCallableImplementation } from "../../__tests__/mocks/firebase";
import ActivityMapThumbnailReplaceControl from "./ActivityMapThumbnailReplaceControl";

const m = vi.hoisted(() => ({ autoLoad: true }));
vi.mock("../RouteMap", async () => {
  const { useEffect } = await import("react");
  return {
    default: function RouteMapMock({ onLoad }: { onLoad?: () => void }) {
      // 실제 지도처럼 화면에 붙은 뒤 로드를 알린다.
      useEffect(() => { if (m.autoLoad) onLoad?.(); }, [onLoad]);
      return <canvas data-testid="capture-canvas" />;
    },
  };
});
vi.mock("./ActivityRouteThumbnail", async importOriginal => ({
  ...(await importOriginal<typeof import("./ActivityRouteThumbnail")>()),
  copyCanonicalMapThumbnailCanvas: (canvas: HTMLCanvasElement) => canvas,
  createCanonicalMapThumbnailBlob: async () => new Blob(["webp"], { type: "image/webp" }),
  blobToBase64: async () => "AAAA",
}));

const replaces = () => mockCallableInvocations.filter(({ name }) => name === "replaceActivityMapThumbnail");
const renderControl = (props: Partial<Parameters<typeof ActivityMapThumbnailReplaceControl>[0]> = {}) =>
  renderWithProviders(<ActivityMapThumbnailReplaceControl activityId="a" polyline="route" contentRevision={3} contentSelectedRevision={2} {...props} />,
    { authenticated: true, user: { uid: "owner" } });

beforeEach(() => { m.autoLoad = true; });

it("captures a new image on the owner's screen and replaces the thumbnail in one call", async () => {
  setCallableImplementation("replaceActivityMapThumbnail", () => ({ data: { mapImageUrl: "https://example.test/new.webp" } }));
  renderControl();
  const before = replaces().length;
  expect(screen.queryByTestId("map-thumbnail-replace-capture")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "지도 썸네일 다시 만들기" }));
  await waitFor(() => expect(replaces()).toHaveLength(before + 1));
  expect(replaces().at(-1)?.data).toEqual({ activityId: "a", imageBase64: "AAAA", expectedHeadRevision: 3 });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("새 썸네일로 바꿨습니다"));
  expect(screen.getByRole("img", { name: "새로 만든 지도 썸네일" })).toHaveAttribute("src", "https://example.test/new.webp");
  expect(screen.queryByTestId("map-thumbnail-replace-capture")).not.toBeInTheDocument();
});

it("omits the head revision for a legacy activity", async () => {
  setCallableImplementation("replaceActivityMapThumbnail", () => ({ data: { mapImageUrl: "https://example.test/new.webp" } }));
  renderControl({ contentRevision: undefined, contentSelectedRevision: undefined });
  fireEvent.click(screen.getByRole("button", { name: "지도 썸네일 다시 만들기" }));
  await waitFor(() => expect(replaces().at(-1)?.data).toEqual({ activityId: "a", imageBase64: "AAAA" }));
});

it("reports a failure and lets the owner try again", async () => {
  setCallableImplementation("replaceActivityMapThumbnail", () => { throw Object.assign(new Error("denied"), { code: "functions/permission-denied" }); });
  renderControl();
  fireEvent.click(screen.getByRole("button", { name: "지도 썸네일 다시 만들기" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("다시 만들지 못했습니다"));
  expect(screen.getByRole("button", { name: "지도 썸네일 다시 만들기" })).toBeEnabled();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("gives up when the capture map never loads", async () => {
  vi.useFakeTimers();
  try {
    m.autoLoad = false;
    const before = replaces().length;
    renderControl();
    fireEvent.click(screen.getByRole("button", { name: "지도 썸네일 다시 만들기" }));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(screen.getByRole("status")).toHaveTextContent("다시 만들지 못했습니다");
    expect(replaces()).toHaveLength(before);
  } finally { vi.useRealTimers(); }
});
