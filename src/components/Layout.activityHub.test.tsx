import { useEffect } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Route,
  Routes,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";
import Layout, { type LayoutOutletContext } from "./Layout";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";

const owners: Record<string, string | undefined> = {
  mine: "viewer",
  theirs: "other",
};

function ActivityOwnerProbe() {
  const { activityId } = useParams<{ activityId: string }>();
  const { setActivityOwner } = useOutletContext<LayoutOutletContext>();
  const navigate = useNavigate();
  const ownerId = activityId ? owners[activityId] ?? null : null;

  useEffect(() => {
    setActivityOwner(activityId && ownerId ? { activityId, ownerId } : null);
    return () => setActivityOwner(null);
  }, [activityId, ownerId, setActivityOwner]);

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
  const tabBar = screen.getByRole("tablist", { name: "메인 내비게이션" });
  return within(tabBar).getByRole("tab", { selected: true });
}

describe("Layout activity hub ownership", () => {
  it("직접 연 타인 활동은 홈 탭을 활성화한다", async () => {
    renderWithProviders(<ActivityHubRoutes />, {
      route: "/activity/theirs",
      authenticated: true,
      user: { uid: "viewer" },
    });

    await waitFor(() => expect(selectedMobileTab()).toHaveTextContent("홈"));
  });

  it("본인 활동에서 타인 활동으로 전환하면 내 운동 선택을 해제한다", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ActivityHubRoutes />, {
      route: "/activity/mine",
      authenticated: true,
      user: { uid: "viewer" },
    });

    await waitFor(() => expect(selectedMobileTab()).toHaveTextContent("내 운동"));
    await user.click(screen.getByRole("button", { name: "다른 사람 활동으로 이동" }));
    await waitFor(() => expect(selectedMobileTab()).toHaveTextContent("홈"));
  });
});
