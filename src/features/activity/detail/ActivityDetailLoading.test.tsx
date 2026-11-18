import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import type { PublicActivityDetail } from "../../../services/publicActivityDetail";
import ActivityDetailLoading from "./ActivityDetailLoading";

const activity: PublicActivityDetail["activity"] = {
  id: "ride",
  userId: "owner",
  nickname: "Rider",
  profileImage: null,
  description: "Morning ride",
  type: "RIDE",
  startTime: 0,
  endTime: 3_600_000,
  kudosCount: 0,
  commentCount: 0,
  summary: { distance: 99000, movingTimeSec: 3600 },
  effectiveFacts: { status: "ready", metrics: { distanceKm: 12, durationSec: 600 } },
};

it("uses server metrics when available and leaves missing metrics blank", () => {
  const view = renderWithProviders(<ActivityDetailLoading activity={activity} />);
  expect(screen.getByText("12.0km")).toBeInTheDocument();
  expect(screen.getByText("00:10:00")).toBeInTheDocument();

  view.rerender(<ActivityDetailLoading activity={{ ...activity, effectiveFacts: { status: "pending", metrics: null } }} />);
  expect(screen.getByRole("heading", { name: "Morning ride" })).toBeInTheDocument();
  expect(screen.queryByText(/(?:12|99)\.0km|00:10:00|01:00:00/)).not.toBeInTheDocument();
});
