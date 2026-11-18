import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Group } from "@shared/types";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupCard from "./GroupCard";

vi.mock("../../hooks/useGroup", () => ({ useGroupMemberRole: () => ({ role: null, loading: false }) }));

function badgeOf(badge: unknown, name = "오스템") {
  const group = { id: "club", name, discipline: "bike", badge } as Group;
  renderWithProviders(<GroupCard group={group} />);
  const title = screen.getByRole("heading", { name });
  // 아이콘은 이름이 든 본문 열 바로 앞 칸
  const icon = title.closest(".min-w-0")?.previousElementSibling ?? null;
  return icon?.textContent ?? null;
}

describe("GroupCard club icon", () => {
  it.each(["", "   "])("falls back to the club name when the stored badge is blank (%j)", badge => {
    expect(badgeOf(badge)).toBe("오스");
  });

  it("falls back to the club name when there is no badge", () => {
    expect(badgeOf(undefined)).toBe("오스");
  });

  it("keeps an explicit badge", () => {
    expect(badgeOf("ost")).toBe("OST");
  });

  it("uses word initials for latin names", () => {
    expect(badgeOf("", "Riding Club Lara")).toBe("RCL");
  });
});
