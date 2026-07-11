import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("CreateCoursePage builder isolation", () => {
  const source = readFileSync(join(process.cwd(), "src/pages/CreateCoursePage.tsx"), "utf8");
  it("fails closed before every persisted submit branch", () => {
    expect(source.indexOf('if (mode === "builder")')).toBeLessThan(source.indexOf('if (!isFormValid || submitting)'));
    expect(source).toContain('mode !== "gpx" && mode !== "builder"');
    expect(source).toContain('((mode === "activity" || mode === "section") && streams)');
    expect(source).not.toContain('mode === "builder" && handleSubmit');
  });
  it("rejects blank manual coordinates and localizes timeout UI", () => {
    expect(source).toContain('if (!manualLat.trim() || !manualLng.trim())');
    expect(source).toContain('err instanceof DirectionsTimeoutError ? t("builder.timeout")');
  });
});
