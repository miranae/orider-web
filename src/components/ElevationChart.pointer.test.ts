import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("ElevationChart pointer interactions", () => {
  const source = readFileSync(join(process.cwd(), "src/components/ElevationChart.tsx"), "utf8");

  it("uses pointer handlers so touch devices can scrub and drag ranges", () => {
    expect(source).toContain("onPointerDown={handlePointerDown}");
    expect(source).toContain("onPointerMove={handlePointerMove}");
    expect(source).toContain("window.addEventListener(\"pointerup\"");
    expect(source).toContain("window.addEventListener(\"pointercancel\"");
    expect(source).not.toContain("onMouseDown={handleMouseDown}");
    expect(source).not.toContain("onMouseMove={handleMouseMove}");
  });

  it("updates hover index from wrapper pointer movement", () => {
    expect(source).toContain("onHoverIndex(pixelToIndex(e.clientX))");
    expect(source).toContain("touchAction: rangeMode ? \"none\" : \"pan-y\"");
  });
});
