import { describe, expect, it } from "vitest";

import { NAV_GROUPS, SECTION_IDS } from "./settingsNavigation";

describe("settings navigation vocabulary", () => {
  it("exposes every settings section once, including account, to desktop and mobile", () => {
    const items = NAV_GROUPS.flatMap((group) => group.items);
    const ids = items.map((item) => item.id);

    expect(ids).toEqual(SECTION_IDS);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("account");
    expect(items.every((item) => item.labelKey.startsWith("nav.") && item.hintKey.startsWith("nav."))).toBe(true);
  });
});
