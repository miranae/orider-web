import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ExportTab from "./ExportTab";
import { markPublicStreamRevision } from "../services/activityStreamSource";
import type { Activity } from "@shared/types";
const mocks = vi.hoisted(() => ({ csv: vi.fn(() => "csv"), fit: vi.fn(() => new Uint8Array()), toast: vi.fn() }));
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

it.each([
  ["strava", "a", "spm"],
  ["strava", "b", null],
  ["orider", "b", "spm"],
] as const)("exports %s cadence only with a current stream unit (revision %s)", async (source, revision, expected) => {
  const run = { ...activity, type: "Run", source } as Activity;
  const before = markPublicStreamRevision({ time: [0], cadence: [180] }, "a".repeat(64));
  const current = markPublicStreamRevision({ time: [0], cadence: [180] }, revision.repeat(64));
  render(<ExportTab activity={run} streams={before} cadenceUnit="spm" resolveCurrentStreams={async () => current} />);
  await act(async () => fireEvent.click(screen.getByText("FIT")));
  expect(mocks.fit).toHaveBeenCalledWith(run, current, expected);
});
