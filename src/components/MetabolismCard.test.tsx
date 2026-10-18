import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import MetabolismCard from "./MetabolismCard";

const substrate = { totalKcal: 319, fatPct: 0.236, fatKcal: 75, carbKcal: 244 };
const fatMax = { fatMaxWatts: 132, fatMaxPctFtp: 0.6, sustainableMin: 240, tssAtFatMax: 144 };

describe("MetabolismCard in composed analysis", () => {
  it("keeps FATMAX facts when the composer owns the fuel split", () => {
    const { container } = renderWithProviders(<MetabolismCard substrate={substrate} fatMax={fatMax} showFuelSplit={false} />);
    expect(container.querySelector(".fuel-split-bar")).toBeNull();
    expect(screen.getByText("132")).toBeInTheDocument();
    expect(screen.getByText("144")).toBeInTheDocument();
    expect(container.querySelector(".activity-metabolism-facts")).toBeInTheDocument();
  });

  it("preserves the independent standalone split and its model total", () => {
    const { container } = renderWithProviders(<MetabolismCard substrate={substrate} fatMax={null} />);
    expect(container.querySelector(".fuel-split-bar")).toBeInTheDocument();
    expect(screen.getByText("75")).toBeInTheDocument();
    expect(screen.getByText("244")).toBeInTheDocument();
    expect(container).toHaveTextContent("319");
  });

  it("preserves estimated-power guidance even without FATMAX or another fuel chart", () => {
    const { container } = renderWithProviders(<MetabolismCard substrate={substrate} fatMax={null} isVirtualPower showFuelSplit={false} />);
    expect(container).not.toBeEmptyDOMElement();
    expect(container.querySelector(".fuel-split-bar")).toBeNull();
    expect(container).toHaveTextContent(/추정|가상/);
  });

  it("does not leave an empty metabolism section when the composer already owns every fact", () => {
    const { container } = renderWithProviders(<MetabolismCard substrate={substrate} fatMax={null} showFuelSplit={false} />);
    expect(container.querySelector(".fuel-split-bar")).toBeNull();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
