import { describe, expect, it, vi } from "vitest";
import { drawEventShareCard } from "./eventShareCard";

describe("event share card", () => {
  it("renders the completion identity and result", () => {
    const fillText = vi.fn();
    const gradient = { addColorStop: vi.fn() };
    const ctx = { canvas: { width: 1080, height: 608 }, createLinearGradient: () => gradient, fillRect: vi.fn(), fillText } as unknown as CanvasRenderingContext2D;
    drawEventShareCard(ctx, { eventName: "서울 그란폰도", riderName: "라이더", date: "2026. 7. 12.", kind: "finished", result: "4:12:09", rank: "Overall #12" });
    expect(fillText).toHaveBeenCalledWith("FINISHER", 64, 190);
    expect(fillText).toHaveBeenCalledWith("4:12:09", 64, 445);
  });
});
