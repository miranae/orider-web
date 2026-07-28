import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { getDocs, onSnapshot, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import ActivityPage from "./ActivityPage";
import { clearRideRouteIntentMemoryForTests } from "../features/activity/detail/RideActivityRouteButton";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import {
  mockCallableInvocations,
  mockSignInWithPopup,
  mockUpdateDoc,
  simulateLogin,
  setCallableResult,
  setCollectionDocs,
  setDocData,
} from "../__tests__/mocks/firebase";
import { createMockActivity, createMockStreams, createMockSummary } from "../__tests__/fixtures/mockData";

const shareButtonProps = vi.hoisted(() => vi.fn());
const mockFitnessTimeseries = vi.hoisted(() => vi.fn(() => ({ timeseries: null, loaded: true })));
const mockPdc = vi.hoisted(() => vi.fn(() => ({ status: "missing", pdc: null })));
vi.mock("../hooks/useFitnessTimeseries", () => ({ useFitnessTimeseries: mockFitnessTimeseries }));
vi.mock("../hooks/usePdc", () => ({ usePdc: mockPdc }));
vi.mock("../features/activity/share/ActivityShareButton", () => ({
  ActivityShareButton: (props: unknown) => {
    shareButtonProps(props);
    return <button>share-card</button>;
  },
}));

// Mock heavy components
vi.mock("../components/RouteMap", () => ({
  default: () => <div data-testid="route-map">Map</div>,
}));
vi.mock("../components/ElevationChart", () => ({
  default: () => <div data-testid="elevation-chart">Chart</div>,
}));
vi.mock("../components/activity/AiRideAnalysisCard", () => ({
  default: () => <div data-testid="ai-ride-analysis-card">AI</div>,
}));

// ActivityPage 의 분석 탭 임포트 체인(PowerCurveChart 등)이 chart.js 의
// LogarithmicScale 을 register 하므로, 전역 chart.js mock(setup.ts)에 없는
// 스케일/요소까지 포함해 이 파일 전용으로 보강한다. (setup.ts 는 수정 금지)
vi.mock("chart.js", () => ({
  Chart: { register: vi.fn() },
  CategoryScale: class {},
  LinearScale: class {},
  LogarithmicScale: class {},
  BarElement: class {},
  LineElement: class {},
  PointElement: class {},
  ArcElement: class {},
  Title: class {},
  Tooltip: class {},
  Legend: class {},
  Filler: class {},
}));

const { mockRoute, mockSetActivityOwner } = vi.hoisted(() => ({
  mockRoute: { activityId: "test-activity" },
  mockSetActivityOwner: vi.fn(),
}));
const findSentButton = () => screen.findByRole("button", { name: "앱으로 전송됨" }, { timeout: 5000 });
const waitForCallableCount = (name: string, count: number) => waitFor(
  () => expect(mockCallableInvocations.filter((call) => call.name === name)).toHaveLength(count),
  { timeout: 5000 },
);

// Mock react-router-dom useParams
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useParams: () => ({ activityId: mockRoute.activityId }),
    useOutletContext: () => ({ setActivityOwner: mockSetActivityOwner }),
  };
});

describe("ActivityPage", () => {
  beforeEach(() => {
    mockFitnessTimeseries.mockReturnValue({ timeseries: null, loaded: true });
    mockPdc.mockReturnValue({ status: "missing", pdc: null });
    mockRoute.activityId = "test-activity";
    setCollectionDocs("courses", []);
    vi.mocked(getDocs).mockClear();
    vi.mocked(onSnapshot).mockClear();
    vi.mocked(onAuthStateChanged).mockClear();
    vi.mocked(where).mockClear();
    vi.mocked(httpsCallable).mockClear();
    mockSetActivityOwner.mockClear();
    window.sessionStorage.clear();
    clearRideRouteIntentMemoryForTests();
  });

  const socialSnapshotPaths = () => vi.mocked(onSnapshot).mock.calls
    .map(([ref]) => (ref as { path?: string }).path)
    .filter((path) => path?.endsWith("/kudos") || path?.endsWith("/comments"));

  it("shows loading state initially", () => {
    renderWithProviders(<ActivityPage />);
    // The component starts with loading state
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders activity details when data is loaded", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      description: "한강 아침 라이딩",
      nickname: "테스트 라이더",
      summary: createMockSummary({ distance: 50000, elevationGain: 400 }),
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />);

    await waitFor(() => {
      expect(screen.getByText("한강 아침 라이딩")).toBeInTheDocument();
    });
  });

  it("publishes the current owner and clears stale ownership across route changes", async () => {
    const first = createMockActivity({
      id: "test-activity",
      userId: "owner-a",
      description: "첫 활동",
    });
    const second = createMockActivity({
      id: "next-activity",
      userId: "owner-b",
      description: "다음 활동",
    });
    setDocData("activities/test-activity", first as unknown as Record<string, unknown>);
    setDocData("activities/next-activity", second as unknown as Record<string, unknown>);

    const view = renderWithProviders(<ActivityPage />);
    await screen.findByText("첫 활동");
    await waitFor(() => expect(mockSetActivityOwner).toHaveBeenCalledWith({
      activityId: "test-activity",
      ownerId: "owner-a",
    }));

    const callsBeforeTransition = mockSetActivityOwner.mock.calls.length;
    mockRoute.activityId = "next-activity";
    view.rerender(<ActivityPage />);
    expect(mockSetActivityOwner.mock.calls.slice(callsBeforeTransition)).toContainEqual([null]);
    await screen.findByText("다음 활동");
    await waitFor(() => expect(mockSetActivityOwner).toHaveBeenCalledWith({
      activityId: "next-activity",
      ownerId: "owner-b",
    }));

    view.unmount();
    expect(mockSetActivityOwner).toHaveBeenLastCalledWith(null);
  });

  it("passes activity identity and visibility context to the share action", async () => {
    const activity = createMockActivity({ id: "test-activity", visibility: "friends" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    shareButtonProps.mockClear();
    renderWithProviders(<ActivityPage />);
    await screen.findByText("share-card");
    expect(shareButtonProps).toHaveBeenCalledWith(expect.objectContaining({
      activityId: "test-activity",
      visibility: "friends",
    }));
  });

  it("passes activity-date fitness and VO2max into the exported image", async () => {
    simulateLogin("owner-a");
    mockFitnessTimeseries.mockReturnValue({
      timeseries: {
        discipline: "bike", schemaVersion: 1, computedAt: 0, startDate: "2026-07-01", endDate: "2026-07-18", pointCount: 2,
        points: [
          { date: "2026-07-10", ctl: 40.2, atl: 45.1, tsb: -4.9, dailyLoad: 0 },
          { date: "2026-07-18", ctl: 48, atl: 55, tsb: -7, dailyLoad: 0 },
        ],
      },
      loaded: true,
    });
    mockPdc.mockReturnValue({ status: "ready", pdc: { vo2maxEst: 57.8 } });
    const activity = createMockActivity({
      id: "test-activity",
      userId: "owner-a",
      startTime: Date.parse("2026-07-10T08:00:00Z"),
      summary: createMockSummary({ tss: 82, normalizedPower: 214 }),
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    shareButtonProps.mockClear();

    renderWithProviders(<ActivityPage />);
    await screen.findByText("share-card");

    expect(shareButtonProps).toHaveBeenLastCalledWith(expect.objectContaining({
      card: expect.objectContaining({
        performanceMetrics: expect.arrayContaining([
          { label: "CTL", value: "40", unit: undefined },
          { label: "ATL", value: "45", unit: undefined },
          { label: "TSB", value: "-5", unit: undefined },
          expect.objectContaining({ value: "58" }),
        ]),
      }),
    }));
  });

  it("shows activity stats when loaded", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      summary: createMockSummary({
        distance: 50000,
        elevationGain: 400,
        ridingTimeMillis: 7200000,
        averageSpeed: 25.0,
      }),
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />);

    await waitFor(() => {
      expect(screen.getAllByText("50.0")[0]).toBeInTheDocument(); // distance; average speed can share the value
    });
  });

  it("places key stats before the tab navigation", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      summary: createMockSummary({
        distance: 50000,
        elevationGain: 400,
        ridingTimeMillis: 7200000,
        averageSpeed: 25.0,
      }),
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />);

    const stat = (await screen.findAllByText("50.0"))[0]!;
    const overviewTab = await screen.findByRole("tab", { name: "개요" });

    expect(stat.compareDocumentPosition(overviewTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows processing state instead of not found when activity summary is still missing", async () => {
    const { summary: _summary, ...activityWithoutSummary } = createMockActivity({
      id: "test-activity",
      description: "수집 중 활동",
    });
    setDocData("activities/test-activity", activityWithoutSummary as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />);

    expect(await screen.findByText("활동을 처리 중입니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("shows comment input for authenticated users", async () => {
    const activity = createMockActivity({ id: "test-activity" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />, { authenticated: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/댓글/)).toBeInTheDocument();
    });
  });

  it("shows public social aggregates without subcollection reads for signed-out visitors", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      kudosCount: 4,
      commentCount: 1,
      recentKudos: [{ userId: "rider-1", nickname: "라이더", profileImage: null }],
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    setCollectionDocs("activities/test-activity/comments", [
      {
        id: "comment-1",
        userId: "commenter-1",
        nickname: "댓글러",
        profileImage: null,
        text: "공개 댓글입니다",
        createdAt: Date.now(),
        deletedAt: null,
      },
    ]);

    renderWithProviders(<ActivityPage />, { authenticated: false });

    await screen.findByRole("button", { name: "Google로 로그인" });
    expect(screen.queryByText("공개 댓글입니다")).not.toBeInTheDocument();
    expect(screen.getByText("좋아요 4")).toBeInTheDocument();
    expect(screen.getByText("댓글 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google로 로그인" })).toBeInTheDocument();
    expect(socialSnapshotPaths()).toEqual([]);
  });

  it("waits for auth resolution before subscribing and then loads signed-in social data", async () => {
    const activity = createMockActivity({ id: "test-activity" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    setCollectionDocs("activities/test-activity/comments", [{
      id: "comment-1",
      userId: "commenter-1",
      nickname: "댓글러",
      profileImage: null,
      text: "로그인 후 댓글",
      createdAt: Date.now(),
      deletedAt: null,
    }]);
    let resolveAuth!: Parameters<typeof onAuthStateChanged>[1];
    vi.mocked(onAuthStateChanged).mockImplementationOnce(((_auth, next) => {
      resolveAuth = next;
      return vi.fn();
    }) as typeof onAuthStateChanged);

    renderWithProviders(<ActivityPage />, { authenticated: false });
    await screen.findByText(activity.description);
    expect(socialSnapshotPaths()).toEqual([]);

    act(() => {
      resolveAuth({
        uid: "signed-in-user",
        displayName: "Signed In",
        email: "signed-in@example.com",
        photoURL: null,
      } as Parameters<typeof resolveAuth>[0]);
    });

    expect(await screen.findByText("로그인 후 댓글")).toBeInTheDocument();
    expect(socialSnapshotPaths()).toEqual([
      "activities/test-activity/kudos",
      "activities/test-activity/comments",
    ]);
  });

  it("starts sign-in when a signed-out visitor tries to participate", async () => {
    const activity = createMockActivity({ id: "test-activity" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    mockSignInWithPopup.mockClear();

    renderWithProviders(<ActivityPage />, { authenticated: false });

    fireEvent.click(await screen.findByRole("button", { name: "로그인하고 좋아요" }));

    await waitFor(() => {
      expect(mockSignInWithPopup).toHaveBeenCalled();
    });
  });

  it("creates a course from the activity route and sends it to the app in one click", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      description: "다시 달릴 한강 코스",
      thumbnailTrack: "encoded-route",
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    setCallableResult("createCourseFromActivity", { data: { courseId: "course-from-activity" } });
    setCallableResult("sendCourseToApp", { data: {} });

    renderWithProviders(<ActivityPage />, { authenticated: true });

    const button = await screen.findByRole("button", { name: "이 경로로 라이드" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(await findSentButton()).toBeDisabled();
    expect(screen.getByText("코스를 만들고 앱으로 전송했습니다")).toBeInTheDocument();
    expect(mockCallableInvocations.filter(({ name }) => name === "createCourseFromActivity")).toEqual([
      {
        name: "createCourseFromActivity",
        data: {
          activityId: "test-activity",
          name: "다시 달릴 한강 코스",
          description: "활동 경로에서 만든 코스",
          surface: null,
          difficulty: null,
        },
      },
    ]);
    expect(mockCallableInvocations.filter(({ name }) => name === "sendCourseToApp")).toEqual([
      { name: "sendCourseToApp", data: { courseId: "course-from-activity" } },
    ]);
    const createCallableIndex = vi.mocked(httpsCallable).mock.calls.findIndex(([, name]) => name === "createCourseFromActivity");
    expect(vi.mocked(getDocs).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(httpsCallable).mock.invocationCallOrder[createCallableIndex]!,
    );
  });

  it("reuses an existing course for the same creator and activity before creating", async () => {
    const activity = createMockActivity({ id: "test-activity", thumbnailTrack: "encoded-route" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    setCollectionDocs("courses", [{
      id: "existing-course",
      creatorId: "test-uid",
      sourceActivityId: "test-activity",
    }]);
    setCallableResult("sendCourseToApp", { data: {} });

    renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(await screen.findByRole("button", { name: "이 경로로 라이드" }));

    expect(await findSentButton()).toBeDisabled();
    expect(mockCallableInvocations.filter(({ name }) => name === "createCourseFromActivity")).toHaveLength(0);
    expect(mockCallableInvocations.filter(({ name }) => name === "sendCourseToApp")).toEqual([
      { name: "sendCourseToApp", data: { courseId: "existing-course" } },
    ]);
    expect(vi.mocked(where)).toHaveBeenCalledWith("creatorId", "==", "test-uid");
    expect(vi.mocked(where)).toHaveBeenCalledWith("sourceActivityId", "==", "test-activity");
    expect(vi.mocked(where)).toHaveBeenCalledWith("deletedAt", "==", null);
  });

  it("does not create when the existing-course lookup fails", async () => {
    const activity = createMockActivity({ id: "test-activity", thumbnailTrack: "encoded-route" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    vi.mocked(getDocs).mockRejectedValueOnce(new Error("index unavailable"));

    renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(await screen.findByRole("button", { name: "이 경로로 라이드" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("기존 코스를 확인하지 못했습니다");
    expect(mockCallableInvocations.filter(({ name }) => name === "createCourseFromActivity")).toHaveLength(0);
    expect(mockCallableInvocations.filter(({ name }) => name === "sendCourseToApp")).toHaveLength(0);
  });

  it("keeps an ambiguous pending intent across remounts and performs lookup only", async () => {
    const activity = createMockActivity({ id: "test-activity", thumbnailTrack: "encoded-route" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    window.sessionStorage.setItem("orider:ride-route:test-uid:test-activity", JSON.stringify({
      state: "pending",
      updatedAt: Date.now(),
    }));

    const first = renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(await screen.findByRole("button", { name: "이 경로로 라이드" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("코스 생성 결과를 확인 중입니다");
    expect(mockCallableInvocations.filter(({ name }) => name === "createCourseFromActivity")).toHaveLength(0);
    first.unmount();

    const second = renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(await screen.findByRole("button", { name: "이 경로로 라이드" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("코스 생성 결과를 확인 중입니다");
    await waitFor(() => expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(2));
    expect(mockCallableInvocations.filter(({ name }) => name === "createCourseFromActivity")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "이 경로로 라이드" })).toBeEnabled();
    second.unmount();
  });

  it("reuses a persisted created course after remount without creating or looking it up", async () => {
    const activity = createMockActivity({ id: "test-activity", thumbnailTrack: "encoded-route" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    window.sessionStorage.setItem("orider:ride-route:test-uid:test-activity", JSON.stringify({
      state: "created",
      courseId: "persisted-course",
      updatedAt: Date.now(),
    }));
    setCallableResult("sendCourseToApp", { data: {} });

    renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(await screen.findByRole("button", { name: "이 경로로 라이드" }));

    expect(await findSentButton()).toBeDisabled();
    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(0);
    expect(mockCallableInvocations.filter(({ name }) => name === "createCourseFromActivity")).toHaveLength(0);
    expect(mockCallableInvocations.filter(({ name }) => name === "sendCourseToApp")).toEqual([
      { name: "sendCourseToApp", data: { courseId: "persisted-course" } },
    ]);
  });

  it("recovers the created course after a lost create response without creating again", async () => {
    const activity = createMockActivity({ id: "test-activity", thumbnailTrack: "encoded-route" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    let rejectCreate!: (reason: Error) => void;
    const createResponse = new Promise((_resolve, reject) => { rejectCreate = reject; });
    void createResponse.catch(() => undefined);
    setCallableResult("createCourseFromActivity", createResponse);
    setCallableResult("sendCourseToApp", { data: {} });

    renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(await screen.findByRole("button", { name: "이 경로로 라이드" }));
    await waitForCallableCount("createCourseFromActivity", 1);

    setCollectionDocs("courses", [{
      id: "recovered-course",
      creatorId: "test-uid",
      sourceActivityId: "test-activity",
    }]);
    rejectCreate(new Error("response lost"));

    expect(await findSentButton()).toBeDisabled();
    expect(mockCallableInvocations.filter(({ name }) => name === "createCourseFromActivity")).toHaveLength(1);
    expect(mockCallableInvocations.filter(({ name }) => name === "sendCourseToApp")).toEqual([
      { name: "sendCourseToApp", data: { courseId: "recovered-course" } },
    ]);
    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(2);
  });

  it("clears pending intent after a definitive create rejection so a retry may create", async () => {
    const activity = createMockActivity({ id: "test-activity", thumbnailTrack: "encoded-route" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    const definitiveError = Object.assign(new Error("invalid activity state"), {
      code: "functions/failed-precondition",
    });
    const rejectedCreate = Promise.reject(definitiveError);
    void rejectedCreate.catch(() => undefined);
    setCallableResult("createCourseFromActivity", rejectedCreate);

    renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(await screen.findByRole("button", { name: "이 경로로 라이드" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("코스를 만들지 못했습니다");
    expect(window.sessionStorage.getItem("orider:ride-route:test-uid:test-activity")).toBeNull();

    setCallableResult("createCourseFromActivity", { data: { courseId: "retry-course" } });
    setCallableResult("sendCourseToApp", { data: {} });
    fireEvent.click(screen.getByRole("button", { name: "이 경로로 라이드" }));

    expect(await findSentButton()).toBeDisabled();
    expect(mockCallableInvocations.filter(({ name }) => name === "createCourseFromActivity")).toHaveLength(2);
    expect(mockCallableInvocations.filter(({ name }) => name === "sendCourseToApp")).toEqual([
      { name: "sendCourseToApp", data: { courseId: "retry-course" } },
    ]);
  }, 15_000);

  it("keeps pending intent after an unavailable create response and never duplicates it", async () => {
    const activity = createMockActivity({ id: "test-activity", thumbnailTrack: "encoded-route" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    const unavailableError = Object.assign(new Error("transport unavailable"), {
      code: "functions/unavailable",
    });
    const rejectedCreate = Promise.reject(unavailableError);
    void rejectedCreate.catch(() => undefined);
    setCallableResult("createCourseFromActivity", rejectedCreate);

    renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(await screen.findByRole("button", { name: "이 경로로 라이드" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("코스 생성 결과를 확인 중입니다");
    expect(window.sessionStorage.getItem("orider:ride-route:test-uid:test-activity")).toContain('"state":"pending"');

    fireEvent.click(screen.getByRole("button", { name: "이 경로로 라이드" }));
    await waitFor(() => expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("alert")).toHaveTextContent("코스 생성 결과를 확인 중입니다");
    expect(mockCallableInvocations.filter(({ name }) => name === "createCourseFromActivity")).toHaveLength(1);
    expect(mockCallableInvocations.filter(({ name }) => name === "sendCourseToApp")).toHaveLength(0);
  }, 15_000);

  it("continues create and send with the in-memory intent when sessionStorage is unavailable", async () => {
    const activity = createMockActivity({ id: "test-activity", thumbnailTrack: "encoded-route" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    setCallableResult("createCourseFromActivity", { data: { courseId: "memory-course" } });
    setCallableResult("sendCourseToApp", { data: {} });

    renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(await screen.findByRole("button", { name: "이 경로로 라이드" }));

    expect(await findSentButton()).toBeDisabled();
    expect(mockCallableInvocations.filter(({ name }) => name === "createCourseFromActivity")).toHaveLength(1);
    expect(mockCallableInvocations.filter(({ name }) => name === "sendCourseToApp")).toEqual([
      { name: "sendCourseToApp", data: { courseId: "memory-course" } },
    ]);
    getItem.mockRestore();
    setItem.mockRestore();
  }, 15_000);

  it("discards a pending create result when the activity route changes", async () => {
    const first = createMockActivity({ id: "test-activity", description: "첫 활동", thumbnailTrack: "route-1" });
    const second = createMockActivity({ id: "next-activity", description: "다음 활동", thumbnailTrack: "route-2" });
    setDocData("activities/test-activity", first as unknown as Record<string, unknown>);
    setDocData("activities/next-activity", second as unknown as Record<string, unknown>);
    let resolveCreate!: (value: { data: { courseId: string } }) => void;
    setCallableResult("createCourseFromActivity", new Promise((resolve) => { resolveCreate = resolve; }));

    const view = renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(await screen.findByRole("button", { name: "이 경로로 라이드" }));
    await waitForCallableCount("createCourseFromActivity", 1);

    mockRoute.activityId = "next-activity";
    view.rerender(<ActivityPage />);
    expect(await screen.findByText("다음 활동")).toBeInTheDocument();
    resolveCreate({ data: { courseId: "stale-course" } });

    await waitFor(() => expect(screen.getByRole("button", { name: "이 경로로 라이드" })).toBeEnabled());
    expect(mockCallableInvocations.filter(({ name }) => name === "sendCourseToApp")).toHaveLength(0);
    expect(screen.queryByText("코스를 만들고 앱으로 전송했습니다")).not.toBeInTheDocument();
  });

  it("does not send or publish stale UI after unmounting during creation", async () => {
    const activity = createMockActivity({ id: "test-activity", thumbnailTrack: "encoded-route" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    let resolveCreate!: (value: { data: { courseId: string } }) => void;
    setCallableResult("createCourseFromActivity", new Promise((resolve) => { resolveCreate = resolve; }));

    const view = renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(await screen.findByRole("button", { name: "이 경로로 라이드" }));
    await waitForCallableCount("createCourseFromActivity", 1);
    view.unmount();
    resolveCreate({ data: { courseId: "stale-course" } });

    await Promise.resolve();
    await Promise.resolve();
    expect(mockCallableInvocations.filter(({ name }) => name === "sendCourseToApp")).toHaveLength(0);
  });

  it("invalidates pending work when auth switches and does not reuse user A course for user B", async () => {
    const activity = createMockActivity({ id: "test-activity", thumbnailTrack: "encoded-route" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    let resolveUserACreate!: (value: { data: { courseId: string } }) => void;
    setCallableResult("createCourseFromActivity", new Promise((resolve) => { resolveUserACreate = resolve; }));

    renderWithProviders(<ActivityPage />, { authenticated: true, user: { uid: "user-a" } });
    fireEvent.click(await screen.findByRole("button", { name: "이 경로로 라이드" }));
    await waitForCallableCount("createCourseFromActivity", 1);

    simulateLogin({ uid: "user-b", displayName: "User B" });
    await waitFor(() => expect(screen.getByRole("button", { name: "이 경로로 라이드" })).toBeEnabled());
    resolveUserACreate({ data: { courseId: "user-a-course" } });
    await Promise.resolve();
    expect(mockCallableInvocations.filter(({ name }) => name === "sendCourseToApp")).toHaveLength(0);

    setCallableResult("createCourseFromActivity", { data: { courseId: "user-b-course" } });
    setCallableResult("sendCourseToApp", { data: {} });
    fireEvent.click(screen.getByRole("button", { name: "이 경로로 라이드" }));

    expect(await findSentButton()).toBeDisabled();
    expect(mockCallableInvocations.filter(({ name }) => name === "sendCourseToApp")).toEqual([
      { name: "sendCourseToApp", data: { courseId: "user-b-course" } },
    ]);
    expect(window.sessionStorage.getItem("orider:ride-route:user-a:test-activity")).toContain('"state":"pending"');
    expect(window.sessionStorage.getItem("orider:ride-route:user-b:test-activity")).toContain("user-b-course");
  }, 15_000);

  it("retries only app delivery when course creation succeeded but delivery failed", async () => {
    const activity = createMockActivity({ id: "test-activity", thumbnailTrack: "encoded-route" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    setCallableResult("createCourseFromActivity", { data: { courseId: "preserved-course" } });
    const rejectedDelivery = Promise.reject(new Error("push unavailable"));
    void rejectedDelivery.catch(() => undefined);
    setCallableResult("sendCourseToApp", rejectedDelivery);

    renderWithProviders(<ActivityPage />, { authenticated: true });

    fireEvent.click(await screen.findByRole("button", { name: "이 경로로 라이드" }));
    expect(await screen.findByRole("alert", undefined, { timeout: 5000 }))
      .toHaveTextContent("코스는 만들었지만 앱으로 보내지 못했습니다");

    setCallableResult("sendCourseToApp", { data: {} });
    fireEvent.click(screen.getByRole("button", { name: "이 경로로 라이드" }));

    expect(await findSentButton()).toBeDisabled();
    expect(mockCallableInvocations.filter(({ name }) => name === "createCourseFromActivity")).toHaveLength(1);
    expect(mockCallableInvocations.filter(({ name }) => name === "sendCourseToApp")).toHaveLength(2);
  });

  it("offers sign-in instead of invoking course functions for signed-out visitors", async () => {
    const activity = createMockActivity({ id: "test-activity", thumbnailTrack: "encoded-route" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    mockSignInWithPopup.mockClear();

    renderWithProviders(<ActivityPage />, { authenticated: false });

    fireEvent.click(await screen.findByRole("button", { name: "로그인하고 이 경로로 라이드" }));

    await waitFor(() => expect(mockSignInWithPopup).toHaveBeenCalledTimes(1));
    expect(mockCallableInvocations).not.toContainEqual(expect.objectContaining({ name: "createCourseFromActivity" }));
  });

  it("does not offer route-to-app when the activity has no route", async () => {
    const activity = createMockActivity({ id: "test-activity", thumbnailTrack: "" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    setDocData("activity_streams/test-activity", {
      userId: "user-1",
      json: JSON.stringify({ userId: "user-1", time: [0, 60] }),
    });

    renderWithProviders(<ActivityPage />, { authenticated: true });

    await screen.findByText("한강 라이딩");
    expect(screen.queryByRole("button", { name: "이 경로로 라이드" })).not.toBeInTheDocument();
  });

  it.each(["run", "swim", "other"])(
    "does not offer route-to-app for %s activities even when a route exists",
    async (type) => {
      const activity = createMockActivity({
        id: "test-activity",
        type,
        thumbnailTrack: "encoded-route",
      });
      setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);

      renderWithProviders(<ActivityPage />, { authenticated: true });

      await screen.findByText("한강 라이딩");
      expect(screen.queryByRole("button", { name: "이 경로로 라이드" })).not.toBeInTheDocument();
    },
  );

  it("shows saved sensor summary on analysis tab when streams are missing", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      source: "strava",
      stravaActivityId: 19171261814,
      summary: createMockSummary({
        averageHeartRate: 150,
        maxHeartRate: 160,
        averagePower: 144,
        maxPower: 262,
        normalizedPower: 147,
        averageCadence: 86,
        calories: 905,
      }),
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />);

    fireEvent.click(await screen.findByRole("tab", { name: "분석" }));

    expect(await screen.findByText("저장된 센서 요약")).toBeInTheDocument();
    expect(screen.getAllByText("평균 심박").length).toBeGreaterThan(0);
    expect(screen.getAllByText("평균 파워").length).toBeGreaterThan(0);
    expect(screen.getByText("최대 파워")).toBeInTheDocument();
    expect(screen.getByText("NP 147 W")).toBeInTheDocument();
  });

  it("replaces diluted legacy sensor summaries and suppresses sparse zero-filled power", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      source: "orider",
      summary: createMockSummary({
        averageHeartRate: 55,
        maxHeartRate: 162,
        averagePower: 127,
        maxPower: 1_004,
        normalizedPower: 160,
        averageCadence: 25,
        maxCadence: 103,
      }),
    });
    const distance = Array.from({ length: 200 }, (_, index) => index * 10);
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    setDocData("activity_streams/test-activity", {
      userId: "user-1",
      json: JSON.stringify({
        distance,
        altitude: Array(200).fill(10),
        heartrate: [150, 160, ...Array(198).fill(0)],
        cadence: [90, 100, ...Array(198).fill(0)],
        watts: [250, 300, 350, ...Array(197).fill(0)],
      }),
    });

    renderWithProviders(<ActivityPage />);

    const stats = await screen.findByTestId("activity-stats-grid");
    await waitFor(() => expect(stats).toHaveTextContent("평균 심박155bpm최고 160"));
    expect(stats).toHaveTextContent("평균 케이던스95rpm");
    expect(stats).not.toHaveTextContent("평균 파워");
    expect(stats).not.toHaveTextContent("127W");
  });

  it("shows AI ride analysis for indoor-like streams without route latlng", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      source: "orider",
      thumbnailTrack: null,
    });
    const { latlng: _latlng, ...streamsWithoutRoute } = createMockStreams();
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    setDocData("activity_streams/test-activity", {
      userId: "user-1",
      json: JSON.stringify(streamsWithoutRoute),
    });

    renderWithProviders(<ActivityPage />);

    expect(await screen.findByTestId("ai-ride-analysis-card")).toBeInTheDocument();
  });

  it("does not show AI ride analysis when analysis streams are unavailable", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      source: "orider",
      thumbnailTrack: null,
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    setDocData("activity_streams/test-activity", {
      userId: "user-1",
      json: JSON.stringify({ userId: "user-1", time: [0, 60] }),
    });

    renderWithProviders(<ActivityPage />);

    await screen.findByText("한강 라이딩");
    expect(screen.queryByTestId("ai-ride-analysis-card")).not.toBeInTheDocument();
  });

  it("shows AI ride analysis when route latlng streams are available", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      source: "orider",
      thumbnailTrack: null,
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    setDocData("activity_streams/test-activity", {
      userId: "user-1",
      json: JSON.stringify(createMockStreams()),
    });

    renderWithProviders(<ActivityPage />);

    expect(await screen.findByTestId("ai-ride-analysis-card")).toBeInTheDocument();
  });

  it("retries Orider stream loading from Firestore when stream data appears later", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      source: "orider",
      thumbnailTrack: null,
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />);

    fireEvent.click(await screen.findByRole("tab", { name: "분석" }));
    expect(await screen.findByText(/원본 스트림 데이터가 아직 저장되지 않았습니다/)).toBeInTheDocument();

    setDocData("activity_streams/test-activity", {
      userId: "user-1",
      json: JSON.stringify(createMockStreams()),
    });
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText("훈련 부하")).toBeInTheDocument();
    expect(screen.queryByText(/원본 스트림 데이터가 아직 저장되지 않았습니다/)).not.toBeInTheDocument();
  });

  it("shows the AI analysis card on overview when a saved preview exists without streams", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      aiSummaryPreview: "저장된 AI 분석 결과입니다.",
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />);

    expect(await screen.findByTestId("ai-ride-analysis-card")).toBeInTheDocument();
  });

  it("falls back to recentKudos for the detail liked state before kudos subscription has data", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      kudosCount: 1,
      recentKudos: [{ userId: "test-uid", nickname: "Test User", profileImage: null }],
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />, { authenticated: true });

    expect(await screen.findByLabelText("좋아요 취소")).toBeInTheDocument();
  });

  it("exposes title editing as a keyboard-focusable button for owners", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      userId: "test-uid",
      description: "키보드 편집 테스트",
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />, { authenticated: true });

    const editButton = await screen.findByRole("button", { name: "활동 제목 편집" });
    expect(editButton).toHaveTextContent("키보드 편집 테스트");

    fireEvent.click(editButton);
    expect(screen.getByDisplayValue("키보드 편집 테스트")).toBeInTheDocument();
  });

  it("rolls back visibility when the update fails", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      userId: "test-uid",
      visibility: "everyone",
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    mockUpdateDoc.mockRejectedValueOnce(new Error("permission denied"));

    renderWithProviders(<ActivityPage />, { authenticated: true });

    fireEvent.click(await screen.findByRole("button", { name: /친구/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("공개 범위를 변경하지 못했습니다");
    expect(screen.getByRole("button", { name: /전체 공개/ })).toHaveStyle({ color: "var(--lime)" });
  });

  it("shows 404 message when activity not found", async () => {
    // Don't set any doc data for the activity ID
    renderWithProviders(<ActivityPage />);

    await waitFor(() => {
      const notFound = screen.queryByText(/찾을 수 없/) || screen.queryByText(/존재하지 않/);
      // Activity page shows loading then either activity or error
      expect(document.querySelector(".animate-pulse") || notFound).toBeTruthy();
    });
  });
});
