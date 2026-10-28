import i18n from "i18next";
import type { TFunction } from "i18next";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import enActivity from "../../../i18n/resources/en/activity.json";
import { createMockActivity } from "../../../__tests__/fixtures/mockData";
import type { Activity, ActivityStreams } from "@shared/types";
import { ActivityMediaPanel } from "./ActivityMediaPanel";
import { getSportCategory } from "./activityDetailUtils";

const mapProps = vi.hoisted(() => vi.fn());
vi.mock("../../../components/RouteMap", () => ({ default: (props: unknown) => { mapProps(props); return <div data-testid="route-map" />; } }));

function renderNoMap(overrides: Partial<Activity>, lng: "ko" | "en" = "ko", streams: ActivityStreams | null = null) {
  const activity = createMockActivity(overrides);
  const t = i18n.getFixedT(lng, "activity") as TFunction<"activity">;
  render(
    <ActivityMediaPanel
      activity={activity}
      streams={streams}
      sport={getSportCategory(activity.type)}
      hasTrack={false}
      summary={activity.summary}
      markerPosition={null}
      hoveredSegment={null}
      photos={[]}
      uploadedPhotos={[]}
      flyToPosition={null}
      t={t}
    />,
  );
}

describe("ActivityMediaPanel no-map state", () => {
  beforeAll(() => {
    i18n.addResourceBundle("en", "activity", enActivity, true, true);
  });

  it("keeps an unrequested route distinct from missing GPS, retries explicitly, and displays independent geometry", async () => {
    const user = userEvent.setup(), onLoad = vi.fn();
    const activity = createMockActivity({ source: "orider", thumbnailTrack: "" });
    const props = { activity, streams: null, sport: "ride" as const, hasTrack: false, summary: activity.summary,
      markerPosition: null, hoveredSegment: null, photos: [], uploadedPhotos: [], flyToPosition: null,
      t: i18n.getFixedT("en", "activity") as TFunction<"activity"> };
    const view = render(<ActivityMediaPanel {...props} routeLookup={{ state: "idle", onLoad }} />);
    expect(onLoad).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Check route" }));
    expect(onLoad).toHaveBeenCalledOnce();
    view.rerender(<ActivityMediaPanel {...props} routeLookup={{ state: "loading", onLoad }} />);
    expect(screen.getByRole("button")).toBeDisabled();
    view.rerender(<ActivityMediaPanel {...props} routeLookup={{ state: "error", onLoad }} />);
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(onLoad).toHaveBeenCalledTimes(2);
    const streams = { activityRouteGeometryV1: { version: 1, timingBasis: "elapsed", timeOrigin: "activity_start",
      originEpochMs: activity.startTime, routeInputRevision: "a".repeat(64), time: [0, 10], latlng: [[37, 127], [37.1, 127.1]] } } as ActivityStreams;
    view.rerender(<ActivityMediaPanel {...props} hasTrack streams={streams} />);
    expect(screen.getByTestId("route-map")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Check route" })).not.toBeInTheDocument();
  });

  it("does not offer route lookup for an indoor activity", () => {
    const activity = createMockActivity({ type: "VirtualRide", trainer: true });
    render(<ActivityMediaPanel activity={activity} streams={null} sport="ride" hasTrack={false} summary={activity.summary}
      markerPosition={null} hoveredSegment={null} photos={[]} uploadedPhotos={[]} flyToPosition={null}
      routeLookup={{ state: "idle", onLoad: vi.fn() }} t={i18n.getFixedT("en", "activity") as TFunction<"activity">} />);
    expect(screen.queryByRole("button", { name: "Check route" })).not.toBeInTheDocument();
  });

  it("shows an existing map image even when no route geometry is stored", () => {
    const activity = createMockActivity({ thumbnailTrack: "", mapImageUrl: "https://example.test/route.png" });
    render(<ActivityMediaPanel activity={activity} streams={null} sport="ride" hasTrack={false} summary={activity.summary}
      markerPosition={null} hoveredSegment={null} photos={[]} uploadedPhotos={[]} flyToPosition={null}
      t={i18n.getFixedT("en", "activity") as TFunction<"activity">} />);
    expect(screen.getByTestId("route-map")).toBeVisible();
    expect(mapProps.mock.lastCall?.[0]).toMatchObject({ fallbackImageUrl: activity.mapImageUrl });
  });

  it.each(["ko", "en"] as const)("toggles map size in %s without remounting or dropping location props", async lng => {
    const user = userEvent.setup();
    const activity = createMockActivity();
    const selected = { startIndex: 1, endIndex: 2 };
    const marker: [number, number] = [37, 127];
    const labels = lng === "ko" ? ["지도 크게 보기", "지도 기본 크기로 보기"] : ["Expand map", "Restore default map size"];
    render(<ActivityMediaPanel activity={activity} streams={null} sport="ride" hasTrack summary={activity.summary}
      markerPosition={marker} hoveredSegment={null} selectedSegmentRange={selected} photos={[]} uploadedPhotos={[]}
      flyToPosition={marker} t={i18n.getFixedT(lng, "activity") as TFunction<"activity">} />);
    const map = screen.getByTestId("route-map");
    const buttons = screen.getAllByRole("button", { name: labels[0] });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveClass("ds-map-resize--top-left");
    expect(buttons[1]).toHaveClass("ds-map-resize--bottom-right");
    buttons.forEach(button => {
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(button).toHaveAttribute("title", labels[0]);
      expect(document.getElementById(button.getAttribute("aria-controls")!)).toContainElement(map);
    });
    buttons[0]!.focus();
    await user.keyboard("{Enter}");
    expect(screen.getAllByRole("button", { name: labels[1] })).toEqual(buttons);
    buttons.forEach(button => {
      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(button).toHaveAttribute("title", labels[1]);
    });
    expect(buttons[0]).toHaveFocus();
    expect(screen.getByTestId("route-map")).toBe(map);
    expect(mapProps.mock.lastCall?.[0]).toMatchObject({ markerPosition: marker, flyToRange: selected, showRouteEndpoints: true, routeLineWidth: 3 });
    buttons[1]!.focus();
    await user.keyboard("[Space]");
    expect(buttons[1]).toHaveFocus();
    buttons.forEach(button => {
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(button).toHaveAccessibleName(labels[0]);
    });
    expect(screen.getByTestId("route-map")).toBe(map);
  });

  it("draws independent native geometry without binding sensor indices or hover positions", () => {
    const activity = createMockActivity();
    const route: [number, number][] = [[37, 127], [37.1, 127.1]];
    const streams = { time: [0, 1, 2], watts: [100, 200, 300], activityRouteGeometryV1: {
      version: 1, timingBasis: "elapsed", timeOrigin: "relative_to_first_gps_observation", originEpochMs: null,
      routeInputRevision: "a".repeat(64), time: [0, 600], latlng: route,
    } } as ActivityStreams;
    render(<ActivityMediaPanel activity={activity} streams={streams} sport="ride" hasTrack summary={activity.summary}
      markerPosition={[37, 127]} hoveredSegment={null} selectedRunRange={{ startIndex: 0, endIndex: 1 }}
      selectedSegmentRange={{ startIndex: 1, endIndex: 2 }} photos={[]} uploadedPhotos={[]}
      flyToPosition={[37, 127]} t={i18n.getFixedT("en", "activity") as TFunction<"activity">} />);
    expect(mapProps.mock.lastCall?.[0]).toMatchObject({ latlng: route, markerPosition: null,
      highlightRange: undefined, flyToRange: undefined, flyToPosition: undefined });
  });

  it("does not offer a map size control when there is no GPS track", () => {
    renderNoMap({ type: "Run" });
    expect(screen.queryByRole("button", { name: "지도 크게 보기" })).not.toBeInTheDocument();
  });

  it("labels a treadmill run as an indoor run, never a virtual ride", () => {
    renderNoMap({ type: "Run", trainer: true });
    expect(screen.getByText("실내 러닝")).toBeInTheDocument();
    expect(screen.getByText("실내에서 기록한 활동이라 지도에 표시할 경로가 없습니다")).toBeInTheDocument();
    expect(screen.queryByText("가상 라이딩")).not.toBeInTheDocument();
  });

  it("labels trainer rides as indoor rides", () => {
    renderNoMap({ type: "Ride", trainer: true });
    expect(screen.getByText("실내 라이딩")).toBeInTheDocument();
  });

  it("keeps Virtual* types indoor without the trainer flag", () => {
    renderNoMap({ type: "VirtualRun" });
    expect(screen.getByText("실내 러닝")).toBeInTheDocument();
  });

  it("falls back to a generic indoor label for other sports", () => {
    renderNoMap({ type: "Workout", trainer: true });
    expect(screen.getByText("실내 활동")).toBeInTheDocument();
  });

  it("does not infer absent GPS from a missing native map preview", () => {
    renderNoMap({ type: "Ride", source: "orider" });
    expect(screen.getByText("경로 정보")).toBeInTheDocument();
    expect(screen.queryByText("GPS 데이터 없음")).not.toBeInTheDocument();
  });

  it("keeps the no-GPS message for outdoor activities without a track", () => {
    renderNoMap({ type: "TrailRun" });
    expect(screen.getByText("GPS 데이터 없음")).toBeInTheDocument();
    expect(screen.getByText("이 활동에는 경로 데이터가 기록되지 않았습니다")).toBeInTheDocument();
  });

  it("renders English indoor labels", () => {
    renderNoMap({ type: "Run", trainer: true }, "en");
    expect(screen.getByText("Indoor run")).toBeInTheDocument();
  });

  it("renders English indoor ride label for VirtualRide", () => {
    renderNoMap({ type: "VirtualRide" }, "en");
    expect(screen.getByText("Indoor ride")).toBeInTheDocument();
  });
});

it.each([true,false])("only declares imported GPS absence when the loaded independent route contract validates: %s", valid => {
  const startTime = 1792970000000;
  const streams = { distance: [], time: [], latlng: [], importedSensorObservationsV1: {
    version: 1, state: "available", source: "parsed_import_points", timeUnit: "relative_milliseconds",
    originEpochMs: startTime, routeTimeMs: [], timeMs: valid ? [0,1000,2000] : [0,1000,1000],
    watts: [200,0,200], heartrate: [150,150,150], cadence: [80,0,80] } };
  renderNoMap({type:"Ride",source:"orider",startTime}, "ko",streams);
  expect(screen.queryByText("GPS 데이터 없음") !== null).toBe(valid);
  expect(screen.queryByText("경로 정보") !== null).toBe(!valid);
  expect(screen.queryByText("실내 라이딩")).not.toBeInTheDocument();
});
