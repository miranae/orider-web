import { describe, expect, it } from "vitest";
import { filterExportableActivities } from "./useExport";

describe("filterExportableActivities", () => {
  it("drops partial activity docs without summary so one bad record cannot fail the export", () => {
    const activities = [
      { id: "ok", summary: { distance: 1000 } },
      { id: "partial" },
      { id: "null-summary", summary: null },
    ];

    expect(filterExportableActivities(activities).map((activity) => activity.id)).toEqual(["ok"]);
  });
});
