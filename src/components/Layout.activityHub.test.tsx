import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import Layout from "./Layout";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";

function ActivityOwnerProbe() {
  const navigate = useNavigate();

  return (
    <button type="button" onClick={() => navigate("/activity/theirs")}>
      다른 사람 활동으로 이동
    </button>
  );
}

function ActivityHubRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="activity/:activityId" element={<ActivityOwnerProbe />} />
      </Route>
    </Routes>
  );
}

function selectedMobileTab() {
  const tabBar = screen.getByRole("navigation", { name: "메인 내비게이션" });
  return within(tabBar).getByRole("link", { current: "page" });
}

describe("Layout activity hub", () => {
  it("직접 연 타인 활동은 홈 탭을 활성화한다", async () => {
    renderWithProviders(<ActivityHubRoutes />, {
      route: "/activity/theirs",
      authenticated: true,
      user: { uid: "viewer" },
    });

    await waitFor(() => expect(selectedMobileTab()).toHaveTextContent("홈"));
  });

  it("본인 활동과 타인 활동 전환 모두 홈을 유지한다", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ActivityHubRoutes />, {
      route: "/activity/mine",
      authenticated: true,
      user: { uid: "viewer" },
    });

    await waitFor(() => expect(selectedMobileTab()).toHaveTextContent("홈"));
    await user.click(screen.getByRole("button", { name: "다른 사람 활동으로 이동" }));
    await waitFor(() => expect(selectedMobileTab()).toHaveTextContent("홈"));
  });
});
