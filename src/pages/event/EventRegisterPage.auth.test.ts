import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("EventRegisterPage auth gate", () => {
  it("offers Google sign-in from the locked registration screen", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/event/EventRegisterPage.tsx"), "utf8");

    expect(source).toContain("signInWithGoogle");
    expect(source).toContain('actionLabel={tCommon("button.loginGoogle")}');
    expect(source).toContain("onAction={() => { void signInWithGoogle(); }}");
  });
});
