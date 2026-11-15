import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
vi.mock("../hooks/useGear", () => ({ useGear: () => ({ items: [] }) }));
vi.mock("../hooks/usePdc", () => ({ usePdc: () => ({ pdc: null }) }));
import LabPage from "./LabPage";

describe("lab login gate", () => {
  it("로그인 필요 안내 문구를 누르면 로그인 창을 열고, 새 버튼은 만들지 않는다", async () => {
    renderWithProviders(<LabPage />, { route: "/ko/lab" });
    fireEvent.click(await screen.findByText(/로그인 후 이용할 수 있습니다|loginRequired\.body/));
    expect(screen.queryByRole("button", { name: "로그인" })).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "로그인" })).toBeInTheDocument();
  });
});
