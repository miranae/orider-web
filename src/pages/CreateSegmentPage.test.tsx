import { fireEvent, screen, waitFor } from "@testing-library/react";
import { getDocs } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockSignInWithPopup, resetAllMocks, setCallableImplementation, setCollectionDocs, setDocData } from "../__tests__/mocks/firebase";
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

    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    fireEvent.click(await screen.findByTestId("A1-1-1"));

    expect(mockSignInWithPopup).toHaveBeenCalledTimes(1);
  });

  it.each(["", "   ", undefined])("shows a meaningful picker title for blank description %s", async description => {
    setCollectionDocs("activities", [{ id: "unnamed", userId: "test-uid", deletedAt: null, description, startTime: 1700000000000, summary: {distance:1000,ridingTimeMillis:600000,elevationGain:20} }]);
    renderWithProviders(<CreateSegmentPage />, {authenticated:true,route:"/segment/create"});
    const title = await screen.findByText("이름 없는 활동");
    expect(title.closest("a")).toHaveAttribute("href","/ko/segment/create?activityId=unnamed");
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

  it("re-reads the activity picker when its failure message itself is tapped", async () => {
    setCollectionDocs("activities", [{ id: "ride-1", userId: "test-uid", deletedAt: null, description: "다시 읽은 활동", startTime: 1700000000000, summary: { distance: 1000, ridingTimeMillis: 600000, elevationGain: 20 } }]);
    vi.mocked(getDocs).mockRejectedValueOnce(new Error("offline"));
    renderWithProviders(<CreateSegmentPage />, { authenticated: true, route: "/segment/create" });
    const failure = await screen.findByText("활동 목록을 불러오지 못했습니다");
    expect(failure.closest("button")).not.toBeNull();
    fireEvent.click(failure);
    expect(await screen.findByText("다시 읽은 활동")).toBeInTheDocument();
  });

  it("reloads streams when the load-failure message is tapped, but keeps 'no GPS' as plain text", async () => {
    setDocData("activities/ride-1", { userId: "test-uid", description: "스트림 활동", startTime: 1700000000000 });
    let calls = 0;
    setCallableImplementation("getActivityStreamsForSegment", () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("boom"), { code: "functions/unavailable" });
      return { data: { latlng: [] } };
    });
    renderWithProviders(<CreateSegmentPage />, { authenticated: true, route: "/segment/create?activityId=ride-1" });
    const failure = await screen.findByText(/스트림 로드 실패/);
    expect(failure.closest("button")).not.toBeNull();
    fireEvent.click(failure);
    await waitFor(() => expect(calls).toBe(2));
    const noGps = await screen.findByText("이 활동에 GPS 데이터가 없습니다");
    expect(noGps.closest("button")).toBeNull();
  });
});
