import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Group } from "@shared/types";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupCard from "./GroupCard";

vi.mock("../../hooks/useGroup", () => ({ useGroupMemberRole: () => ({ role: null, loading: false }) }));

function show(memberCount: unknown) {
  const group = { id: "legacy", name: "Legacy club", discipline: "bike", memberCount } as Group;
  return renderWithProviders(<GroupCard group={group} />);
}

describe("GroupCard member-count availability", () => {
  it.each([undefined, null, NaN, Infinity, -1, "12"])("omits an unavailable or invalid count %s without showing a fake zero", memberCount => {
    const { container } = show(memberCount);
    expect(screen.getByText("Legacy club")).toBeInTheDocument();
    expect(screen.queryByText(/멤버/)).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent("0명");
    expect(container.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(1);
  });

  it.each([0, 12])("shows the actual confirmed count %s including recorded zero", memberCount => {
    show(memberCount);
    expect(screen.getByText(`멤버 ${memberCount}명`)).toBeInTheDocument();
  });
});
