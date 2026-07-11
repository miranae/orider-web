import { describe, expect, it } from "vitest";
import { ORIDER_APP_STORE_URL, ORIDER_PLAY_STORE_URL } from "../../constants/appStoreLinks";
import { buildOriderSharePayload, buildOriderShareText, isShareCancellation, shareOrCopy, sharePayloadForClipboard } from "./oriderShareText";

describe("O-Rider share payload", () => {
  it("brands Korean iOS shares with the canonical store URL", () => {
    const text = buildOriderShareText({ body: "남산 코스", language: "ko", userAgent: "iPhone" });
    expect(text).toContain("· O-Rider");
    expect(text).toContain(ORIDER_APP_STORE_URL);
    expect(text).not.toContain(ORIDER_PLAY_STORE_URL);
  });

  it("uses Google Play for Android and both stores for unknown English clients", () => {
    expect(buildOriderShareText({ language: "en", userAgent: "Android" })).toContain(ORIDER_PLAY_STORE_URL);
    const unknown = buildOriderShareText({ language: "en", userAgent: "Desktop" });
    expect(unknown).toContain(ORIDER_APP_STORE_URL);
    expect(unknown).toContain(ORIDER_PLAY_STORE_URL);
  });

  it("does not duplicate existing branding or store guidance", () => {
    const once = buildOriderShareText({ body: `Ride · O-Rider\n${ORIDER_APP_STORE_URL}`, language: "en" });
    expect(once.match(/· O-Rider/g)).toHaveLength(1);
    expect(once.split(ORIDER_APP_STORE_URL)).toHaveLength(2);
  });

  it("adds only the missing store on unknown desktop partial-store text", () => {
    const text = buildOriderShareText({ body: `Install: ${ORIDER_APP_STORE_URL}`, language: "en", userAgent: "Desktop" });
    expect(text.split(ORIDER_APP_STORE_URL)).toHaveLength(2);
    expect(text).toContain(ORIDER_PLAY_STORE_URL);
  });

  it("uses the same branded body for native and clipboard payloads", () => {
    const payload = buildOriderSharePayload({ title: "Ride", body: "Fast ride", url: "https://orider.example/ride", language: "en", userAgent: "Android" });
    expect(sharePayloadForClipboard(payload)).toBe(`${payload.title}\n${payload.text}\n${payload.url}`);
  });

  it("treats macOS as unknown desktop and offers both stores", () => {
    const text = buildOriderShareText({ language: "en", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)" });
    expect(text).toContain(ORIDER_APP_STORE_URL);
    expect(text).toContain(ORIDER_PLAY_STORE_URL);
  });

  it("deduplicates title-equals-body while retaining clipboard title", () => {
    const payload = buildOriderSharePayload({ title: "Race", body: "Race", url: "https://example.test", language: "en", userAgent: "Desktop" });
    expect(payload.text).not.toMatch(/^Race(?:\n|$)/);
    expect(sharePayloadForClipboard(payload).split("\n")[0]).toBe("Race");
  });

  it("reports clipboard success only after write resolves", async () => {
    let resolve!: () => void;
    const writeText = new Promise<void>((done) => { resolve = done; });
    const promise = shareOrCopy({ title: "T", text: "B", url: "U" }, { share: undefined, clipboard: { writeText: () => writeText } as Clipboard });
    let settled = false;
    void promise.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolve();
    await expect(promise).resolves.toBe("copied");
  });

  it("fails without clipboard or on clipboard rejection and quiets AbortError", async () => {
    await expect(shareOrCopy({}, { share: undefined, clipboard: undefined as unknown as Clipboard })).resolves.toBe("failed");
    await expect(shareOrCopy({}, { share: undefined, clipboard: { writeText: () => Promise.reject(new Error("denied")) } as Clipboard })).resolves.toBe("failed");
    await expect(shareOrCopy({}, { share: () => Promise.reject(new DOMException("cancel", "AbortError")), clipboard: undefined as unknown as Clipboard })).resolves.toBe("cancelled");
  });

  it("recognizes only AbortError as normal cancellation", () => {
    expect(isShareCancellation(new DOMException("cancel", "AbortError"))).toBe(true);
    expect(isShareCancellation(new Error("failed"))).toBe(false);
  });
});
