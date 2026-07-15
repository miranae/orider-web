import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import RiderRankingPanel from "./RiderRankingPanel";

vi.mock("../../hooks/useGroup", () => ({
  useMyGroups: () => ({ groups: [], loading: false, error: null, retry: vi.fn() }),
}));

vi.mock("../../hooks/useFirestore", () => ({
  useDocument: () => ({ data: null, loading: false, error: null }),
}));

describe("RiderRankingPanel", () => {
  it("defaults signed-in users to the real group scope", async () => {
    renderWithProviders(<RiderRankingPanel />, { authenticated: true });

    const groupButton = await screen.findByRole("button", { name: "내 그룹" });
    expect(groupButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "친구" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("가입한 그룹이 없어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "전체" })).not.toBeInTheDocument();
  });

  it("labels the friends scope as coming soon when selected", async () => {
    renderWithProviders(<RiderRankingPanel />, { authenticated: true });

    fireEvent.click(await screen.findByRole("button", { name: "친구" }));

    expect(screen.getByRole("button", { name: "친구" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("친구 순위 준비 중")).toBeInTheDocument();
    expect(screen.getByText("친구 W/kg 순위는 서버 집계 스냅샷 도입 후 제공됩니다. 지금은 그룹 순위를 확인해 주세요.")).toBeInTheDocument();
    expect(screen.queryByText("비교할 데이터가 없어요")).not.toBeInTheDocument();
  });

  it("shows only the login state to signed-out visitors", async () => {
    renderWithProviders(<RiderRankingPanel />, { authenticated: false });

    expect(await screen.findByText("로그인이 필요해요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "친구" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "내 그룹" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "전체" })).not.toBeInTheDocument();
  });
});
