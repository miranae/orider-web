import { fireEvent, screen, waitFor } from "@testing-library/react";
import { setCallableImplementation, setDocData } from "../__tests__/mocks/firebase";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import CreateCoursePage from "./CreateCoursePage";
vi.mock("../components/course/RouteBuilderMap", () => ({ default: () => <div>Builder map</div> }));
vi.mock("../components/RouteMap", () => ({ default: () => null }));
vi.mock("../components/ElevationChart", () => ({ default: () => null }));

it("leads the 'select an activity first' message to my activity list without adding a button", async () => {
  renderWithProviders(<CreateCoursePage />, { authenticated: true, route: "/ko/course/create?mode=section" });
  const link = await screen.findByRole("link", { name: "활동을 선택한 후 코스를 만들 수 있습니다." });
  expect(link).toHaveAttribute("href", "/ko/athlete/me/activities");
});

it("reloads activity streams when the load-failure message is tapped, but keeps 'no GPS' as plain text", async () => {
  setDocData("activities/ride-1", { userId: "test-uid", description: "코스 활동", startTime: 1700000000000 });
  let calls = 0;
  setCallableImplementation("getActivityStreamsForSegment", () => {
    calls += 1;
    if (calls === 1) throw new Error("offline");
    return { data: { latlng: [] } };
  });
  renderWithProviders(<CreateCoursePage />, { authenticated: true, route: "/ko/course/create?activityId=ride-1" });
  const failure = await screen.findByText("스트림 로드 실패: offline");
  expect(failure.closest("button")).not.toBeNull();
  fireEvent.click(failure);
  await waitFor(() => expect(calls).toBe(2));
  const noGps = await screen.findByText("이 활동에 GPS 데이터가 없습니다");
  expect(noGps.closest("button")).toBeNull();
});
