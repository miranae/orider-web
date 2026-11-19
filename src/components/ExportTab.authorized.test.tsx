import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ExportTab from "./ExportTab";
import type { Activity, ActivityStreams } from "@shared/types";
import { readStreamCadenceUnit } from "../services/activityStreamSource";
const mocks = vi.hoisted(() => ({ csv: vi.fn(() => "csv"), fit: vi.fn((_activity: Activity, _streams: ActivityStreams) => new Uint8Array()), toast: vi.fn() }));
vi.mock("../utils/exportFit", () => ({ generateFit: mocks.fit }));
vi.mock("../utils/exportCsv", () => ({ generateCsv: mocks.csv }));
vi.mock("../contexts/ToastContext", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
const activity = { id: "a", description: "Ride", startTime: 1792800000000 } as Activity;
beforeEach(() => { mocks.csv.mockClear(); mocks.fit.mockClear(); mocks.toast.mockClear(); vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}); });
it("exports the newly authorized streams rather than cached props", async () => {
  const current = { watts: [0, 200], time: [0, 1] };
  const resolve = vi.fn().mockResolvedValue(current);
  render(<ExportTab activity={activity} streams={{ watts: [999] }} resolveCurrentStreams={resolve} />);
  await act(async () => fireEvent.click(screen.getByText("CSV")));
  expect(resolve).toHaveBeenCalledOnce(); expect(mocks.csv).toHaveBeenCalledWith(current);
});
it("does not export after permission denial", async () => {
  render(<ExportTab activity={activity} streams={{ watts: [999] }} resolveCurrentStreams={async () => { throw new Error("permission-denied"); }} />);
  await act(async () => fireEvent.click(screen.getByText("CSV")));
  expect(mocks.csv).not.toHaveBeenCalled(); expect(mocks.toast).toHaveBeenCalled();
});
it("discards a late export authorization after leaving the detail", async () => {
  let finish!: (value: {watts: number[]}) => void;
  const resolve = () => new Promise<{watts: number[]}>(yes => { finish = yes; });
  const view = render(<ExportTab activity={activity} streams={{ watts: [999] }} resolveCurrentStreams={resolve} />);
  fireEvent.click(screen.getByText("CSV")); view.unmount();
  await act(async () => finish({ watts: [0] }));
  expect(mocks.csv).not.toHaveBeenCalled();
});

it("keeps legacy Health Connect cadence after the user confirms its unit", async () => {
  const run = { ...activity, type: "Run", source: "health_connect" } as Activity;
  const streams = { cadence: [180], time: [0] };
  render(<ExportTab activity={run} streams={streams} />);
  await act(async () => fireEvent.click(screen.getByText("FIT")));
  expect(mocks.fit).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /both feet|양발|cadenceUnitOption.spm/iu })));
  expect(mocks.fit).toHaveBeenCalledOnce();
  expect(readStreamCadenceUnit(mocks.fit.mock.calls[0]![1])).toBe("spm");
  expect(mocks.fit.mock.calls[0]![1].cadence).toEqual([180]);
});

it("does not apply the old cadence choice to changed authorized samples", async () => {
  const run = { ...activity, type: "Run", source: "health_connect" } as Activity;
  const streams = { cadence: [180], time: [0] };
  const resolve = vi.fn().mockResolvedValueOnce(streams).mockResolvedValue({ cadence: [89], time: [0] });
  render(<ExportTab activity={run} streams={streams} resolveCurrentStreams={resolve} />);
  const confirm = () => screen.getByRole("button", { name: /both feet|양발|cadenceUnitOption.spm/iu });
  await act(async () => fireEvent.click(screen.getByText("FIT")));
  await act(async () => fireEvent.click(confirm()));
  expect(mocks.fit).not.toHaveBeenCalled();
  expect(confirm()).toBeVisible();
  expect(resolve).toHaveBeenCalledTimes(2);
});

it("exports the rest of a legacy run when the user does not know the cadence unit", async () => {
  const run = { ...activity, type: "Run", source: "health_connect" } as Activity;
  const streams = { cadence: [180], heartrate: [155], time: [0] };
  render(<ExportTab activity={run} streams={streams} />);
  await act(async () => fireEvent.click(screen.getByText("FIT")));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /export without cadence|케이던스 없이|cadenceUnitOption.omit/iu })));
  expect(mocks.fit).toHaveBeenCalledExactlyOnceWith(run, { ...streams, cadence: undefined });
});
