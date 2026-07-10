import { describe, expect, it } from "vitest";
import { isPermissionDeniedError } from "./firebaseErrors";

describe("isPermissionDeniedError", () => {
  it("detects Firestore permission-denied by code or message", () => {
    expect(isPermissionDeniedError({ code: "permission-denied" })).toBe(true);
    expect(isPermissionDeniedError({ code: "functions/permission-denied" })).toBe(true);
    expect(isPermissionDeniedError(new Error("Missing or insufficient permissions."))).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isPermissionDeniedError({ code: "unavailable" })).toBe(false);
    expect(isPermissionDeniedError(new Error("network down"))).toBe(false);
    expect(isPermissionDeniedError(null)).toBe(false);
  });
});
