import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import RunInterpretationCard from "./RunInterpretationCard";
const locale = vi.hoisted(() => ({ units: "imperial" as "metric" | "imperial" }));
vi.mock("../../contexts/LocaleContext", () => ({ useLocale: () => locale }));
it("formats grade-adjusted pace with one selected distance unit", () => {
 render(<RunInterpretationCard gapSecPerKm={337} averageSpeedKmh={10} baselinePaceSecPerKm={null} />);
 expect(screen.getByText(/9:02\/mi/)).toBeInTheDocument();
 expect(screen.queryByText(/\/mi\/km|\/km\/km|\/mi per km/)).not.toBeInTheDocument();
});
