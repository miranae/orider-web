import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockActivity, createMockSummary } from "../__tests__/fixtures/mockData";
import { setCollectionDocs } from "../__tests__/mocks/firebase";
import { useGroupRides } from "./useGroupRides";

describe("useGroupRides", () => {
  it("keeps grouped rides when one activity is missing summary", async () => {
    setCollectionDocs("activities", [
      {
        id: "activity-a",
        ...createMockActivity({
          id: "activity-a",
          userId: "member-a",
          groupRideId: "ride-1",
          summary: createMockSummary({ distance: 12_000 }),
        }),
      },
      {
        id: "activity-b",
        ...createMockActivity({
          id: "activity-b",
          userId: "member-b",
          groupRideId: "ride-1",
        }),
        summary: undefined,
      },
    ]);

    const { result } = renderHook(() => useGroupRides(["member-a", "member-b"]));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.rides).toHaveLength(1);
    expect(result.current.rides[0]?.totalDistance).toBe(12_000);
  });
});
