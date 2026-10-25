import { loadPublicActivityMap } from "../services/publicActivityMaps";
import i18n from "i18next";
import enActivity from "../i18n/resources/en/activity.json";
import enCommon from "../i18n/resources/en/common.json";
import enTermGlossary from "../i18n/resources/en/termGlossary.json";
import { GlossaryProvider } from "./common/GlossaryProvider";
import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import ActivityCard, { shouldReportMapCaptureError } from "./ActivityCard";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { createMockActivity } from "../__tests__/fixtures/mockData";
import { setCallableResult, setDocData } from "../__tests__/mocks/firebase";

vi.mock("../services/publicActivityMaps", () => ({ loadPublicActivityMap: vi.fn(async () => null) }));

// 실제 지도 SDK 대신 표시 지도와 숨겨진 캡처 지도를 구분한다.
vi.mock("./RouteMap", () => ({
  default: ({ interactive, fallbackImageUrl, preserveDrawingBuffer }: { interactive?: boolean; fallbackImageUrl?: string | null; preserveDrawingBuffer?: boolean }) => (
    <div
      data-testid={preserveDrawingBuffer ? "capture-map" : "route-map"}
      data-interactive={String(interactive)}
      data-fallback-image-url={fallbackImageUrl ?? ""}
    >
      Map
    </div>
  ),
}));

describe("ActivityCard", () => {
  beforeAll(() => {
    i18n.addResourceBundle("en", "activity", enActivity, true, true);
    i18n.addResourceBundle("en", "common", enCommon, true, true);
    i18n.addResourceBundle("en", "termGlossary", enTermGlossary, true, true);
  });
  afterEach(async () => { await i18n.changeLanguage("ko"); });

  it.each(["ko", "en"])("uses the %s date locale in both author layouts", async language => {
    await i18n.changeLanguage(language);
    const startTime = new Date(2026, 9, 16, 6, 11).getTime();
    const activity = createMockActivity({ startTime, description: "FTP 사용자 활동명" });
    renderWithProviders(<><ActivityCard activity={activity} showMap={false} /><ActivityCard activity={activity} showMap={false} hideAuthor /></>);
    const expectedDate = new Date(startTime).toLocaleString(language === "en" ? "en-US" : "ko-KR", {
      month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
    });
    expect(screen.getAllByText(expectedDate)).toHaveLength(2);
    expect(screen.getAllByText("FTP 사용자 활동명")).toHaveLength(2);
  });

  it("uses stable achievement icons and explains every repeated PR/KOM label", () => {
    const activity = createMockActivity({ topAchievements: [
      { type: "PR", segmentId: "one", segmentName: "First PR segment", time: "3:05" },
      { type: "PR", segmentId: "two", segmentName: "Second PR segment", time: "4:10" },
      { type: "KOM", segmentId: "three", segmentName: "KOM segment", time: "2:30" },
    ] });
    const view = renderWithProviders(<GlossaryProvider><ActivityCard activity={activity} showMap={false} /></GlossaryProvider>);
    expect(view.container).not.toHaveTextContent(/🥇|🥈|🥉|👑/);
    const achievements = view.container.querySelector(".activity-feed-card__achievements")!;
    expect(within(achievements as HTMLElement).getAllByRole("button", { name: "PR 설명" })).toHaveLength(2);
    expect(within(achievements as HTMLElement).getByRole("button", { name: "KOM 설명" })).toBeInTheDocument();
    expect(view.container.querySelectorAll("svg.lucide-medal")).toHaveLength(3);
    expect(view.container.querySelectorAll("svg.lucide-crown")).toHaveLength(2);
    fireEvent.click(within(achievements as HTMLElement).getAllByRole("button", { name: "PR 설명" })[1]!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("개인 최고 기록");
    expect(screen.getByText("3:05")).toBeInTheDocument();
    expect(screen.getByText("4:10")).toBeInTheDocument();
    expect(screen.getByText("2:30")).toBeInTheDocument();
  });

  it("explains English abbreviated elevation and plural segments without parsing an activity title", async () => {
    await i18n.changeLanguage("en");
    renderWithProviders(<GlossaryProvider><ActivityCard activity={createMockActivity({ description: "FTP original title", segmentEffortCount: 30 })} showMap={false} /></GlossaryProvider>);
    fireEvent.click(screen.getByRole("button", { name: "About Elev Gain" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Elevation gain");
    expect(screen.getByRole("button", { name: "About segments" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "About FTP" })).not.toBeInTheDocument();
    expect(screen.getByText("FTP original title")).toBeInTheDocument();
  });
  it("renders running pace and supplementary running power without a misleading no-records message", () => {
    const base = createMockActivity();
    const activity = createMockActivity({ type: "TrailRun", startTime: 1_000_000, endTime: 8_082_000,
      summary: { ...base.summary, distance: 21022.1, ridingTimeMillis: 7082000, averageSpeed: 10.686, averagePower: 264 }, topAchievements: [], segmentEffortCount: 0 });
    renderWithProviders(<ActivityCard activity={activity} showMap={false} />);
    expect(screen.getByText("5:37/km")).toBeInTheDocument();
    expect(screen.getByTestId("run-card-primary").children).toHaveLength(3);
    expect(within(screen.getByTestId("run-card-primary")).getByText("5:37/km")).toHaveClass("font-bold");
    expect(screen.getByTestId("run-card-secondary")).toHaveTextContent("러닝 파워 · 264 W");
    expect(screen.getByText("페이스·km별 기록 보기")).toBeInTheDocument();
    expect(screen.queryByText("구간 기록 없음")).not.toBeInTheDocument();
  });

  it("does not report optional map thumbnail permission failures as client errors", () => {
    expect(shouldReportMapCaptureError({ code: "storage/unauthorized" })).toBe(false);
    expect(shouldReportMapCaptureError({ code: "permission-denied" })).toBe(false);
    expect(
      shouldReportMapCaptureError(
        new Error("Firebase Storage: User does not have permission to access the object. (storage/unauthorized)")
      )
    ).toBe(false);
    expect(shouldReportMapCaptureError(new Error("canvas capture failed"))).toBe(true);
  });

  it("composes an indoor marker with the sport badge for trainer runs", () => {
    renderWithProviders(<ActivityCard activity={createMockActivity({ type: "Run", trainer: true })} showMap={false} hideAuthor />);
    expect(screen.getByText("러닝 · 실내")).toBeInTheDocument();
  });

  it("does not mark outdoor trail runs as indoor", () => {
    renderWithProviders(<ActivityCard activity={createMockActivity({ type: "TrailRun", trainer: false })} showMap={false} hideAuthor />);
    expect(screen.getByText("러닝")).toBeInTheDocument();
    expect(screen.queryByText(/실내/)).not.toBeInTheDocument();
  });

  it("renders distance, elevation, and time", () => {
    const activity = createMockActivity({
      startTime: 1_000_000,
      endTime: 6_400_000,
      summary: {
        distance: 42000,
        elevationGain: 320,
        ridingTimeMillis: 5400000,
        averageSpeed: 28.0,
        maxSpeed: 45.2,
        averageCadence: null,
        maxCadence: null,
        averageHeartRate: null,
        maxHeartRate: null,
        averagePower: null,
        maxPower: null,
        normalizedPower: null,
        calories: null,
        relativeEffort: null,
      },
    });
    renderWithProviders(<ActivityCard activity={activity} showMap={false} />);
    expect(screen.getByText("42.0km")).toBeInTheDocument();
    expect(screen.getByText("320m")).toBeInTheDocument();
    expect(screen.getByText("1h 30m")).toBeInTheDocument();
  });

  it("hides corrupt average heart rate and shows the data warning", () => {
    const base = createMockActivity();
    const activity = createMockActivity({
      summary: { ...base.summary, averageHeartRate: 5 },
    });

    renderWithProviders(<ActivityCard activity={activity} showMap={false} />);

    expect(screen.queryByText("5 bpm")).not.toBeInTheDocument();
    expect(screen.getByText("⚠ 데이터 이상")).toBeInTheDocument();
  });

  it("shows matched segment count when there are no PR/KOM achievements", () => {
    const activity = createMockActivity({
      segmentEffortCount: 3,
      topAchievements: [],
    });
    renderWithProviders(<ActivityCard activity={activity} showMap={false} />);
    expect(screen.getByText("3개 세그먼트")).toBeInTheDocument();
    expect(screen.queryByText("구간 기록 없음")).not.toBeInTheDocument();
  });

  it("recovers PR achievements from cached Strava streams for the owner's card", async () => {
    setCallableResult("stravaGetActivityStreams", {
      data: {
        segment_efforts: [
          {
            id: 1001,
            name: "문고개",
            elapsedTime: 185000,
            prRank: 1,
            komRank: null,
            segment: { id: 1001, name: "문고개" },
          },
          {
            id: 1002,
            name: "경남 문",
            elapsedTime: 242000,
            prRank: 2,
            komRank: null,
            segment: { id: 1002, name: "경남 문" },
          },
        ],
      },
    });

    const activity = createMockActivity({
      userId: "test-uid",
      source: "strava",
      stravaActivityId: 123456,
      segmentEffortCount: 2,
      topAchievements: [],
    });
    renderWithProviders(<ActivityCard activity={activity} showMap={false} hideAuthor />, { authenticated: true });

    await waitFor(() => {
      expect(screen.getByText("문고개")).toBeInTheDocument();
      expect(screen.getByText("3:05")).toBeInTheDocument();
    });
    expect(screen.queryByText("구간 기록 없음")).not.toBeInTheDocument();
  });

  it("does not fetch cached Strava streams for another rider's public card", async () => {
    setCallableResult("stravaGetActivityStreams", {
      data: {
        segment_efforts: [
          {
            id: 2001,
            name: "황새울공원 -> 양현교",
            elapsedTime: 90000,
            prRank: 1,
            komRank: null,
            segment: { id: 2001, name: "황새울공원 -> 양현교" },
          },
        ],
      },
    });

    const activity = createMockActivity({
      userId: "other-rider",
      source: "strava",
      stravaActivityId: 19095768147,
      segmentEffortCount: 70,
      topAchievements: [],
    });
    renderWithProviders(<ActivityCard activity={activity} showMap={false} />, { authenticated: true });

    expect(screen.getByText("70개 세그먼트")).toBeInTheDocument();
    expect(screen.queryByText("황새울공원 -> 양현교")).not.toBeInTheDocument();
  });

  it("keeps a stored thumbnail as the live map failure fallback", async () => {
    const activity = createMockActivity({
      mapImageUrl: "https://storage.googleapis.com/legacy/map.webp",
    });
    vi.mocked(loadPublicActivityMap).mockResolvedValue({ activityId: activity.id, revision: "current", privacyEnabled: false, mapPreview: { encodedPolyline: activity.thumbnailTrack!, imageUrl: activity.mapImageUrl! } });
    renderWithProviders(<ActivityCard activity={activity} />);

    await waitFor(() => {
      expect(screen.getByTestId("route-map")).toHaveAttribute(
        "data-fallback-image-url",
        activity.mapImageUrl,
      );
    });
  });

  it("hydrates missing kudos avatars from public profiles", async () => {
    setDocData("users_public/kudos-user", {
      nickname: "경",
      photoURL: "https://example.com/kudos-avatar.jpg",
    });
    const activity = createMockActivity({
      kudosCount: 1,
      recentKudos: [{ userId: "kudos-user", nickname: "경", profileImage: null }],
    });

    renderWithProviders(<ActivityCard activity={activity} showMap={false} />);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "경" })).toHaveAttribute("src", "https://example.com/kudos-avatar.jpg");
    });
  });

  it("toggles an inline comment input when the comment button is clicked", () => {
    const activity = createMockActivity();
    renderWithProviders(<ActivityCard activity={activity} />);
    // 처음엔 입력칸이 없다
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    // 댓글 버튼 클릭 → 카드 안에 입력칸이 나타난다 (상세 이동 없이)
    fireEvent.click(screen.getByLabelText("댓글"));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("hides social footer in author context (hideAuthor)", () => {
    const activity = createMockActivity();
    renderWithProviders(<ActivityCard activity={activity} hideAuthor />);
    expect(screen.queryByLabelText("좋아요")).not.toBeInTheDocument();
  });
});

it.each([false, true])("distinguishes confirmed elapsed time from an untyped provider duration (%s)", confirmed => {
  const base = createMockActivity();
  const activity = createMockActivity({ startTime: 0, endTime: 0, summary: { ...base.summary, ridingTimeMillis: 3600000, elapsedTimeMillis: confirmed ? 3600000 : undefined, movingTimeSec: undefined, pauseTimeSec: undefined } });
  renderWithProviders(<ActivityCard activity={activity} homeLabels showMap={false} />);
  expect(screen.getByText(confirmed ? "전체시간" : "활동시간")).toBeInTheDocument();
  expect(screen.queryByText(confirmed ? "활동시간" : "전체시간")).not.toBeInTheDocument();
});

 it("shows the stored English region beside the device", () => {
  renderWithProviders(<ActivityCard activity={createMockActivity({ regionName: "Yeongdeungpo-gu, Seoul", sourceMeta: { deviceModel: "Garmin Edge 840" } })} homeLabels showMap={false} />);
  expect(screen.getByText("· Yeongdeungpo-gu, Seoul").parentElement).toHaveTextContent("Garmin Edge 840 · Yeongdeungpo-gu, Seoul");
});
