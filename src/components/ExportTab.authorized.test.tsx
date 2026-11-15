import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ExportTab from "./ExportTab";
import type { Activity } from "@shared/types";
const mocks = vi.hoisted(() => ({ csv: vi.fn(() => "csv"), toast: vi.fn() }));
vi.mock("../utils/exportCsv", () => ({ generateCsv: mocks.csv }));
vi.mock("../contexts/ToastContext", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
const auth = vi.hoisted(() => ({ currentUser: { uid: "owner-a" } as { uid: string } | null }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => ({ auth }) }));
const activity = { id: "a", description: "Ride", startTime: 1792800000000 } as Activity;
beforeEach(() => { auth.currentUser = { uid: "owner-a" }; mocks.csv.mockClear(); mocks.toast.mockClear(); vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}); });
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
it("내보내기 실패 알림 문구를 누르면 같은 형식으로 다시 내보낸다 — 다른 활동으로 옮겼으면 하지 않는다", async () => {
  const resolve = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue({ watts: [1] });
  const view = render(<ExportTab activity={activity} streams={{ watts: [999] }} resolveCurrentStreams={resolve} />);
  await act(async () => fireEvent.click(screen.getByText("CSV")));
  expect(mocks.toast).toHaveBeenCalledWith(expect.any(String), "error", { resolve: { onClick: expect.any(Function) } });
  const retry = mocks.toast.mock.calls.at(-1)![2].resolve.onClick as () => void;
  await act(async () => retry());
  expect(resolve).toHaveBeenCalledTimes(2);
  expect(mocks.csv).toHaveBeenCalledWith({ watts: [1] });

  resolve.mockRejectedValueOnce(new Error("network"));
  await act(async () => fireEvent.click(screen.getByText("CSV")));
  const stale = mocks.toast.mock.calls.at(-1)![2].resolve.onClick as () => void;
  view.rerender(<ExportTab activity={{ ...activity, id: "b" }} streams={{ watts: [999] }} resolveCurrentStreams={resolve} />);
  await act(async () => stale());
  expect(resolve).toHaveBeenCalledTimes(3);
});
it("내보내기 실패 뒤 계정이 바뀌면 알림 문구를 눌러도 다시 내보내지 않는다", async () => {
  const resolve = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue({ watts: [1] });
  render(<ExportTab activity={activity} streams={{ watts: [999] }} resolveCurrentStreams={resolve} />);
  await act(async () => fireEvent.click(screen.getByText("CSV")));
  const retry = mocks.toast.mock.calls.at(-1)![2].resolve.onClick as () => void;
  auth.currentUser = { uid: "owner-b" };
  await act(async () => retry());
  auth.currentUser = null;
  await act(async () => retry());
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(mocks.csv).not.toHaveBeenCalled();
});
