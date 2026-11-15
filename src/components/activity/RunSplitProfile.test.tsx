import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SplitRow } from "@shared/types/activity-metrics";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import RunSplitProfile from "./RunSplitProfile";

const splits = [1, 2].map(km => ({ km, paceSec: 300, gapSec: 300, elevGain: 1, elevLoss: 0, avgHr: null })) as unknown as SplitRow[];
const props = { splits, distanceKm: 2, suppressCadence: true, cadenceLabel: "케이던스", formatCadence: () => "—" };

describe("RunSplitProfile 지도·고도 보기", () => {
  // 선택 구간 카드 맨 아래의 넓은 글자 버튼 대신 제목 줄의 아이콘 버튼이다.
  it("renders the split location action as an icon button in the selected split header", () => {
    const onView = vi.fn();
    renderWithProviders(<RunSplitProfile {...props} canViewSplitLocation onViewSplitLocation={onView} />);
    const button = screen.getByRole("button", { name: "지도·고도로 보기" });
    expect(button).toHaveClass("ds-btn--icon-only"); expect(button).not.toHaveClass("w-full");
    expect(button).toHaveAttribute("title", "지도·고도로 보기"); expect(button).toHaveTextContent("");
    expect(button.parentElement).toContainElement(screen.getByRole("heading", { level: 4 }));
    fireEvent.click(button); expect(onView).toHaveBeenCalledOnce();
  });

  it("hides the action when the split location cannot be shown", () => {
    renderWithProviders(<RunSplitProfile {...props} canViewSplitLocation={false} onViewSplitLocation={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "지도·고도로 보기" })).not.toBeInTheDocument();
  });
});
