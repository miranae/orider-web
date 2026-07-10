import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import RiderRankingPanel from "./RiderRankingPanel";

vi.mock("../../hooks/usePdc", () => ({
  usePdc: () => ({ status: "missing", pdc: null }),
}));

vi.mock("../../hooks/useCohortPercentiles", () => ({
  useCohortPercentiles: () => ({ status: "missing", stats: null }),
}));

vi.mock("../../hooks/useGroup", () => ({
  useMyGroups: () => ({ groups: [], loading: false, error: null, retry: vi.fn() }),
}));

vi.mock("../../hooks/useFirestore", () => ({
  useDocument: () => ({ data: null, loading: false, error: null }),
}));

describe("RiderRankingPanel", () => {
  it("defaults signed-in users to the all scope instead of the unimplemented friends scope", async () => {
    renderWithProviders(<RiderRankingPanel />, { authenticated: true });

    const allButton = await screen.findByRole("button", { name: "전체" });
    expect(allButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "친구" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("코호트 순위를 계산할 수 없어요")).toBeInTheDocument();
    expect(screen.queryByText("비교할 데이터가 없어요")).not.toBeInTheDocument();
  });

  it("labels the friends scope as coming soon when selected", async () => {
    renderWithProviders(<RiderRankingPanel />, { authenticated: true });

    fireEvent.click(await screen.findByRole("button", { name: "친구" }));

    expect(screen.getByRole("button", { name: "친구" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("친구 순위 준비 중")).toBeInTheDocument();
    expect(screen.getByText("친구 W/kg 순위는 서버 집계 스냅샷 도입 후 제공됩니다. 지금은 전체 코호트 또는 그룹 순위를 확인해 주세요.")).toBeInTheDocument();
    expect(screen.queryByText("비교할 데이터가 없어요")).not.toBeInTheDocument();
  });

  it("hides unimplemented signed-in scopes from signed-out visitors", async () => {
    renderWithProviders(<RiderRankingPanel />, { authenticated: false });

    expect(await screen.findByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "친구" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "내 그룹" })).not.toBeInTheDocument();
    expect(screen.getByText("로그인이 필요해요")).toBeInTheDocument();
  });
});
