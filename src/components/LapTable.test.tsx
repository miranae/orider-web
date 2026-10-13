import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import LapTable from "./LapTable";
import ko from "../i18n/resources/ko/activity.json";
vi.mock("../contexts/LocaleContext", () => ({ useLocale: () => ({ units: "metric" }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, values?: { number?: number }) => {
  const text = key.split(".").reduce<unknown>((value, part) => value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined, ko);
  return typeof text === "string" ? text.replace("{{number}}", String(values?.number)) : key;
} }) }));
afterEach(cleanup);
const lap = { number: 1, distanceKm: 1, durationMs: 200000, avgSpeed: 18, maxSpeed: 24, avgCadence: 90, avgHeartRate: 150, avgPower: 200 };
it("preserves legacy numerical content and totals when location callbacks are omitted", () => {
  const { container } = render(<LapTable laps={[lap]} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(container).toHaveTextContent("3:20");
  expect(container).toHaveTextContent("18.0");
});
it("retains calculations while selecting only a location-eligible original lap", () => {
  const onSelectLap = vi.fn();
  render(<LapTable laps={[lap, { ...lap, number: 2 }]} onSelectLap={onSelectLap} canSelectLap={value => value.number === 1} />);
  fireEvent.click(screen.getByRole("button", { name: "랩 1 구간 보기" }));
  expect(onSelectLap).toHaveBeenCalledExactlyOnceWith(lap);
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("table")).toHaveTextContent("6:40");
});
