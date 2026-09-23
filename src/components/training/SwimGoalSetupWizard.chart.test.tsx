import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import SwimGoalSetupWizard from "./SwimGoalSetupWizard";

vi.mock("../redesign", () => ({ DateField: ({ onChange }: { onChange: (value: string) => void }) => <button type="button" onClick={() => onChange("2027-12-01")}>날짜 선택</button> }));

describe("SwimGoalSetupWizard chart palette", () => {
  it("uses theme-aware pace zones and a card-surface endpoint outline", () => {
    const { container } = renderWithProviders(<SwimGoalSetupWizard Stepper={() => null} />);
    fireEvent.click(screen.getByRole("button", { name: "다음 →" }));
    fireEvent.click(screen.getByRole("button", { name: "날짜 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "다음 →" }));

    for (let zone = 1; zone <= 5; zone++) {
      expect(container.querySelector(`[style*="border-left: 3px solid var(--zone-${zone})"]`)).not.toBeNull();
    }
    for (const phaseColor of ["--chart-speed", "--color-info", "--color-warning"]) {
      expect(container.querySelector(`[style*="border-left: 3px solid var(${phaseColor})"]`)).not.toBeNull();
    }
    const endpoint = container.querySelector('svg circle[cx="800"]');
    expect(endpoint).toHaveAttribute("fill", "var(--color-info)");
    expect(endpoint).toHaveAttribute("stroke", "var(--bg-1)");
  });
});
