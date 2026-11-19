import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import MobileTabBar from "./MobileTabBar";

describe("MobileTabBar highlight", () => {
  it("marks no tab as current when the page belongs to no hub", () => {
    renderWithProviders(<MobileTabBar active={null} />, { route: "/ko/tools/virtual-power" });
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(links.filter(link => link.getAttribute("aria-current") === "page")).toEqual([]);
  });

  it("marks exactly the active hub as current", () => {
    renderWithProviders(<MobileTabBar active="explore" />, { route: "/ko/explore/courses" });
    const current = screen.getAllByRole("link").filter(link => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
  });
});
