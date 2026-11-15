import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ActivitySummary } from "@shared/types";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { SwimRightCards } from "./SwimDetailCards";

const summary = { distance: 1500, ridingTimeMillis: 1_800_000 } as ActivitySummary;

describe("세션 기준 CSS 추정 카드", () => {
  // 갱신 조건을 판정하는 데이터가 없으므로 충족을 단정하지 않는다. 경고가 아니라 링크도 없다.
  it("does not claim an update condition is met", () => {
    renderWithProviders(<SwimRightCards summary={summary} />);
    expect(screen.queryByText(/갱신 조건 충족/)).not.toBeInTheDocument();
    expect(screen.getByText("이 세션 기준 CSS 추정")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
