import { describe, expect, it } from "vitest";
import { localStravaSummaryPreviewUrl } from "./stravaSummaryPreview";

describe("local Strava preview transport guard", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])("allows an HTTP loopback preview only on a DEV loopback page (%s)", hostname => {
    expect(localStravaSummaryPreviewUrl(true, hostname, "http://127.0.0.1:8787/stravaSummaryPreview")).toBe("http://127.0.0.1:8787/stravaSummaryPreview");
  });
  it.each([
    [false, "localhost", "http://127.0.0.1:8787/stravaSummaryPreview"],
    [true, "orider.co.kr", "http://127.0.0.1:8787/stravaSummaryPreview"],
    [true, "localhost.evil.test", "http://127.0.0.1:8787/stravaSummaryPreview"],
    [true, "localhost", "https://localhost/stravaSummaryPreview"],
    [true, "localhost", "http://127.0.0.1.evil.test/stravaSummaryPreview"],
    [true, "localhost", "http://example.com/stravaSummaryPreview"],
    [true, "localhost", "http://user:password@localhost/stravaSummaryPreview"],
    [true, "localhost", "http://localhost:5012/stravaPublishActivitySummary"],
    [true, "localhost", "http://localhost:5012/stravaSummaryPreview?target=other"],
    [true, "localhost", "not a URL"],
    [true, "localhost", undefined],
  ] as const)("ignores an unauthorized override (%s, %s, %s)", (dev, hostname, url) => {
    expect(localStravaSummaryPreviewUrl(dev, hostname, url)).toBeNull();
  });
});
