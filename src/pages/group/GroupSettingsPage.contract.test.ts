import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("GroupSettingsPage manager contracts", () => {
  const source = readFileSync(join(process.cwd(), "src/pages/group/GroupSettingsPage.tsx"), "utf8");

  it("uses server-owned invite callables and never writes inviteCode to the public group", () => {
    expect(source).toContain("getGroupInviteCode(groupId)");
    expect(source).toContain("regenerateGroupInviteCode(groupId)");
    expect(source).not.toContain("generateInviteCode");
    expect(source).not.toMatch(/updateDoc\([^)]*inviteCode/s);
  });

  it("keeps creator-only controls behind an explicit creator gate", () => {
    expect(source).toContain("{isCreator && <div");
    expect(source).toContain('{t("settings.kind")}');
    expect(source).toContain('{t("settings.sports")}');
    expect(source).toContain("{isCreator && <Card");
    expect(source).toContain('{t("settings.visibility")}');
    expect(source).toContain('{t("settings.approval")}');
  });
});
