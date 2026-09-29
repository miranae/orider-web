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

it("shows matching subtype sample count and distance-weighted comparison basis", () => {
 render(<RunInterpretationCard gapSecPerKm={null} averageSpeedKmh={12} baselinePaceSecPerKm={320} comparison={{ comparisonType: "trailrun", sampleCount: 4, windowComplete: true }} />);
 expect(screen.getByTestId("run-comparison-basis")).toHaveTextContent("같은 러닝 유형(트레일 러닝) 유효 기록 4회");
 expect(screen.getByTestId("run-comparison-basis")).toHaveTextContent("거리 가중 평균");
 expect(screen.getByText(/32초 빠른 페이스/)).toBeInTheDocument();
});
it("gives a neutral minimum-sample explanation without claiming progress", () => {
 render(<RunInterpretationCard gapSecPerKm={null} averageSpeedKmh={12} baselinePaceSecPerKm={null} comparison={{ comparisonType: "virtualrun", sampleCount: 2, windowComplete: true }} />);
 expect(screen.getByTestId("run-comparison-basis")).toHaveTextContent("가상 러닝");
 expect(screen.getByTestId("run-comparison-basis")).toHaveTextContent("최소 3회");
 expect(screen.queryByText(/빠른 페이스|느린 페이스/)).not.toBeInTheDocument();
});
it("labels the incomplete window and omits the pace comparison", () => {
 render(<RunInterpretationCard gapSecPerKm={null} averageSpeedKmh={12} baselinePaceSecPerKm={null} comparison={{ comparisonType: "run", sampleCount: 100, windowComplete: false }} />);
 expect(screen.getByTestId("run-comparison-basis")).toHaveTextContent("전체 기간을 확인하지 못해");
 expect(screen.queryByText(/빠른 페이스|느린 페이스/)).not.toBeInTheDocument();
});

it("does not describe an unknown or failed query as zero completed samples", () => {
 const { container } = render(<RunInterpretationCard gapSecPerKm={null} averageSpeedKmh={12} baselinePaceSecPerKm={null} comparison={{ comparisonType: "run", sampleCount: 0, windowComplete: null }} />);
 expect(container).toBeEmptyDOMElement();
});
