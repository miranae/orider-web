import { isFatalCourseMapError, sanitizeCourseMapErrorUrl } from "./CoursesMap";

function mapError(url?: string, extra: Record<string, unknown> = {}) {
  const error = Object.assign(new Error("map request failed"), url ? { url } : {});
  return { type: "error", target: {}, error, ...extra } as Parameters<typeof isFatalCourseMapError>[0];
}

describe("isFatalCourseMapError", () => {
  it("keeps the map mounted for recoverable tile and resource errors", () => {
    expect(isFatalCourseMapError(mapError("https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/1/1/1.vector.pbf"), false)).toBe(false);
    expect(isFatalCourseMapError(mapError("https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/sprite.json"), false)).toBe(false);
    expect(isFatalCourseMapError(mapError(undefined, { sourceId: "composite" }), false)).toBe(false);
  });

  it("fails when the initial style document or map initialization cannot load", () => {
    expect(isFatalCourseMapError(mapError("https://api.mapbox.com/styles/v1/mapbox/outdoors-v12?access_token=blocked"), false)).toBe(true);
    expect(isFatalCourseMapError(mapError(), false)).toBe(true);
  });

  it("does not remove an already loaded map for later resource errors", () => {
    expect(isFatalCourseMapError(mapError(), true)).toBe(false);
  });
});

describe("sanitizeCourseMapErrorUrl", () => {
  it("removes Mapbox access tokens and fragments before logging", () => {
    expect(sanitizeCourseMapErrorUrl("https://api.mapbox.com/styles/v1/mapbox/outdoors-v12?access_token=secret#fragment"))
      .toBe("https://api.mapbox.com/styles/v1/mapbox/outdoors-v12");
  });
});
