import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("ExplorePage personal heatmap privacy", () => {
  const source = readFileSync(join(process.cwd(), "src/pages/ExplorePage.tsx"), "utf8");
  it("hides personal summary and geometry when signed out and resets mine mode", () => {
    expect(source).toContain('if (!user && heatMode === "mine") setHeatMode("off")');
    expect(source).toContain('heatMode === "mine" && user && (');
    expect(source).toContain('heatMode === "mine" && user && <PersonalHeatmapLayer');
  });
});
