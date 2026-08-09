import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDefaultSport } from "./useDefaultSport";

const profile = vi.hoisted(() => ({ current: null as { primaryDiscipline?: string } | null }));
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ profile: profile.current }),
}));

function render(initialUrl: string, activities?: { type: string; startTime: number }[]) {
  return renderHook(() => useDefaultSport(activities), {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>,
  });
}

describe("useDefaultSport", () => {
  beforeEach(() => {
    localStorage.clear();
    profile.current = null;
  });

  it("prefers an explicit ?sport= over everything else", () => {
    profile.current = { primaryDiscipline: "bike" };

    expect(render("/?sport=run").result.current).toBe("run");
  });

  // 계정 비귀속 legacy 키 — 브라우저를 공유하는 계정 전환·위임 로그인에서 앞 사용자의
  // 종목이 다음 사용자에게 새는 원인이었다.
  it("ignores the legacy lastSport key and follows the account profile", () => {
    localStorage.setItem("lastSport", "bike");
    profile.current = { primaryDiscipline: "run" };

    expect(render("/").result.current).toBe("run");
  });

  it("clears the legacy key so it cannot leak again", () => {
    localStorage.setItem("lastSport", "bike");

    render("/");

    expect(localStorage.getItem("lastSport")).toBeNull();
  });

  it("falls back to the recent activity mix when the profile has no discipline", () => {
    localStorage.setItem("lastSport", "bike");
    const now = Date.now();

    const { result } = render("/", [
      { type: "Run", startTime: now - 1000 },
      { type: "TrailRun", startTime: now - 2000 },
      { type: "Ride", startTime: now - 3000 },
    ]);

    expect(result.current).toBe("run");
  });

  it("falls back to bike when nothing is known", () => {
    expect(render("/").result.current).toBe("bike");
  });
});
