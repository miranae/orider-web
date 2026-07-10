import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/FriendInvitePage.tsx", "utf8");

describe("FriendInvitePage preview wiring", () => {
  it("loads inviter profile by friend code before login", () => {
    expect(source).toContain('collection(firestore, "users_public")');
    expect(source).toContain('where("friendCode", "==", code)');
    expect(source).toContain("titleWithName");
  });

  it("loads a best-effort public ride image for the inviter", () => {
    expect(source).toContain('collection(firestore, "activities")');
    expect(source).toContain("rideImageUrl");
    expect(source).toContain("FriendInvitePage.recentRidePreview");
  });
});
