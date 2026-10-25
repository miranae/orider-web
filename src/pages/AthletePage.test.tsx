import * as activityAcceptance from "../utils/estimateTSS";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import AthletePage from "./AthletePage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { orderBy } from "firebase/firestore";
import { setDocData, setCollectionDocs } from "../__tests__/mocks/firebase";
import { createMockProfile, createMockActivity, createMockSummary } from "../__tests__/fixtures/mockData";

// Mock heavy components
vi.mock("../components/RouteMap", () => ({
  default: () => <div data-testid="route-map">Map</div>,
}));
vi.mock("../components/WeeklyChart", () => ({
  default: ({ onPeriodSelect }: { onPeriodSelect?: (period: string) => void }) => <div data-testid="weekly-chart"><button onClick={() => onPeriodSelect?.("2026.09")}>Select September</button></div>,
}));

// Mock useParams
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useParams: () => ({ userId: "athlete-1" }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

describe("AthletePage", () => {
  it("검색 입력만 바뀌면 전체 이력 대표를 다시 계산하지 않는다", async () => {
    const acceptance = vi.spyOn(activityAcceptance, "acceptedPhysicalActivities");
    setCollectionDocs("activities", [{id: "memo-ride", ...createMockActivity({id: "memo-ride", userId: "athlete-1"})}]);
    renderWithProviders(<AthletePage />);
    const input = await screen.findByPlaceholderText("활동 검색... (Enter)");
    await waitFor(() => expect(screen.getByText("한강 라이더")).toBeInTheDocument());
    const count = acceptance.mock.calls.length;
    fireEvent.change(input, {target: {value: "a"}});
    fireEvent.change(input, {target: {value: "ab"}});
    expect(acceptance.mock.calls.length).toBe(count);
    acceptance.mockRestore();
  });

  it("shows shared activity feed cards on the own profile while preserving full-history totals and a log destination", async () => {
    setCollectionDocs("activities", Array.from({length: 5}, (_, index) => ({id: `preview-${index}`, ...createMockActivity({
      id: `preview-${index}`, userId: "athlete-1", description: `Overview activity ${index}`, startTime: Date.UTC(2026, 8, index + 1), endTime: Date.UTC(2026, 8, index + 1, 1),
    })})));
    renderWithProviders(<AthletePage />, {authenticated: true, user: {uid: "athlete-1"}});
    await waitFor(() => expect(screen.getAllByTestId("H1-2-1")).toHaveLength(5));
    expect(screen.getByText("5회")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("활동 검색... (Enter)")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("P0-2-1")).getByRole("link", {name: "전체보기"})).toHaveAttribute("href", "/ko/athlete/me/activities");
    expect(within(screen.getAllByTestId("H1-2-1")[0]!).getByRole("link", {name: "Overview activity 0"})).toHaveAttribute("href", "/ko/activity/preview-0");
  });

  it("filters the feed by the selected chart period and restores recent activities", async () => {
    setCollectionDocs("activities", [
      { id: "sep", ...createMockActivity({ id: "sep", userId: "athlete-1", description: "September ride", startTime: new Date(2026, 8, 15).getTime(), endTime: new Date(2026, 8, 15, 2).getTime() }) },
      { id: "oct", ...createMockActivity({ id: "oct", userId: "athlete-1", description: "October ride", startTime: new Date(2026, 9, 15).getTime(), endTime: new Date(2026, 9, 15, 2).getTime() }) },
    ]);
    renderWithProviders(<AthletePage />);
    await screen.findByRole("button", { name: "Select September" });
    fireEvent.click(screen.getByRole("button", { name: "Select September" }));
    await waitFor(() => expect(screen.getAllByTestId("H1-2-1")).toHaveLength(1));
    expect(screen.getByRole("link", { name: "September ride" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "October ride" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전체 최근 활동으로 돌아가기" }));
    await waitFor(() => expect(screen.getAllByTestId("H1-2-1")).toHaveLength(2));
  });

  it("finds older sport and source matches beyond the first activity page", async () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({ id: `bike-${index}`, ...createMockActivity({ id: `bike-${index}`, userId: "athlete-1", type: "Ride", source: "orider", startTime: new Date(2026, 8, index + 1).getTime(), endTime: new Date(2026, 8, index + 1, 2).getTime() }) }));
    rows.push({ id: "older-run", ...createMockActivity({ id: "older-run", userId: "athlete-1", type: "Run", source: "strava", description: "Older run", startTime: new Date(2026, 7, 1).getTime(), endTime: new Date(2026, 7, 1, 2).getTime() }) });
    setCollectionDocs("activities", rows);
    renderWithProviders(<AthletePage />);
    await screen.findByLabelText("종목");
    fireEvent.change(screen.getByLabelText("종목"), { target: { value: "run" } });
    expect(await screen.findByRole("link", { name: "Older run" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("종목"), { target: { value: "all" } });
    fireEvent.click(within(screen.getByTestId("P0-2-1")).getByRole("button", { name: "Strava" }));
    await waitFor(() => expect(screen.getAllByTestId("H1-2-1")).toHaveLength(1));
    expect(screen.getByRole("link", { name: "Older run" })).toBeInTheDocument();
  });

  it("clears source and search draft when moving from another athlete to the own profile", async () => {
    setDocData("users_public/current-user", createMockProfile({ nickname: "Current rider" }));
    setCollectionDocs("activities", [{ id: "mine", ...createMockActivity({ id: "mine", userId: "current-user", source: "orider", description: "My recorded ride" }) }]);
    const view = renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "current-user" } });
    fireEvent.change(await screen.findByLabelText("검색"), { target: { value: "old draft" } });
    fireEvent.click(within(screen.getByTestId("P0-2-1")).getByRole("button", { name: "Strava" }));
    view.rerender(<AthletePage meUserId="current-user" />);
    expect(await screen.findByRole("link", { name: "My recorded ride" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("old draft")).not.toBeInTheDocument();
  });

  beforeEach(() => {
    const profile = createMockProfile({ nickname: "한강 라이더" });
    setDocData("users/athlete-1", { ...profile });
    setDocData("users_public/athlete-1", { ...profile });
  });

  it("shows profile nickname", async () => {
    renderWithProviders(<AthletePage />);
    await waitFor(() => {
      expect(screen.getByText("한강 라이더")).toBeInTheDocument();
    });
  });

  it("shows avatar for the athlete", async () => {
    const profile = createMockProfile({ nickname: "라이더", photoURL: "https://example.com/p.jpg" });
    setDocData("users/athlete-1", { ...profile });
    setDocData("users_public/athlete-1", { ...profile });
    renderWithProviders(<AthletePage />);
    await waitFor(() => {
      expect(screen.getByText("라이더")).toBeInTheDocument();
    });
  });

  it("shows activities for the athlete", async () => {
    setCollectionDocs("activities", [
      { id: "a1", ...createMockActivity({ userId: "athlete-1", description: "아침 라이딩" }) },
    ]);
    renderWithProviders(<AthletePage />);
    await waitFor(() => {
      const content = document.body.textContent ?? "";
      expect(content.includes("한강 라이더") || content.includes("활동")).toBeTruthy();
    });
  });

  it("requests the athlete activity list ordered by ride time", async () => {
    // 목록 순서는 업로드 시각(createdAt)이 아니라 실제 운동 시각 기준이어야 카드에 찍힌
    // 날짜와 순서가 맞는다. 더보기(startAfter)도 같은 정렬키를 전제로 한다.
    // (같은 페이지의 세그먼트 목록은 createdAt 정렬이라 여기서 단정하지 않는다.)
    vi.mocked(orderBy).mockClear();
    setCollectionDocs("activities", [
      { id: "a1", ...createMockActivity({ userId: "athlete-1" }) },
    ]);

    renderWithProviders(<AthletePage />);

    await waitFor(() => expect(orderBy).toHaveBeenCalledWith("startTime", "desc"));
  });

  it("uses public activity aggregates for other athletes instead of private profile totals", async () => {
    const profile = createMockProfile({
      nickname: "한강 라이더",
      stats: {
        activityCount: 3745,
        totalDistance: 180_987_647,
        totalRidingTime: 30_911_553_000,
        totalElevationGain: 2_101_586,
      },
    });
    setDocData("users_public/athlete-1", { ...profile });
    setCollectionDocs("activities", [
      {
        id: "public-1",
        ...createMockActivity({
          id: "public-1", startTime: Date.UTC(2026, 8, 1, 10), endTime: Date.UTC(2026, 8, 1, 12),
          userId: "athlete-1",
          visibility: "everyone",
          summary: { distance: 10_000, ridingTimeMillis: 1_000_000, elevationGain: 100 },
        }),
      },
      {
        id: "public-2",
        ...createMockActivity({
          id: "public-2", startTime: Date.UTC(2026, 8, 2, 10), endTime: Date.UTC(2026, 8, 2, 12),
          userId: "athlete-1",
          visibility: "everyone",
          summary: { distance: 20_000, ridingTimeMillis: 2_000_000, elevationGain: 200 },
        }),
      },
      {
        id: "public-3",
        ...createMockActivity({
          id: "public-3", startTime: Date.UTC(2026, 8, 3, 10), endTime: Date.UTC(2026, 8, 3, 12),
          userId: "athlete-1",
          visibility: "everyone",
          summary: { distance: 30_000, ridingTimeMillis: 3_000_000, elevationGain: 300 },
        }),
      },
    ]);

    renderWithProviders(<AthletePage />, {
      authenticated: true,
      user: { uid: "current-user" },
    });

    await waitFor(() => {
      expect(screen.getByText("공개 활동")).toBeInTheDocument();
      expect(screen.getByText("3회")).toBeInTheDocument();
    });
    expect(screen.queryByText("3745회")).not.toBeInTheDocument();
  });

  it("computes own profile stats from activities using display duration", async () => {
    const profile = createMockProfile({
      nickname: "한강 라이더",
      stats: {
        activityCount: 999,
        totalDistance: 999_000_000,
        totalRidingTime: 100 * 60 * 60 * 1000,
        totalElevationGain: 999_000,
      },
    });
    setDocData("users_public/athlete-1", { ...profile });
    setCollectionDocs("activities", [
      {
        id: "own-1",
        ...createMockActivity({
          id: "own-1", startTime: Date.UTC(2026, 8, 4, 10), endTime: Date.UTC(2026, 8, 4, 12),
          userId: "athlete-1",
          visibility: "private",
          summary: createMockSummary({
            distance: 10_000,
            ridingTimeMillis: 2 * 60 * 60 * 1000,
            movingTimeSec: 60 * 60,
            pauseTimeSec: 60 * 60,
            elevationGain: 100,
          }),
        }),
      },
      {
        id: "own-2",
        ...createMockActivity({
          id: "own-2", startTime: Date.UTC(2026, 8, 5, 10), endTime: Date.UTC(2026, 8, 5, 12),
          userId: "athlete-1",
          visibility: "everyone",
          summary: createMockSummary({
            distance: 20_000,
            ridingTimeMillis: 30 * 60 * 1000,
            elevationGain: 200,
          }),
        }),
      },
    ]);

    renderWithProviders(<AthletePage />, {
      authenticated: true,
      user: { uid: "athlete-1", displayName: "한강 라이더" },
    });

    await waitFor(() => {
      expect(screen.getByText("2회")).toBeInTheDocument();
      expect(screen.getByText("1시간").parentElement).toHaveTextContent("1시간 30분");
    });
    expect(screen.queryByText("999회")).not.toBeInTheDocument();
    expect(screen.queryByText("100h 0m")).not.toBeInTheDocument();
  });

  it("keeps known total hours when legacy activities have no duration", async () => {
    setCollectionDocs("activities", [
      { id: "legacy", ...createMockActivity({ userId: "athlete-1", summary: { distance: 1000, elevationGain: 10 } as never }) },
      { id: "timed", ...createMockActivity({ userId: "athlete-1", summary: createMockSummary({ ridingTimeMillis: 3600000 }) }) },
    ]);
    renderWithProviders(<AthletePage />);
    await waitFor(() => expect(screen.getAllByText("1h 0m").length).toBeGreaterThan(0));
    expect(screen.queryByText("NaNm")).not.toBeInTheDocument();
  });

  it("shows friend action button for other users", async () => {
    renderWithProviders(<AthletePage />, {
      authenticated: true,
      user: { uid: "current-user" },
    });
    await waitFor(() => {
      const content = document.body.textContent ?? "";
      expect(
        content.includes("친구") ||
        content.includes("요청") ||
        content.includes("추가"),
      ).toBeTruthy();
    });
  });

  it("restricts private profiles for non-friends", async () => {
    const profile = createMockProfile({ nickname: "비공개 라이더", profilePublic: false });
    setDocData("users_public/athlete-1", { ...profile });
    setCollectionDocs("friends/athlete-1/users", [
      { id: "friend-1", userId: "friend-1", nickname: "숨김 친구", profileImage: null },
    ]);

    renderWithProviders(<AthletePage />, {
      authenticated: true,
      user: { uid: "current-user" },
    });

    await waitFor(() => {
      expect(screen.getByText("비공개 프로필입니다")).toBeInTheDocument();
    });
    expect(screen.queryByText("숨김 친구")).not.toBeInTheDocument();
    expect(screen.queryByText(/친구 \(/)).not.toBeInTheDocument();
  });

  it("hides the friend request button when requests are disabled", async () => {
    const profile = createMockProfile({
      nickname: "요청 차단 라이더",
      friendRequestsAllowed: false,
    });
    setDocData("users_public/athlete-1", { ...profile });

    renderWithProviders(<AthletePage />, {
      authenticated: true,
      user: { uid: "current-user" },
    });

    await waitFor(() => {
      expect(screen.getByText("요청 차단 라이더")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "친구 요청" })).not.toBeInTheDocument();
  });

  it("does not show friend action for own profile", async () => {
    renderWithProviders(<AthletePage />, {
      authenticated: true,
      user: { uid: "athlete-1", displayName: "한강 라이더" },
    });
    await waitFor(() => {
      expect(screen.getByText("한강 라이더")).toBeInTheDocument();
    });
  });
});

it("retains distinct native references in the profile cover despite empty URL fields", async () => {
  const { activityFeedSourceRevision } = await import("../services/activityFeedContent");
  const activity = createMockActivity({id:"native-photo-ride",userId:"athlete-1",source:"orider"});
  setCollectionDocs("activities", [{...activity,feedContentV1:{version:1,revision:"photo-rev",sourceRevision:activityFeedSourceRevision(activity),memo:null,totalPhotoCount:2,comments:[],photos:[
    {id:"one",url:"",caption:null,nativePhoto:{activityId:activity.id,photoId:"one"}},
    {id:"two",url:"",caption:null,nativePhoto:{activityId:activity.id,photoId:"two"}},
  ]}}]);
  const view = renderWithProviders(<AthletePage />, {authenticated:true,user:{uid:"athlete-1"}});
  await waitFor(() => expect(view.container.querySelectorAll(".athlete-cover .athlete-photo-trigger")).toHaveLength(2));
});
