import { isClientCapturedUrl } from "./ActivityRouteThumbnail";

describe("isClientCapturedUrl", () => {
  it.each([
    "https://firebasestorage.googleapis.com/v0/b/orider/o/map.webp?alt=media&token=test",
    "https://firebasestorage.googleapis.com:443/v0/b/orider/o/map.webp?alt=media",
  ])("accepts a Firebase Storage HTTPS download URL: %s", (url) => {
    expect(isClientCapturedUrl(url)).toBe(true);
  });

  it.each([
    "http://firebasestorage.googleapis.com/v0/b/orider/o/map.webp",
    "https://firebasestorage.googleapis.com:444/v0/b/orider/o/map.webp",
    "https://firebasestorage.googleapis.com.evil.example/v0/b/orider/o/map.webp",
    "https://evil-firebasestorage.googleapis.com/v0/b/orider/o/map.webp",
    "https://firebasestorage.googleapis.com@evil.example/v0/b/orider/o/map.webp",
    "https://evil.example/firebasestorage.googleapis.com/v0/b/orider/o/map.webp",
    "not a URL firebasestorage.googleapis.com",
    "",
  ])("rejects a non-Firebase client capture URL: %s", (url) => {
    expect(isClientCapturedUrl(url)).toBe(false);
  });

  it("rejects a missing URL", () => {
    expect(isClientCapturedUrl(null)).toBe(false);
    expect(isClientCapturedUrl(undefined)).toBe(false);
  });
});
