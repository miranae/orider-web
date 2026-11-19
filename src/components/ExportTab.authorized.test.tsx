import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ExportTab from "./ExportTab";
import { markVerifiedStreamCadence } from "../services/activityStreamSource";
import type { Activity } from "@shared/types";
const mocks = vi.hoisted(() => ({ csv: vi.fn(() => "csv"), fit: vi.fn(() => new Uint8Array()), toast: vi.fn(), log: vi.fn() }));
vi.mock("../utils/exportFit", () => ({ generateFit: mocks.fit }));
vi.mock("../utils/exportCsv", () => ({ generateCsv: mocks.csv }));
vi.mock("../contexts/ToastContext", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock("../services/errorLogger", () => ({ logClientError: mocks.log }));
const activity = { id: "a", description: "Ride", startTime: 1792800000000 } as Activity;
beforeEach(() => { mocks.csv.mockClear(); mocks.fit.mockClear(); mocks.toast.mockClear(); mocks.log.mockClear(); vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}); });
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
  expect(mocks.fit).toHaveBeenCalledWith(run, current, expected);
});

it("reloads verified samples and cadence for a legacy owner Strava FIT export", async () => {
  const run = { ...activity, type: "Run", source: "strava" } as Activity;
  const before = { userId: "owner", time: [0], cadence: [84] };
  const current = markVerifiedStreamCadence({ ...before, cadence: [85] }, "b".repeat(64), "strides_per_minute");
  const resolveOwnerCadenceStreams = vi.fn().mockResolvedValue(current);
  render(<ExportTab activity={run} streams={before} resolveOwnerCadenceStreams={resolveOwnerCadenceStreams} />);
  await act(async () => fireEvent.click(screen.getByText("CSV")));
  expect(resolveOwnerCadenceStreams).not.toHaveBeenCalled();
  expect(mocks.csv).toHaveBeenCalledWith(before);
  await act(async () => fireEvent.click(screen.getByText("FIT")));
  expect(resolveOwnerCadenceStreams).toHaveBeenCalledOnce();
  expect(mocks.fit).toHaveBeenCalledWith(run, current, "strides_per_minute");
});

it.each([null, new Error("activity_request_timeout"),
  Object.assign(new Error("provider failure"), { code: "functions/internal" })])("exports an owner run when the cadence lookup cannot return a unit (%s)", async (failure) => {
  const run = { ...activity, type: "Run", source: "strava" } as Activity;
  const cached = { userId: "owner", time: [0], cadence: [84] };
  const lookup = failure ? vi.fn().mockRejectedValue(failure) : vi.fn().mockResolvedValue(null);
  const view = render(<ExportTab activity={run} streams={cached} resolveOwnerCadenceStreams={lookup} />);
  await act(async () => fireEvent.click(screen.getByText("FIT")));
  expect(lookup).toHaveBeenCalledOnce();
  expect(mocks.fit).toHaveBeenCalledWith(run, cached, undefined);
  lookup.mockClear();
  const malformed = { ...cached, cadence: { 0: 85, length: 1 } } as unknown as typeof cached;
  view.rerender(<ExportTab activity={run} streams={malformed} resolveOwnerCadenceStreams={lookup} />);
  await act(async () => fireEvent.click(screen.getByText("FIT")));
  expect(lookup).not.toHaveBeenCalled();
  expect(mocks.fit).toHaveBeenCalledTimes(2);
});

it("drops an owner export from a replaced resolver scope", async () => {
  const run = { ...activity, type: "Run", source: "strava" } as Activity;
  const cached = { userId: "owner", time: [0], cadence: [84] };
  let finish!: (value: typeof cached) => void;
  const lookup = () => new Promise<typeof cached>(resolve => { finish = resolve; });
  const view = render(<ExportTab activity={run} streams={cached} resolveOwnerCadenceStreams={lookup} />);
  fireEvent.click(screen.getByText("FIT"));
  view.rerender(<ExportTab activity={run} streams={cached} resolveOwnerCadenceStreams={async () => null} />);
  await act(async () => finish(cached));
  expect(mocks.fit).not.toHaveBeenCalled();
});

it("does not use cached samples when owner cadence authorization is denied", async () => {
  const run = { ...activity, type: "Run", source: "strava" } as Activity;
  const cached = { userId: "owner", time: [0], cadence: [84] };
  const denied = Object.assign(new Error("permission denied"), { code: "functions/permission-denied" });
  render(<ExportTab activity={run} streams={cached} resolveOwnerCadenceStreams={async () => { throw denied; }} />);
  await act(async () => fireEvent.click(screen.getByText("FIT")));
  expect(mocks.fit).not.toHaveBeenCalled();
  expect(mocks.toast).toHaveBeenCalled();
});

it("checks the live account again before writing a delayed owner file", async () => {
  const run = { ...activity, type: "Run", source: "orider" } as Activity;
  const cached = { userId: "owner", time: [0], cadence: [170] };
  let account = { uid: "owner" };
  let finish!: (value: typeof cached) => void;
  const lookup = () => new Promise<typeof cached>(resolve => { finish = resolve; });
  render(<ExportTab activity={run} streams={cached} resolveOwnerCadenceStreams={lookup} getExportAccount={() => account} />);
  fireEvent.click(screen.getByText("FIT"));
  account = { uid: "next" };
  await act(async () => finish(cached));
  expect(mocks.fit).not.toHaveBeenCalled();
});

it("records a delayed owner lookup failure after leaving the detail", async () => {
  const run = { ...activity, type: "Run", source: "strava" } as Activity;
  const cached = { userId: "owner", time: [0], cadence: [85] };
  let fail!: (error: Error) => void;
  const lookup = () => new Promise<never>((_resolve, reject) => { fail = reject; });
  const view = render(<ExportTab activity={run} streams={cached} resolveOwnerCadenceStreams={lookup} />);
  fireEvent.click(screen.getByText("FIT"));
  view.unmount();
  const error = new Error("activity_request_timeout");
  await act(async () => fail(error));
  expect(mocks.log).toHaveBeenCalledExactlyOnceWith("ExportTab.ownerCadenceLookup", error, undefined);
  expect(mocks.fit).not.toHaveBeenCalled();
  expect(mocks.toast).not.toHaveBeenCalled();
});

it("does not download an owner stream that was replaced during lookup", async () => {
  const run = { ...activity, type: "Run", source: "strava" } as Activity;
  const cached = { userId: "owner", time: [0], cadence: [84] };
  let finish!: (value: typeof cached) => void;
  const lookup = () => new Promise<typeof cached>(resolve => { finish = resolve; });
  const view = render(<ExportTab activity={run} streams={cached} resolveOwnerCadenceStreams={lookup} />);
  fireEvent.click(screen.getByText("FIT"));
  view.rerender(<ExportTab activity={run} streams={{ ...cached, cadence: [85] }} resolveOwnerCadenceStreams={lookup} />);
  await act(async () => finish(cached));
  expect(mocks.fit).not.toHaveBeenCalled();
});
