import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ClimbPredictionStatus } from "./CoursePage";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { duration?: string; wkg?: string }) => {
      if (key === "climbPrediction.result") return `estimate ${values?.duration} ${values?.wkg}`;
      return key;
    },
  }),
}));

function renderStatus(props: React.ComponentProps<typeof ClimbPredictionStatus>) {
  return render(<MemoryRouter><ClimbPredictionStatus {...props} /></MemoryRouter>);
}

describe("ClimbPredictionStatus", () => {
  it("로딩 중에는 로그인·설정 CTA 대신 중립 상태를 표시한다", () => {
    renderStatus({ prediction: null, loading: true, signedIn: true, onLogin: vi.fn() });
    expect(screen.getByText("climbPrediction.loading")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("로그아웃 확정 후 로그인 CTA를 표시한다", () => {
    const onLogin = vi.fn();
    renderStatus({ prediction: null, loading: false, signedIn: false, onLogin });
    fireEvent.click(screen.getByRole("button", { name: "climbPrediction.login" }));
    expect(onLogin).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("로그인했지만 지표가 없으면 훈련 설정 CTA를 표시한다", () => {
    renderStatus({ prediction: null, loading: false, signedIn: true, onLogin: vi.fn() });
    expect(screen.getByRole("link").getAttribute("href")).toBe("/ko/settings?section=training");
  });

  it("예측이 있으면 시간과 W/kg을 렌더한다", () => {
    renderStatus({
      prediction: { totalSec: 744, sustainablePowerW: 280, wattsPerKg: 4.12, source: "pdc" },
      loading: false,
      signedIn: true,
      onLogin: vi.fn(),
    });
    expect(screen.getByText("estimate 12:24 4.1")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
