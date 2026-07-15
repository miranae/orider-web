import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "./lazyWithRetry";

describe("isChunkLoadError", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://orider.co.kr/assets/OldPage.js",
    "Importing a module script failed.",
    "TypeError: 'text/html' is not a valid JavaScript MIME type.",
    'Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
    'The server responded with a non-JavaScript MIME type of "text/html". Strict MIME type checking is enforced for module scripts.',
  ])("recognizes stale dynamic chunk failures: %s", (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it("does not treat unrelated application errors as chunk failures", () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of null"))).toBe(false);
    expect(isChunkLoadError(new TypeError("text/html is not a valid CSS MIME type"))).toBe(false);
  });
});
