import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
vi.mock("../hooks/useGear", () => ({ useGear: () => ({ items: [] }) }));
vi.mock("../hooks/usePdc", () => ({ usePdc: () => ({ pdc: null }) }));
import LabPage from "./LabPage";

describe("lab login gate", () => {
  it("로그인 필요 안내에서 로그인 버튼이 로그인 창을 연다", async () => {
    renderWithProviders(<LabPage />, { route: "/ko/lab" });
    fireEvent.click(await screen.findByRole("button", { name: "로그인" }));
    expect(await screen.findByRole("dialog", { name: "로그인" })).toBeInTheDocument();
  });
});
