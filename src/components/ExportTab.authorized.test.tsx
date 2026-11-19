import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ExportTab from "./ExportTab";
import { markVerifiedStreamCadence } from "../services/activityStreamSource";
import type { Activity, ActivityStreams } from "@shared/types";
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
  expect(resolve).toHaveBeenLastCalledWith("fit");
});


it("requires a new cadence choice when a refreshed stream revision replaced the first", async () => {
  const run = { ...activity, type: "Run" } as Activity;
  const samples = { userId: "owner", time: [0], cadence: [85] };
  const first = markVerifiedStreamCadence(samples, "a".repeat(64), null);
  const second = markVerifiedStreamCadence(samples, "b".repeat(64), null);
  const resolve = vi.fn().mockResolvedValueOnce(first).mockResolvedValue(second);
  render(<ExportTab activity={run} streams={first} resolveCurrentStreams={resolve} />);
  await act(async () => fireEvent.click(screen.getByText("FIT")));
  const unit = () => screen.getByRole("button", { name: /strides per minute|분당 스트라이드|cadenceChoice.strides_per_minute/iu });
  await act(async () => fireEvent.click(unit()));
  expect(mocks.fit).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(unit()));
  expect(mocks.fit).toHaveBeenCalledWith(run, second, "strides_per_minute");
});


it("generates only the file chosen most recently when two confirmations overlap", async () => {
  const run = { ...activity, type: "Run" } as Activity;
  const samples = { userId: "owner", time: [0], cadence: [85] };
  let first!: (value: typeof samples) => void;
  let last!: (value: typeof samples) => void;
  const resolve = vi.fn().mockResolvedValueOnce(samples)
    .mockReturnValueOnce(new Promise<typeof samples>(done => { first = done; }))
    .mockReturnValueOnce(new Promise<typeof samples>(done => { last = done; }));
  render(<ExportTab activity={run} streams={samples} resolveCurrentStreams={resolve} />);
  await act(async () => fireEvent.click(screen.getByText("FIT")));
  fireEvent.click(screen.getByRole("button", { name: /strides per minute|분당 스트라이드|cadenceChoice.strides_per_minute/iu }));
  fireEvent.click(screen.getByRole("button", { name: /export without cadence|케이던스 없이|cadenceChoice.omit/iu }));
  await act(async () => last(samples));
  await act(async () => first(samples));
  expect(mocks.fit).toHaveBeenCalledExactlyOnceWith(run, { ...samples, cadence: undefined }, undefined);
});


it("allows simultaneous exports of different formats", async () => {
  const samples = { userId: "owner", time: [0], watts: [200] };
  let fit!: (value: typeof samples) => void;
  let csv!: (value: typeof samples) => void;
  const resolve = vi.fn()
    .mockReturnValueOnce(new Promise<typeof samples>(done => { fit = done; }))
    .mockReturnValueOnce(new Promise<typeof samples>(done => { csv = done; }));
  render(<ExportTab activity={activity} streams={samples} resolveCurrentStreams={resolve} />);
  fireEvent.click(screen.getByText("FIT"));
  fireEvent.click(screen.getByText("CSV"));
  await act(async () => csv(samples));
  await act(async () => fit(samples));
  expect(mocks.csv).toHaveBeenCalledExactlyOnceWith(samples);
  expect(mocks.fit).toHaveBeenCalledExactlyOnceWith(activity, samples, undefined);
});

it("closes the cadence options after a confirmed export denial", async () => {
  const run = { ...activity, type: "Run" } as Activity;
  const samples = { userId: "owner", time: [0], cadence: [85] };
  const resolve = vi.fn().mockResolvedValueOnce(samples).mockRejectedValue(new Error("permission-denied"));
  render(<ExportTab activity={run} streams={samples} resolveCurrentStreams={resolve} />);
  await act(async () => fireEvent.click(screen.getByText("FIT")));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /strides per minute|분당 스트라이드|cadenceChoice.strides_per_minute/iu })));
  expect(screen.queryByRole("button", { name: /export without cadence|케이던스 없이|cadenceChoice.omit/iu })).toBeNull();
  expect(mocks.fit).not.toHaveBeenCalled();
});


it("finishes a download when unrelated activity metadata changes during verification", async () => {
  const samples = { userId: "owner", time: [0], watts: [200] };
  const authorizationScope = {};
  let finish!: (value: typeof samples) => void;
  const resolve = () => new Promise<typeof samples>(done => { finish = done; });
  const view = render(<ExportTab activity={activity} streams={samples} resolveCurrentStreams={resolve} authorizationScope={authorizationScope} />);
  fireEvent.click(screen.getByText("FIT"));
  view.rerender(<ExportTab activity={{ ...activity, kudosCount: 3 }} streams={samples}
    resolveCurrentStreams={async () => samples} authorizationScope={authorizationScope} />);
  await act(async () => finish(samples));
  expect(mocks.fit).toHaveBeenCalledExactlyOnceWith({ ...activity, kudosCount: 3 }, samples, undefined);
});


it("asks how to handle unassigned TCX observations and downloads the chosen edition", async () => {
  const run = { ...activity, type: "Run", summary: { distance: 1100, ridingTimeMillis: 120_000, elapsedTimeMillis: 130_000 } } as Activity;
  const samples = { userId: "owner", time: [0, 120, 125], heartrate: [140, 150, 145],
    laps: [{ durationMs: 120_000, distanceKm: 1, startTimeMs: run.startTime, endTimeMs: run.startTime + 120_000 }],
  } as unknown as ActivityStreams;
  const resolve = vi.fn().mockResolvedValue(samples);
  const click = vi.mocked(HTMLAnchorElement.prototype.click);
  click.mockClear();
  render(<ExportTab activity={run} streams={samples} resolveCurrentStreams={resolve} />);
  await act(async () => fireEvent.click(screen.getByText("TCX")));
  expect(click).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /save all samples|모든 표본을 한 랩|tcxLapsChoice.activity/iu })));
  expect(resolve).toHaveBeenCalledTimes(2);
  expect(click).toHaveBeenCalledOnce();
});


it("writes the latest recorded summary when verification outlasts a metadata refresh", async () => {
  const original = { ...activity, summary: { distance: 1000, ridingTimeMillis: 60_000 } } as Activity;
  const latest = { ...original, summary: { ...original.summary, distance: 1200 } };
  const samples = { userId: "owner", time: [0], watts: [200] };
  let finish!: (value: typeof samples) => void;
  const resolve = () => new Promise<typeof samples>(done => { finish = done; });
  const view = render(<ExportTab activity={original} streams={samples} resolveCurrentStreams={resolve} />);
  fireEvent.click(screen.getByText("FIT"));
  view.rerender(<ExportTab activity={latest} streams={samples} resolveCurrentStreams={resolve} />);
  await act(async () => finish(samples));
  expect(mocks.fit).toHaveBeenCalledExactlyOnceWith(latest, samples, undefined);
});


it("refreshes the TCX choice before using it on changed lap inputs", async () => {
  const run = { ...activity, type: "Run", summary: { distance: 1100, ridingTimeMillis: 120_000, elapsedTimeMillis: 130_000 } } as Activity;
  const samples = {
    userId: "owner", time: [0, 120, 125], heartrate: [140, 150, 145],
    laps: [{ durationMs: 120_000, distanceKm: 1, startTimeMs: run.startTime, endTimeMs: run.startTime + 120_000 }],
  } as ActivityStreams;
  const first = markVerifiedStreamCadence(samples, "a".repeat(64), null);
  const second = markVerifiedStreamCadence({ ...samples, time: [0, 120, 130] }, "b".repeat(64), null);
  const resolve = vi.fn().mockResolvedValueOnce(first).mockResolvedValue(second);
  const click = vi.mocked(HTMLAnchorElement.prototype.click);
  click.mockClear();
  render(<ExportTab activity={run} streams={samples} resolveCurrentStreams={resolve} />);
  const confirm = () => screen.getByRole("button", { name: /keep recorded laps|기록된 랩 유지|tcxLapsChoice.recorded/iu });
  await act(async () => fireEvent.click(screen.getByText("TCX")));
  await act(async () => fireEvent.click(confirm()));
  expect(click).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(confirm()));
  expect(click).toHaveBeenCalledOnce();
});


it("keeps raw cadence in CSV when an all-sample TCX lacks an elapsed-time total", async () => {
  const run = { ...activity, type: "Run", summary: { distance: 1100, ridingTimeMillis: 120_000 } } as Activity;
  const samples = { userId: "owner", time: [0, 120, 125], cadence: [80, 81, 82],
    laps: [{ durationMs: 120_000, distanceKm: 1, startTimeMs: run.startTime, endTimeMs: run.startTime + 120_000 }],
  } as unknown as ActivityStreams;
  render(<ExportTab activity={run} streams={samples} resolveCurrentStreams={async () => samples} />);
  await act(async () => fireEvent.click(screen.getByText("TCX")));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /export without cadence|케이던스 없이|cadenceChoice.omit/iu })));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /save all samples as csv|모든 표본을 CSV|tcxLapsChoice.csv/iu })));
  expect(mocks.csv).toHaveBeenCalledExactlyOnceWith(samples);
});

it("drops obsolete lap options if the new activity fits its recorded laps", async () => {
  const run = { ...activity, type: "Run", summary: { distance: 1100, ridingTimeMillis: 120_000, elapsedTimeMillis: 130_000 } } as Activity;
  const laps = [{ durationMs: 120_000, distanceKm: 1 }];
  const initial = { userId: "owner", time: [0, 120, 125], heartrate: [140, 150, 145], laps } as ActivityStreams;
  const latest = { ...initial, time: [0, 120], heartrate: [140, 150] };
  const resolve = vi.fn().mockResolvedValueOnce(initial).mockResolvedValue(latest);
  const click = vi.mocked(HTMLAnchorElement.prototype.click);
  click.mockClear();
  render(<ExportTab activity={run} streams={initial} resolveCurrentStreams={resolve} />);
  await act(async () => fireEvent.click(screen.getByText("TCX")));
  const option = /save all samples|모든 표본을 한 랩|tcxLapsChoice.activity/iu;
  await act(async () => fireEvent.click(screen.getByRole("button", { name: option })));
  expect(screen.queryByRole("button", { name: option })).toBeNull();
  expect(click).toHaveBeenCalledOnce();
});
