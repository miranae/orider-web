import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("PaneDevice canonical FTP contract", () => {
  it("reads profile FTP and sends edits through the canonical command", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/settings/PaneDevice.tsx"),
      "utf8",
    );

    expect(source).toContain('updateCanonicalFtp(uid, draft.ftpWatts, "manual")');
    expect(source).toContain('typeof profile?.ftp === "number" ? `${profile.ftp} W` : "-"');
    expect(source).not.toContain("ftpWatts: riderDraft.ftpWatts");
  });
});
