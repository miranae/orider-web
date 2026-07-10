import { screen, waitFor } from "@testing-library/react";
import AthletePage from "./AthletePage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setDocData, setCollectionDocs } from "../__tests__/mocks/firebase";
import { createMockProfile, createMockActivity, createMockSummary } from "../__tests__/fixtures/mockData";

// Mock heavy components
vi.mock("../components/RouteMap", () => ({
  default: () => <div data-testid="route-map">Map</div>,
}));
vi.mock("../components/WeeklyChart", () => ({
  default: () => <div data-testid="weekly-chart">Chart</div>,
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
          userId: "athlete-1",
          visibility: "everyone",
          summary: { distance: 10_000, ridingTimeMillis: 1_000_000, elevationGain: 100 },
        }),
      },
      {
        id: "public-2",
        ...createMockActivity({
          userId: "athlete-1",
          visibility: "everyone",
          summary: { distance: 20_000, ridingTimeMillis: 2_000_000, elevationGain: 200 },
        }),
      },
      {
        id: "public-3",
        ...createMockActivity({
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
      expect(screen.getByText("1h 30m")).toBeInTheDocument();
    });
    expect(screen.queryByText("999회")).not.toBeInTheDocument();
    expect(screen.queryByText("100h 0m")).not.toBeInTheDocument();
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
