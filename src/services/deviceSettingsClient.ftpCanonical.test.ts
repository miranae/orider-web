import { describe, expect, it } from "vitest";

import { preserveCanonicalFtpCache } from "./deviceSettingsClient";

describe("preserveCanonicalFtpCache", () => {
  it("keeps the latest document FTP while applying another settings edit", () => {
    const next = JSON.stringify({ ftpWatts: 200, maxHeartRate: 190 });
    const current = JSON.stringify({ ftpWatts: 280, maxHeartRate: 180 });

    expect(JSON.parse(preserveCanonicalFtpCache(next, current))).toEqual({
      ftpWatts: 280,
      maxHeartRate: 190,
    });
  });

  it("does not invent an FTP cache for a new or malformed document", () => {
    const next = JSON.stringify({ ftpWatts: 200, maxHeartRate: 190 });

    expect(JSON.parse(preserveCanonicalFtpCache(next, undefined))).toEqual({
      maxHeartRate: 190,
    });
    expect(JSON.parse(preserveCanonicalFtpCache(next, "not-json"))).toEqual({
      maxHeartRate: 190,
    });
  });
});
