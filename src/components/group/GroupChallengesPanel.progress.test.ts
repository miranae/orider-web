import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("GroupChallengesPanel progress contract", () => {
  const source = readFileSync(join(process.cwd(), "src/components/group/GroupChallengesPanel.tsx"), "utf8");

  it("exposes progress semantics and the selected group state", () => {
    expect(source).toContain('role="progressbar"');
    expect(source).toContain('aria-valuemin={0}');
    expect(source).toContain('aria-valuemax={100}');
    expect(source).toContain('aria-valuenow={Math.round(progress.percent)}');
    expect(source).toContain('aria-current={isSelectedGroup ? "true" : undefined}');
  });

  it("renders the selected participant even outside the leading five", () => {
    expect(source).toContain("getVisibleChallengeStandings(challenge.standings, alreadyJoined ? groupId : \"\")");
  });
});
