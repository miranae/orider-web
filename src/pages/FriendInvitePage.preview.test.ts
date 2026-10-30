import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync("src/pages/FriendInvitePage.tsx", "utf8");
describe("FriendInvitePage preview wiring", () => {
  it("resolves an invite through current server policy without querying private codes", () => {
    expect(source).toContain("resolveFriendInvitePreview(services, code)");
    expect(source).not.toContain('where("friendCode"');
    expect(source).not.toContain('collection(firestore, "users_public")');
    expect(source).toContain("titleWithName");
    expect(source).toContain('scope: "athlete"');
  });
});
