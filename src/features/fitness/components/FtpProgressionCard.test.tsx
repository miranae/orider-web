import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import FtpProgressionCard from "./FtpProgressionCard";

describe("FtpProgressionCard", () => {
  it("renders an explicitly estimated trend and the existing training-settings CTA", () => {
    renderWithProviders(
      <FtpProgressionCard
        points={[
          { period: "2026-01", ftpW: 250, source: "1h" },
          { period: "2026-02", ftpW: 265, source: "20m" },
        ]}
        currentFtpW={250}
        breakthrough={{ currentFtpW: 250, candidateFtpW: 265, deltaW: 15, deltaPct: 0.06 }}
      />,
    );

    expect(screen.getByText("월별 추정 FTP 추이")).toBeInTheDocument();
    expect(screen.getByText(/직접 설정한 FTP 변경 이력과는 다릅니다/)).toBeInTheDocument();
    expect(screen.getByText(/월별 자동 추정 eFTP/)).toBeInTheDocument();
    expect(screen.getByText(/현재 적용 FTP 250W/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /월별 추정 FTP 추이 차트:.*250W.*265W/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "훈련 설정에서 검토" })).toHaveAttribute("href", "/ko/settings?section=training");
  });

  it("hides when neither a two-point trend nor a breakthrough is available", () => {
    const { container } = renderWithProviders(
      <FtpProgressionCard
        points={[{ period: "2026-01", ftpW: 250, source: "20m" }]}
        currentFtpW={250}
        breakthrough={null}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("exposes every monthly estimate to screen readers when embedded on mobile", () => {
    renderWithProviders(
      <FtpProgressionCard
        points={[
          { period: "2026-05", ftpW: 245, source: "20m" },
          { period: "2026-06", ftpW: 252, source: "20m" },
        ]}
        currentFtpW={250}
        breakthrough={null}
        embedded
      />,
    );

    const chart = screen.getByRole("img", { name: /월별 추정 FTP 추이 차트:.*245W.*252W/ });
    expect(chart.querySelector("desc")).toHaveTextContent(/245W.*252W/);
  });
});
