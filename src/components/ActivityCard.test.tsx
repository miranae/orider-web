import { screen, waitFor, fireEvent } from "@testing-library/react";
import ActivityCard, { shouldReportMapCaptureError } from "./ActivityCard";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { createMockActivity } from "../__tests__/fixtures/mockData";
import { setCallableResult } from "../__tests__/mocks/firebase";

// Mock RouteMap to avoid Leaflet issues
vi.mock("./RouteMap", () => ({
  default: () => <div data-testid="route-map">Map</div>,
}));

describe("ActivityCard", () => {
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

  it("renders activity nickname and description", () => {
    const activity = createMockActivity({
      nickname: "한강 라이더",
      description: "아침 라이딩",
    });
    renderWithProviders(<ActivityCard activity={activity} />);
    expect(screen.getByText("한강 라이더")).toBeInTheDocument();
    expect(screen.getByText("아침 라이딩")).toBeInTheDocument();
  });

  it("renders distance, elevation, and time", () => {
    const activity = createMockActivity({
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

  it("shows average power and heart rate when present", () => {
    const activity = createMockActivity();
    renderWithProviders(<ActivityCard activity={activity} />);
    expect(screen.getByText("200 W")).toBeInTheDocument();
    expect(screen.getByText("145 bpm")).toBeInTheDocument();
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
    renderWithProviders(<ActivityCard activity={activity} showMap={false} />, { authenticated: true });

    await waitFor(() => {
      expect(screen.getByText("문고개")).toBeInTheDocument();
      expect(screen.getByText("3:05")).toBeInTheDocument();
    });
    expect(screen.queryByText("구간 기록 없음")).not.toBeInTheDocument();
  });

  it("shows route map by default", async () => {
    const activity = createMockActivity();
    renderWithProviders(<ActivityCard activity={activity} />);
    // RouteMap 은 lazy() 로 분리되어 Suspense 경계 뒤에서 비동기 로드된다.
    await waitFor(() => {
      expect(screen.getByTestId("route-map")).toBeInTheDocument();
    });
  });

  it("hides route map when showMap is false", () => {
    const activity = createMockActivity();
    renderWithProviders(<ActivityCard activity={activity} showMap={false} />);
    expect(screen.queryByTestId("route-map")).not.toBeInTheDocument();
  });

  it("links to activity detail page", () => {
    const activity = createMockActivity({ id: "act-detail" });
    renderWithProviders(<ActivityCard activity={activity} />);
    const links = screen.getAllByRole("link");
    const actLink = links.find((l) => l.getAttribute("href") === "/ko/activity/act-detail");
    expect(actLink).toBeTruthy();
  });

  it("links to athlete profile", () => {
    const activity = createMockActivity({ userId: "user-42" });
    renderWithProviders(<ActivityCard activity={activity} />);
    const links = screen.getAllByRole("link");
    const profileLink = links.find((l) => l.getAttribute("href") === "/ko/athlete/user-42");
    expect(profileLink).toBeTruthy();
  });

  // 스트라바형 소셜 푸터 — 좋아요(아바타 스택)+댓글. recentKudos 비정규화로 추가 read 없음.
  it("renders kudos and comment buttons in the social footer", () => {
    const activity = createMockActivity({ kudosCount: 3, commentCount: 1 });
    renderWithProviders(<ActivityCard activity={activity} />);
    // 좋아요/댓글 버튼은 aria-label 로 식별 (count 숫자는 stats 와 중복될 수 있어 라벨로 검증)
    expect(screen.getByLabelText("좋아요")).toBeInTheDocument();
    expect(screen.getByLabelText("댓글")).toBeInTheDocument();
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

  // AI 요약 — 활동 doc 에 비정규화된 aiSummaryPreview 가 있을 때만 노출 (온디맨드 생성).
  it("shows AI summary block when aiSummaryPreview is present", () => {
    const activity = createMockActivity({ aiSummaryPreview: "전반적으로 안정적인 페이스의 라이딩이었습니다." });
    renderWithProviders(<ActivityCard activity={activity} />);
    expect(screen.getByText("AI 요약")).toBeInTheDocument();
    expect(screen.getByText("전반적으로 안정적인 페이스의 라이딩이었습니다.")).toBeInTheDocument();
  });

  it("hides AI summary block when aiSummaryPreview is absent", () => {
    const activity = createMockActivity();
    renderWithProviders(<ActivityCard activity={activity} />);
    expect(screen.queryByText("AI 요약")).not.toBeInTheDocument();
  });

  it("defaults description to '라이딩' when empty", () => {
    const activity = createMockActivity({ description: "" });
    renderWithProviders(<ActivityCard activity={activity} />);
    expect(screen.getByText("라이딩")).toBeInTheDocument();
  });
});
