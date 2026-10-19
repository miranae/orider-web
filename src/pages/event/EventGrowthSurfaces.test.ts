import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(join(process.cwd(), "src/pages/event", name), "utf8");

describe("event growth contract surfaces", () => {

  it("reads the canonical Firestore live snapshot at the server cadence", () => {
    const source = read("EventLivePage.tsx");
    expect(source).toContain('doc(firestore, "events", eventId, "snapshots", "public_latest")');
    expect(source).toContain("}, 60000);");
    expect(source).not.toContain("snapshots/${eventId}/latest.json");
    expect(source).not.toContain("getStorage");
  });
});
