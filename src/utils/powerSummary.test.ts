import { describe, it, expect } from "vitest";
import { summarizePower } from "./powerSummary";

describe("summarizePower", () => {
  it("정속 200W 60분 → avg 200, IF 1.0, TSS 100 (FTP=200)", () => {
    const watts = Array.from({ length: 3600 }, () => 200);
    const r = summarizePower(watts, 200);
    expect(r.avg).toBe(200);
    expect(r.np).toBeGreaterThan(199);
    expect(r.np).toBeLessThan(201);
    expect(r.if).toBeGreaterThan(0.99);
    expect(r.if).toBeLessThan(1.01);
    expect(r.tss).toBeGreaterThan(99);
    expect(r.tss).toBeLessThan(101);
  });

  it("길이 30 미만 → np/if/tss null", () => {
    const r = summarizePower([100, 100, 100], 200);
    expect(r.np).toBeNull();
    expect(r.if).toBeNull();
    expect(r.tss).toBeNull();
    expect(r.avg).toBe(100);
  });

  it("FTP 0 → if/tss null", () => {
    const watts = Array.from({ length: 100 }, () => 100);
    const r = summarizePower(watts, 0);
    expect(r.if).toBeNull();
    expect(r.tss).toBeNull();
  });
});
