import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("CreateGroupModal invite step", () => {
  it("does not expose the unimplemented email invite flow", () => {
    const source = readFileSync(join(process.cwd(), "src/components/group/CreateGroupModal.tsx"), "utf8");

    expect(source).not.toContain("groups\", groupId, \"invitations\"");
    expect(source).not.toContain("rider1@example.com");
    expect(source).toContain("create.inviteHelp");
  });
});
