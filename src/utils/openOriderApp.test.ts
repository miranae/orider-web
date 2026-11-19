import { describe, expect, it, vi } from "vitest";
import { logClientError } from "../services/errorLogger";
import { canOpenOriderApp, openOriderApp } from "./openOriderApp";

vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));

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
  it("앱 링크를 먼저 열고 앱이 열리지 않으면 원래 웹 목적지로 간다", () => {
    const phone = fakeWindow("iPhone");
    openOriderApp("/records/run", "https://orider.co.kr/ko/athlete/me/records?sport=run", phone.win);
    expect(phone.state.location.href).toBe("orider://records/run");
    phone.timers.forEach(fn => fn());
    expect(phone.state.location.href).toBe("https://orider.co.kr/ko/athlete/me/records?sport=run");
    expect(logClientError).toHaveBeenCalledWith("openOriderApp.webFallback", expect.any(Error), {
      appPath: "records/run",
      fallbackUrl: "https://orider.co.kr/ko/athlete/me/records?sport=run",
    });
  });

  it("앱이 열려 화면이 가려지면 웹으로 넘어가지 않는다", () => {
    vi.mocked(logClientError).mockClear();
    const phone = fakeWindow("Android");
    openOriderApp("coach/run-thresholds", "https://orider.co.kr/ko/coach/condition", phone.win);
    phone.state.document.visibilityState = "hidden";
    phone.listeners.forEach(fn => fn());
    phone.timers.forEach(fn => fn());
    expect(phone.state.location.href).toBe("orider://coach/run-thresholds");
    expect(logClientError).not.toHaveBeenCalled();
  });
});

describe("canOpenOriderApp", () => {
  it("휴대폰 브라우저에서만 앱을 연다", () => {
    expect(canOpenOriderApp({ navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)" } } as unknown as Window)).toBe(true);
    expect(canOpenOriderApp({ navigator: { userAgent: "Mozilla/5.0 (Linux; Android 14)" } } as unknown as Window)).toBe(true);
    expect(canOpenOriderApp({ navigator: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" } } as unknown as Window)).toBe(false);
  });
});
