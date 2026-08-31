import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useActiveBikeProfile } from "./useActiveBikeProfile";
import type { BikeProfile } from "../types/bikeProfile";

type Subscription = { next: (snapshot: unknown) => void };

const mocks = vi.hoisted(() => ({
  subscriptions: [] as Subscription[],
  setDoc: vi.fn(),
  deleteCallable: vi.fn(),
  profiles: [] as BikeProfile[],
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_base: unknown, ...parts: string[]) => ({ kind: "document", path: parts.join("/") })),
  onSnapshot: vi.fn((_target: unknown, next: (snapshot: unknown) => void) => {
    mocks.subscriptions.push({ next });
    return vi.fn();
  }),
  setDoc: (...args: unknown[]) => mocks.setDoc(...args),
}));
vi.mock("../services/firebase", () => ({
  firestore: {},
  auth: {},
  functions: {},
  ensureAppCheckReady: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("../features/bikeProfileLayout/client", () => ({
  callDeleteBikeProfileAndLayout: (...args: unknown[]) => mocks.deleteCallable(...args),
}));
vi.mock("./useBikeProfiles", () => ({
  useBikeProfiles: () => ({
    profiles: mocks.profiles,
    loading: false,
    updateVirtualPower: vi.fn(),
    renameProfile: vi.fn(),
    updateWheelCircumference: vi.fn(),
    removeSensor: vi.fn(),
  }),
}));

function profile(id: string, updatedAt = 0): BikeProfile {
  return {
    id,
    name: id,
    sensors: [],
    wheelCircumferenceMm: 2105,
    virtualPower: { enabled: false } as BikeProfile["virtualPower"],
    createdAt: 0,
    updatedAt,
  } as BikeProfile;
}

/**
 * 웹의 자전거 선택 의미 (#1943 §4, #1950).
 *
 * 예전에는 웹에서 자전거를 고르면 계정 문서의 `activeProfileId` 를 덮어썼다. 그건 **기기 로컬**
 * 값이라, 웹에서 구경만 해도 사용자의 라이딩 기기가 다음 주행에 쓸 자전거가 바뀌었다.
 */
describe("useActiveBikeProfile", () => {
  beforeEach(() => {
    mocks.subscriptions.length = 0;
    mocks.setDoc.mockReset();
    mocks.deleteCallable.mockReset().mockResolvedValue(undefined);
    mocks.profiles = [profile("road", 200), profile("gravel", 100)];
    window.localStorage.clear();
  });

  it("웹 선택은 계정 문서를 건드리지 않는다", async () => {
    const { result } = renderHook(() => useActiveBikeProfile("uid-a"));

    act(() => result.current.setActive("gravel"));

    await waitFor(() => expect(result.current.active?.id).toBe("gravel"));
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  /** 계정별 키에 담는다 — 공용 키면 계정을 바꿔도 이전 계정의 선택이 남는다. */
  it("선택은 계정별 키로 이 브라우저에 남는다", async () => {
    const { result } = renderHook(() => useActiveBikeProfile("uid-a"));
    act(() => result.current.setActive("gravel"));

    const other = renderHook(() => useActiveBikeProfile("uid-b"));

    await waitFor(() => expect(other.result.current.active?.id).toBe("road"));
    expect(window.localStorage.getItem("orider.bikeProfile.webSelected.uid-a")).toBe("gravel");
  });

  /** 계정 기본값은 **명시적 조작으로만** 쓴다. */
  it("계정 기본값 변경은 defaultProfileId 를 쓴다", async () => {
    const { result } = renderHook(() => useActiveBikeProfile("uid-a"));

    await act(async () => {
      await result.current.setAccountDefault("gravel");
    });

    expect(mocks.setDoc).toHaveBeenCalledTimes(1);
    expect(mocks.setDoc.mock.calls[0]![1]).toEqual({ defaultProfileId: "gravel" });
  });

  /** 선택이 없으면 계정 기본값을 따른다 — 새 브라우저가 아무 자전거나 보여주면 안 된다. */
  it("선택이 없으면 계정 기본값을 본다", async () => {
    const { result } = renderHook(() => useActiveBikeProfile("uid-a"));

    act(() => mocks.subscriptions[0]!.next({ data: () => ({ defaultProfileId: "gravel" }) }));

    await waitFor(() => expect(result.current.active?.id).toBe("gravel"));
  });

  /**
   * 삭제는 callable 로 간다.
   *
   * client hard delete 는 형제 레이아웃 문서를 orphan 으로 남기고, 다른 기기가 그 레이아웃을
   * 근거로 프로필을 되살린다.
   */
  it("삭제는 tombstone callable 을 부른다", async () => {
    const { result } = renderHook(() => useActiveBikeProfile("uid-a"));

    await act(async () => {
      await result.current.deleteProfile("gravel");
    });

    expect(mocks.deleteCallable).toHaveBeenCalledTimes(1);
    expect(mocks.deleteCallable.mock.calls[0]![0]).toBe("gravel");
  });

  /** 삭제가 실패하면 활성도 옮기지 않는다 — 지워지지도 않은 자전거를 두고 상태만 흔들린다. */
  it("삭제 실패면 활성 이동도 하지 않는다", async () => {
    mocks.deleteCallable.mockRejectedValue(new Error("kill switch"));
    const { result } = renderHook(() => useActiveBikeProfile("uid-a"));

    await act(async () => {
      await expect(result.current.deleteProfile("road")).rejects.toThrow();
    });

    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});
