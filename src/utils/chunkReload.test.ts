import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isBrowserOffline, shouldReloadChunkOnce } from "./chunkReload";

describe("chunkReload", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("does not allow a chunk reload while the browser is offline", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    expect(isBrowserOffline()).toBe(true);
    expect(shouldReloadChunkOnce()).toBe(false);
    expect(sessionStorage.getItem("orider:chunk-reload-ts")).toBeNull();
  });

  it("allows only one online chunk reload inside the guard window", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.spyOn(Date, "now").mockReturnValue(11_000);

    expect(shouldReloadChunkOnce()).toBe(true);
    expect(shouldReloadChunkOnce()).toBe(false);
  });
});
