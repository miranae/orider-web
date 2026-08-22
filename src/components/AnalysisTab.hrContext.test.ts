import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AnalysisTab legacy HR context", () => {
  it("guards legacy activity metrics without contextSnapshot", () => {
    const source = readFileSync(join(process.cwd(), "src/components/AnalysisTab.tsx"), "utf8");
    expect(source).toContain("sm?.contextSnapshot?.maxHr");
    expect(source).toContain("sm?.contextSnapshot?.lthr");
    expect(source).not.toContain("sm?.contextSnapshot.maxHr");
    expect(source).not.toContain("sm?.contextSnapshot.lthr");
  });

  it("uses the resolved canonical FTP for the activity power curve", () => {
    const source = readFileSync(join(process.cwd(), "src/components/AnalysisTab.tsx"), "utf8");
    expect(source).toContain("const ftp = profile?.ftp || streams.ftp || 200");
    expect(source).toContain("<PowerCurveChart\n            points={powerCurve}\n            ftp={ftp}");
    expect(source).not.toContain("ftp={streams.ftp}");
  });
});
