import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("../services/deviceSettingsClient", () => ({
  fetchDeviceSettings: vi.fn(), putDeviceNavigationPrefs: vi.fn(), putDeviceSettings: vi.fn(),
  subscribeLatestDeviceNavigationPrefs: vi.fn(), subscribeLatestDeviceSettings: vi.fn(),
  subscribeAllDeviceSettings: mocks.subscribe,
}));
import { useAllDeviceSettings } from "./useDeviceSettings";

beforeEach(() => { vi.clearAllMocks(); mocks.subscribe.mockReturnValue(mocks.unsubscribe); });

it("다시 불러오기는 끝난 onSnapshot 구독을 새로 열어 오류를 지운다", async () => {
  const { result } = renderHook(() => useAllDeviceSettings("u1"));
  expect(mocks.subscribe).toHaveBeenCalledTimes(1);
  const [, , onError] = mocks.subscribe.mock.calls[0];
  act(() => onError(new Error("permission-denied")));
  expect(result.current.error?.message).toBe("permission-denied");

  await act(async () => { await result.current.reload(); });
  expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  expect(mocks.subscribe).toHaveBeenCalledTimes(2);
  expect(result.current.loading).toBe(true);
  const [, onNext] = mocks.subscribe.mock.calls[1];
  act(() => onNext([]));
  expect(result.current.error).toBeNull();
  expect(result.current.loading).toBe(false);
});
