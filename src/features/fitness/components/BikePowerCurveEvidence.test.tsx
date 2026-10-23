import { screen } from "@testing-library/react";
import { it, expect } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { BikePowerCurveEvidence } from "./BikePowerCurveEvidence";
it("compact analysis does not produce four missing numeric cards without a curve", () => {
  renderWithProviders(<BikePowerCurveEvidence compact current={[]} previous={[]} />);
  expect(screen.queryByTestId("K5-2-2")).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});
it("compact analysis preserves a real zero but omits unavailable key durations", () => {
  renderWithProviders(<BikePowerCurveEvidence compact current={[{ durationSeconds: 60, maxPower: 0 }]} previous={[]} />);
  const keys = screen.getByTestId("K5-2-2");
  expect(keys).toHaveTextContent("0W");
  expect(keys.children).toHaveLength(1);
  expect(keys).not.toHaveTextContent("—");
});
it("legacy evidence retains every key-duration placeholder", () => {
  renderWithProviders(<BikePowerCurveEvidence current={[]} previous={[]} />);
  expect(screen.getByTestId("K5-2-2").children).toHaveLength(4);
});
