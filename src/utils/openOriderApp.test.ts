import { describe, expect, it, vi } from "vitest";
import { openOriderApp } from "./openOriderApp";
import { ORIDER_APP_STORE_URL, ORIDER_PLAY_STORE_URL } from "../constants/appStoreLinks";

function fakeWindow(userAgent: string) {
  const listeners: Array<() => void> = [];
  const timers: Array<() => void> = [];
  const win = {
    navigator: { userAgent },
    document: { visibilityState: "visible", addEventListener: (_: string, fn: () => void) => listeners.push(fn), removeEventListener: vi.fn() },
    location: { href: "" },
    setTimeout: (fn: () => void) => { timers.push(fn); return 1; },
  };
  return { win: win as unknown as Window, state: win, listeners, timers };
}

describe("openOriderApp", () => {
  it("앱 링크를 먼저 열고 앱이 열리지 않으면 기기에 맞는 스토어로 보낸다", () => {
    const ios = fakeWindow("iPhone");
    openOriderApp("coach", ios.win);
    expect(ios.state.location.href).toBe("orider://coach");
    ios.timers.forEach(fn => fn());
    expect(ios.state.location.href).toBe(ORIDER_APP_STORE_URL);

    const android = fakeWindow("Linux; Android 14");
    openOriderApp("/coach", android.win);
    expect(android.state.location.href).toBe("orider://coach");
    android.timers.forEach(fn => fn());
    expect(android.state.location.href).toBe(ORIDER_PLAY_STORE_URL);
  });

  it("앱이 열려 화면이 가려지면 스토어로 보내지 않는다", () => {
    const ios = fakeWindow("iPhone");
    openOriderApp("coach", ios.win);
    ios.state.document.visibilityState = "hidden";
    ios.listeners.forEach(fn => fn());
    ios.timers.forEach(fn => fn());
    expect(ios.state.location.href).toBe("orider://coach");
  });
});
