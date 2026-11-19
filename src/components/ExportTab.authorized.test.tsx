import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ExportTab from "./ExportTab";
import { markVerifiedStreamCadence } from "../services/activityStreamSource";
import type { Activity } from "@shared/types";
const mocks = vi.hoisted(() => ({ csv: vi.fn(() => "csv"), fit: vi.fn(() => new Uint8Array()), toast: vi.fn() }));
vi.mock("../utils/exportFit", () => ({ generateFit: mocks.fit }));
vi.mock("../utils/exportCsv", () => ({ generateCsv: mocks.csv }));
vi.mock("../contexts/ToastContext", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn(), reportPreviousAccountFailure: vi.fn() }));
const activity = { id: "a", description: "Ride", startTime: 1792800000000 } as Activity;
beforeEach(() => { mocks.csv.mockClear(); mocks.fit.mockClear(); mocks.toast.mockClear(); vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}); });
it("exports the newly authorized streams rather than cached props", async () => {
  const current = { watts: [0, 200], time: [0, 1] };
  const resolve = vi.fn().mockResolvedValue(current);
  render(<ExportTab activity={activity} streams={{ watts: [999] }} resolveCurrentStreams={resolve} />);
  await act(async () => fireEvent.click(screen.getByText("CSV")));
  expect(resolve).toHaveBeenCalledExactlyOnceWith("csv"); expect(mocks.csv).toHaveBeenCalledWith(current);
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

it.each([
  ["strava", "strides_per_minute"],
  ["orider", null],
  ["orider", undefined],
] as const)("only exports the cadence unit returned with the newly authorized %s stream", async (source, expected) => {
  const run = { ...activity, type: "Run", source } as Activity;
  const before = markVerifiedStreamCadence({ userId: "owner", time: [0], cadence: [180] }, "a".repeat(64), "spm");
  const current = markVerifiedStreamCadence({ userId: "owner", time: [0], cadence: [85] }, "b".repeat(64), expected);
  render(<ExportTab activity={run} streams={before} resolveCurrentStreams={async () => current} />);
  await act(async () => fireEvent.click(screen.getByText("FIT")));
  if (expected == null) {
    expect(mocks.fit).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /export without cadence|케이던스 없이|cadenceChoice.omit/iu })));
  }
  if (expected == null) expect(mocks.fit).toHaveBeenCalledWith(run, { ...current, cadence: undefined }, undefined);
  else expect(mocks.fit).toHaveBeenCalledWith(run, current, expected);
});

it("exports the displayed owner stream with the unit delivered alongside its samples", async () => {
  const run = { ...activity, type: "Run", source: "strava" } as Activity;
  const ownerStream = markVerifiedStreamCadence({ userId: "owner", time: [0], heartrate: [142], cadence: [84] },
    "b".repeat(64), "strides_per_minute");
  render(<ExportTab activity={run} streams={ownerStream} />);
  await act(async () => fireEvent.click(screen.getByText("FIT")));
  expect(mocks.fit).toHaveBeenCalledWith(run, ownerStream, "strides_per_minute");
});

it("checks the live account again before writing a delayed public file", async () => {
  const run = { ...activity, type: "Run", source: "orider" } as Activity;
  const cached = { userId: "owner", time: [0], cadence: [170] };
  let account = { uid: "owner" };
  let finish!: (value: typeof cached) => void;
  const lookup = () => new Promise<typeof cached>(resolve => { finish = resolve; });
  render(<ExportTab activity={run} streams={cached} resolveCurrentStreams={lookup} getExportAccount={() => account} />);
  fireEvent.click(screen.getByText("FIT"));
  account = { uid: "next" };
  await act(async () => finish(cached));
  expect(mocks.fit).not.toHaveBeenCalled();
});

it("lets the user specify the original cadence unit when an older backend omits it", async () => {
  const run = { ...activity, type: "Run", source: "strava" } as Activity;
  const streams = { userId: "owner", time: [0, 1, 2], cadence: [85, NaN, 86] };
  render(<ExportTab activity={run} streams={streams} />);
  await act(async () => fireEvent.click(screen.getByText("FIT")));
  expect(mocks.fit).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /strides per minute|분당 스트라이드|cadenceChoice.strides_per_minute/iu })));
  expect(mocks.fit).toHaveBeenCalledWith(run, streams, "strides_per_minute");
  await act(async () => fireEvent.click(screen.getByText("CSV")));
  expect(mocks.csv).toHaveBeenCalledWith(streams);
});


it("honors the explicit omission choice when a refreshed response now knows the unit", async () => {
  const run = { ...activity, type: "Run" } as Activity;
  const first = { userId: "owner", time: [0], cadence: [170] };
  const second = markVerifiedStreamCadence(first, "b".repeat(64), "spm");
  const resolve = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  render(<ExportTab activity={run} streams={first} resolveCurrentStreams={resolve} />);
  await act(async () => fireEvent.click(screen.getByText("FIT")));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /export without cadence|케이던스 없이|cadenceChoice.omit/iu })));
  expect(mocks.fit).toHaveBeenCalledWith(run, { ...second, cadence: undefined }, undefined);
});
