import { describe, expect, it } from "vitest";
import { loadPrivateSnapshotLocations, loadPrivateSnapshotWithRetry } from "./privateSnapshotPages";

describe("private event snapshot pages", () => {
  it("keeps the inline snapshot contract", async () => {
    await expect(loadPrivateSnapshotLocations({ locations: ["one"] }, async () => [])).resolves.toEqual(["one"]);
  });

  it("reads every immutable page in manifest order", async () => {
    const read: string[] = [];
    const locations = await loadPrivateSnapshotLocations(
      { storage: "pages", pageIds: ["rev_0", "rev_1"], locationCount: 3 },
      async (id) => { read.push(id); return id === "rev_0" ? ["one", "two"] : ["three"]; },
    );
    expect(read).toEqual(["rev_0", "rev_1"]);
    expect(locations).toEqual(["one", "two", "three"]);
  });

  it("rejects incomplete pages instead of displaying partial positions", async () => {
    await expect(loadPrivateSnapshotLocations(
      { storage: "pages", pageIds: ["rev_0", "rev_1"], locationCount: 2 },
      async () => ["one"].slice(0, 0),
    )).rejects.toThrow("수 불일치");
    await expect(loadPrivateSnapshotLocations(
      { storage: "pages", pageIds: ["rev_0", "rev_1"], locationCount: 2 },
      async (id) => { if (id === "rev_1") throw new Error("페이지 누락"); return ["one"]; },
    )).rejects.toThrow("페이지 누락");
  });

  it("retries the current manifest when an old page loses read access", async () => {
    const result = await loadPrivateSnapshotWithRetry(
      { storage: "pages" as const, pageIds: ["old_0"], locationCount: 1 },
      async (id) => { if (id === "old_0") throw new Error("permission-denied"); return ["new"]; },
      async () => ({ storage: "pages" as const, pageIds: ["new_0"], locationCount: 1 }),
    );
    expect(result.snapshot.pageIds).toEqual(["new_0"]);
    expect(result.locations).toEqual(["new"]);
  });
});
