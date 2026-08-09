import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { ActivityZoneTimeline } from "./ActivityZoneTimeline";

describe("ActivityZoneTimeline", () => {
  it("renders the shared zone timeline from activity-detail sensor inputs", () => {
    renderWithProviders(
      <ActivityZoneTimeline
        streams={{
          time: [0, 10],
          watts: [100, 500],
          ftp: 300,
        } as never}
        summary={{ movingTimeSec: 20, elapsedTimeMillis: 20_000 } as never}
        sport="ride"
        isOwner={false}
      />,
    );

    expect(screen.getByRole("region", { name: "존 타임라인" })).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /Z7$/ })[0]).toHaveStyle({ background: "var(--violet)" });
  });
});
