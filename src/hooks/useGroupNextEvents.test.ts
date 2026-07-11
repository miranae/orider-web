import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatNextLabel } from "./useGroupNextEvents";

describe("group next-event localization", () => {
  it("formats weekdays with the requested UI locale", () => {
    const timestamp = new Date(2026, 6, 14, 18, 30).getTime();
    const english = formatNextLabel(timestamp, "Evening Ride", "en-US");
    const korean = formatNextLabel(timestamp, "저녁 라이딩", "ko-KR");

    expect(english).toContain("Tue");
    expect(english).toContain("Evening Ride");
    expect(korean).toContain("화");
    expect(korean).toContain("저녁 라이딩");
  });

  it("uses the translated fallback instead of a Korean literal", () => {
    const source = readFileSync(join(process.cwd(), "src/hooks/useGroupNextEvents.ts"), "utf8");

    expect(source).toContain('t("dashboard.fallbackEventName")');
    expect(source).not.toContain('info.name ?? "이벤트"');
  });
});
