import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import ShoeReplacementBadge from "./ShoeReplacementBadge";

const due = { name: "페가수스", totalDistanceKm: 720, remainingKm: 80, maxDistanceKm: 800, replacementDue: true };

describe("ShoeReplacementBadge 경고 → 해결", () => {
  it("교체 임박 문구를 누르면 장비(신발) 화면으로 간다 — 새 버튼·링크는 없다", () => {
    render(<MemoryRouter><ShoeReplacementBadge status={due as never} /></MemoryRouter>);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]!.textContent).toMatch(/페가수스/);
    expect(links[0]!.getAttribute("href")).toMatch(/\/athlete\/me\/gear$/);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("교체가 임박하지 않으면 아무것도 그리지 않는다", () => {
    const { container } = render(<MemoryRouter><ShoeReplacementBadge status={{ ...due, replacementDue: false } as never} /></MemoryRouter>);
    expect(container.firstChild).toBeNull();
  });
});
