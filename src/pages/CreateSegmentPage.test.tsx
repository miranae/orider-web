import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockSignInWithPopup, resetAllMocks, setCollectionDocs } from "../__tests__/mocks/firebase";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import CreateSegmentPage from "./CreateSegmentPage";

describe("CreateSegmentPage", () => {
  beforeEach(() => {
    resetAllMocks();
    mockSignInWithPopup.mockClear();
  });

  it("shows a sign-in CTA instead of redirecting signed-out visitors", async () => {
    renderWithProviders(<CreateSegmentPage />, {
      authenticated: false,
      route: "/segment/create",
    });

    expect(await screen.findByText("로그인 후 세그먼트를 만들 수 있습니다")).toBeInTheDocument();
    expect(screen.getByText("내 활동에서 구간을 선택해야 하므로 먼저 로그인해 주세요.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Google 로그인" }));

    expect(mockSignInWithPopup).toHaveBeenCalledTimes(1);
  });

  it("lets signed-in users choose an activity when activityId is missing", async () => {
    setCollectionDocs("activities", [
      {
        id: "ride-1",
        userId: "test-uid",
        deletedAt: null,
        description: "남산 리커버리",
        startTime: new Date("2026-07-01T09:00:00Z").getTime(),
        summary: {
          distance: 12400,
          ridingTimeMillis: 2_400_000,
          elevationGain: 320,
        },
        thumbnailTrack: "",
      },
    ]);

    renderWithProviders(<CreateSegmentPage />, {
      authenticated: true,
      route: "/segment/create",
    });

    expect(await screen.findByText("세그먼트는 GPS 활동의 일부 구간으로 만듭니다. 먼저 기준이 될 활동을 선택하세요.")).toBeInTheDocument();
    const activityLink = await screen.findByText("남산 리커버리");

    expect(activityLink.closest("a")?.getAttribute("href")).toMatch(/\/segment\/create\?activityId=ride-1$/);
    expect(screen.queryByText("활동을 선택한 후 세그먼트를 만들 수 있습니다.")).not.toBeInTheDocument();
  });
});
