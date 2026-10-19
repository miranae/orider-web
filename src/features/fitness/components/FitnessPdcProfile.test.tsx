import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import FitnessPdcProfile, { type FitnessPdcProfileData } from "./FitnessPdcProfile";

const pdc: FitnessPdcProfileData = { riderType: { type: "Climber", confidence: 0.9 }, abilityScore: 62, activityCount: 8, weightKgSnapshot: 68, version: 5, provenanceVersion: 2, measuredPower: true };
describe("stored PDC profile evidence", () => {
  it("retains the seven-type classification and distinct overall score", () => {
    renderWithProviders(<FitnessPdcProfile pdc={pdc} />);
    expect(screen.getByText("클라이머")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "62");
    expect(screen.getByText(/90%/)).toBeInTheDocument();
  });
  it("keeps the established provenance and confidence gates", () => {
    renderWithProviders(<FitnessPdcProfile pdc={{ ...pdc, measuredPower: false }} />);
    expect(screen.queryByText("클라이머")).not.toBeInTheDocument();
    expect(screen.getByRole("meter")).toBeInTheDocument();
  });
  it("leaves the profile and overall-score definitions visible without fabricating zeros", () => {
    renderWithProviders(<FitnessPdcProfile />);
    expect(screen.getByRole("region")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });
});
