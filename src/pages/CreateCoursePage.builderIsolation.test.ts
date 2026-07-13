import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("CreateCoursePage builder isolation", () => {
  const source = readFileSync(join(process.cwd(), "src/pages/CreateCoursePage.tsx"), "utf8");

  it("keeps legacy activity and section loading isolated from builder mode", () => {
    expect(source).toContain('mode !== "gpx" && mode !== "builder"');
    expect(source).toContain('mode === "gpx" || mode === "builder"');
    expect(source).toContain('(mode === "builder" && builderRoute)');
  });

  it("rejects blank manual coordinates and routes through the server adapter", () => {
    expect(source).toContain('if (!manualLat.trim() || !manualLng.trim()');
    expect(source).toContain("requestCourseRoute(functions");
    expect(source).not.toContain("api.mapbox.com/directions");
  });

  it("does not send route geometry to analytics or client logs", () => {
    expect(source).not.toMatch(/track\([^)]*(waypoints|coordinates|geometry)/);
    expect(source).not.toMatch(/logClientError\([^)]*(waypoints|coordinates|geometry)/);
  });

  it("fails closed instead of saving 2D builder geometry as a flat course", () => {
    expect(source).toContain('if (mode === "builder") { setSubmitError(t("builder.saveDisabled")); return; }');
    expect(source).toContain('disabled={mode === "builder" || !isFormValid || submitting}');
    expect(source).not.toContain('gpxXml: routeToGpx(name, builderRoute.geometry.coordinates)');
  });
});
