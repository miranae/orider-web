import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { GoalInputNotice } from "./GoalInputNotice";

// 가정값 안내의 「기준값 입력·확인」은 종목의 기준값 칸으로 데려간다.
describe("GoalInputNotice", () => {
  it.each([
    ["bike", "/settings/training?sport=bike&focus=ftp"],
    ["run", "/settings/training?sport=run&focus=threshold-pace"],
    ["swim", "/settings/training?sport=swim&focus=css"],
  ] as const)("links %s assumptions to its threshold field", (discipline, href) => {
    renderWithProviders(<GoalInputNotice assumed discipline={discipline} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", expect.stringContaining(href));
  });
});
