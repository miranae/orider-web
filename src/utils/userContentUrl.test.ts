import { describe, expect, it } from "vitest";
import { normalizeUserContentUrl, isSafeUserContentUrl } from "./userContentUrl";

describe("userContentUrl", () => {
  it("allows http, https, and internal relative URLs", () => {
    expect(normalizeUserContentUrl("https://example.com/path?q=1")).toBe("https://example.com/path?q=1");
    expect(normalizeUserContentUrl("http://example.com/path")).toBe("http://example.com/path");
    expect(normalizeUserContentUrl("/activity/abc")).toBe("/activity/abc");
    expect(normalizeUserContentUrl("./guide")).toBe("./guide");
    expect(normalizeUserContentUrl("../guide")).toBe("../guide");
    expect(normalizeUserContentUrl("#section")).toBe("#section");
  });

  it("rejects scriptable or ambiguous URL schemes", () => {
    expect(isSafeUserContentUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUserContentUrl("data:text/html,<svg onload=alert(1)>")).toBe(false);
    expect(isSafeUserContentUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeUserContentUrl("//evil.example/path")).toBe(false);
    expect(isSafeUserContentUrl("mailto:hello@example.com")).toBe(false);
  });
});
