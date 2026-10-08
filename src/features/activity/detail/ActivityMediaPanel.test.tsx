import i18n from "i18next";
import type { TFunction } from "i18next";
import { render, screen } from "@testing-library/react";
import enActivity from "../../../i18n/resources/en/activity.json";
import { createMockActivity } from "../../../__tests__/fixtures/mockData";
import type { Activity } from "@shared/types";
import { ActivityMediaPanel } from "./ActivityMediaPanel";
import { getSportCategory } from "./activityDetailUtils";

vi.mock("../../../components/RouteMap", () => ({ default: () => <div data-testid="route-map" /> }));

function renderNoMap(overrides: Partial<Activity>, lng: "ko" | "en" = "ko") {
  const activity = createMockActivity(overrides);
  const t = i18n.getFixedT(lng, "activity") as TFunction<"activity">;
  render(
    <ActivityMediaPanel
      activity={activity}
      streams={null}
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
