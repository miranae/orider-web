import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("PaneTraining canonical FTP writes", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/settings/PaneTraining.tsx"),
    "utf8",
  );

  it("sends both updates and clears through the canonical command", () => {
    expect(source).toContain("await updateCanonicalFtp(expectedUid, nextFtp, ftpChangeSource)");
    expect(source).toContain("const nextFtp = updates.ftp as number | null");
    expect(source).toContain("delete rootUpdates.ftp");
  });

  it("does not include FTP in the legacy device-first metric writer", () => {
    const legacyCall = source.match(/persistRiderMetrics\(expectedUid, \{([\s\S]*?)\}\);/);
    expect(legacyCall?.[1]).not.toContain("ftp:");
  });

  it("generation-fences profile loads and saves by user", () => {
    expect(source).toContain("let cancelled = false");
    expect(source).toContain("if (cancelled) return");
    expect(source).toContain("formOwnerUid !== user.uid");
    expect(source).toContain("activeUserUidRef.current === expectedUid");
  });
});
