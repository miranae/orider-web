import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ActivityMetricsDoc } from "../../hooks/useActivityMetrics";
import RunEffortsPanel from "./RunEffortsPanel";

const locale = vi.hoisted(() => ({ units: "metric" as "metric" | "imperial" }));
vi.mock("../../contexts/LocaleContext", () => ({ useLocale: () => locale }));
const metrics = () => ({ discipline: "run", durationSec: 3600, inputCoverage: "complete", inputPending: false,
  speedCurve: { "5s": 18, "5m": 15, "20m": 12 },
  runMetrics: { gapAvgSec: 240, distanceRecords: { "1km": 220, "5km": 1200 } },
} as unknown as ActivityMetricsDoc);
function open() { screen.getByTestId("run-efforts").setAttribute("open", ""); }

describe("RunEffortsPanel", () => {
  it("shows canonical duration pace and elapsed distance records without inventing location", () => {
    locale.units = "metric";
    render(<RunEffortsPanel metrics={metrics()} ready />); open();
    expect(screen.getByRole("combobox")).toHaveValue("300");
    const table = screen.getByRole("table");
    expect(within(table).getByText("20:00")).toBeInTheDocument();
    expect(within(table).getByText("4:00/km")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "1200" } });
    expect(screen.getByRole("combobox")).toHaveValue("1200");
    expect(screen.getByText("5:00/km")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("converts pace to imperial units while keeping official race distances and elapsed seconds", () => {
    locale.units = "imperial";
    render(<RunEffortsPanel metrics={metrics()} ready />); open();
    expect(within(screen.getByRole("table")).getByText("20:00")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("6:26/mi")).toBeInTheDocument();
    locale.units = "metric";
  });
  it.each(["pending", "partial", "stale", "different-discipline"])("withholds best efforts when canonical input is %s", kind => {
    const value = metrics();
    if (kind === "pending") value.inputPending = true;
    if (kind === "partial") value.inputCoverage = "partial";
    if (kind === "different-discipline") value.discipline = "bike";
    render(<RunEffortsPanel metrics={value} ready={kind !== "stale"} />); open();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("does not synthesize missing or invalid records from a valid speed curve", () => {
    const value = metrics();
    value.runMetrics!.distanceRecords = { "1km": Number.NaN, "5km": -2 };
    value.speedCurve = { "5m": 15, "20m": Number.POSITIVE_INFINITY };
    render(<RunEffortsPanel metrics={value} ready />); open();
    expect(screen.getByRole("combobox")).toHaveValue("300");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

const facts = { state: "available" as const, reason: null, streamInputRevision: "a".repeat(64), metricsRevision: "b".repeat(64), facts: [{ distance: "5km" as const, distanceM: 5000, elapsedSec: 1200, exactElapsedSec: 1200, startOffsetSec: 100, endOffsetSec: 1300, axis: "canonical_distance_observations" as const, startIndex: 0, endBeforeIndex: 1199, endIndex: 1200, endFraction: 1 }] };
it("selects the server-confirmed elapsed window without treating distance indices as GPS indices", () => {
  const select = vi.fn(); render(<RunEffortsPanel metrics={metrics()} ready facts={facts} onSelectEffort={select} />); open();
  fireEvent.click(screen.getByRole("button", { name: "5km 구간 선택" }));
  expect(select).toHaveBeenCalledWith({ startOffsetSec: 100, endOffsetSec: 1300 });
});
it.each(["changed_input", "unavailable", "mismatch", "outside", "foreign"])("withholds anchors for %s", state => {
  const value = structuredClone(facts);
  if (state === "changed_input" || state === "unavailable") Object.assign(value, { state, facts: [] });
  if (state === "mismatch") value.facts[0]!.elapsedSec = 1100;
  if (state === "outside") value.facts[0]!.endOffsetSec = 4000;
  render(<RunEffortsPanel metrics={metrics()} ready facts={value} onSelectEffort={state === "foreign" ? undefined : vi.fn()} />); open();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
