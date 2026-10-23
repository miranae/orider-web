import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import FtpProgressionCard from "./FtpProgressionCard";

describe("FtpProgressionCard", () => {
  it("renders an explicitly estimated trend and the condition threshold-review CTA", () => {
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
    expect(screen.getAllByText(/월별 자동 추정 eFTP/).length).toBeGreaterThan(0);
    expect(screen.getByText(/현재 적용 FTP 250W/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /월별 추정 FTP 추이 차트:.*250W.*265W/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "훈련 설정에서 검토" })).toHaveAttribute("href", "/ko/coach/condition?sport=bike#thresholds");
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
        compact
      />,
    );

    const chart = screen.getByRole("img", { name: /월별 추정 FTP 추이 차트:.*245W.*252W/ });
    expect(chart.querySelector("desc")).toHaveTextContent(/245W.*252W/);
    expect(screen.queryByText(/직접 설정한 FTP 변경 이력과는 다릅니다/)).not.toBeInTheDocument();
    expect(screen.queryByText(/월별 20분 최고 평균 파워의 95%/)).not.toBeInTheDocument();
  });

  it("merges applied FTP audit events with eFTP while preserving source labels", () => {
    renderWithProviders(
      <FtpProgressionCard
        points={[
          { period: "2026-05", ftpW: 245, source: "20m" },
          { period: "2026-06", ftpW: 252, source: "20m" },
        ]}
        history={[
          { id: "manual", value: 248, source: "manual", changedAt: Date.UTC(2026, 4, 15) },
          { id: "detected", value: 255, source: "detected", changedAt: Date.UTC(2026, 5, 20) },
        ]}
        currentFtpW={255}
        breakthrough={null}
      />,
    );

    expect(screen.getByText("FTP 진전과 변경 이력")).toBeInTheDocument();
    expect(screen.getAllByText(/실제 적용 FTP/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/직접 설정/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/자동 검출 제안/).length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: /월별 자동 추정 eFTP.*245W.*252W.*실제 적용 FTP.*248W.*255W/ })).toBeInTheDocument();
  });

  it("keeps applied FTP events available in a compact embedded disclosure", () => {
    renderWithProviders(<FtpProgressionCard
      points={[{ period: "2026-05", ftpW: 245, source: "20m" }, { period: "2026-06", ftpW: 252, source: "20m" }]}
      history={[{ id: "manual", value: 248, source: "manual", changedAt: Date.UTC(2026, 4, 15) }]}
      currentFtpW={248} breakthrough={null} embedded compact
    />);

    const details = screen.getByText("FTP 변경 이력 보기").closest("details");
    expect(details).toHaveAttribute("data-ftp-history");
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent("직접 설정");
    expect(screen.getByRole("img", { name: /실제 적용 FTP.*248W/ })).toBeInTheDocument();
  });

  it("shows a single real FTP change even without enough eFTP points", () => {
    renderWithProviders(
      <FtpProgressionCard
        points={[]}
        history={[{ id: "test", value: 260, source: "test", changedAt: Date.UTC(2026, 6, 1) }]}
        currentFtpW={260}
        breakthrough={null}
      />,
    );

    expect(screen.getByText("FTP 진전과 변경 이력")).toBeInTheDocument();
    expect(screen.getAllByText(/FTP 테스트/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("260 W").length).toBeGreaterThan(0);
  });
});

it("exposes estimates and real changes with keyboard details, and keeps condition history open", () => {
  const { container } = renderWithProviders(<FtpProgressionCard
    points={[{ period: "2026-05", ftpW: 245, source: "20m" }, { period: "2026-06", ftpW: 252, source: "20m" }]}
    history={[{ id: "manual", value: 248, source: "manual", changedAt: Date.UTC(2026, 4, 15) }]}
    currentFtpW={248} breakthrough={null} embedded compact showHistory
  />);
  const chart = screen.getByRole("img", { name: /FTP.*차트/ });
  fireEvent.focus(chart);
  expect(screen.getByRole("status")).toHaveTextContent("2026-06 · 252 W");
  expect(screen.getByRole("status")).toHaveTextContent("추정값");
  fireEvent.keyDown(chart, { key: "ArrowLeft" });
  expect(screen.getByRole("status")).toHaveTextContent("248 W");
  expect(screen.getByRole("status")).toHaveTextContent("실제 FTP 적용 이력");
  fireEvent.keyDown(chart, { key: "Escape" });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(container.querySelector("details")).toBeNull();
});

it("shows both estimated and applied FTP when they share a chart date", () => {
  renderWithProviders(<FtpProgressionCard
    points={[{ period: "2026-05", ftpW: 245, source: "20m" }, { period: "2026-06", ftpW: 252, source: "20m" }]}
    history={[{ id: "same-day", value: 248, source: "manual", changedAt: Date.UTC(2026, 5, 1) }]}
    currentFtpW={248} breakthrough={null}
  />);
  fireEvent.focus(screen.getByRole("img", { name: /FTP.*차트/ }));
  const detail = screen.getByRole("status");
  expect(detail).toHaveTextContent("252 W");
  expect(detail).toHaveTextContent("248 W");
  expect(detail).toHaveTextContent("월별 20분 최고 평균 파워 × 95%");
  expect(detail).toHaveTextContent("직접 설정");
});

it("shows watt values and distinct calendar dates without shrinking SVG text on compact charts", () => {
  const { container } = renderWithProviders(<FtpProgressionCard
    points={[]}
    history={[{ id: "first", value: 248, source: "manual", changedAt: Date.UTC(2026, 4, 2) }, { id: "last", value: 255, source: "test", changedAt: Date.UTC(2026, 4, 20) }]}
    currentFtpW={255} breakthrough={null} embedded compact showHistory
  />);
  const yAxis = container.querySelector(".ftp-progression__y-axis");
  expect(yAxis).toHaveTextContent("W");
  expect(yAxis).toHaveTextContent("260");
  expect(yAxis).toHaveTextContent("240");
  const xAxis = container.querySelector(".ftp-progression__x-axis");
  expect(xAxis).toHaveTextContent("5. 2.");
  expect(xAxis).toHaveTextContent("5. 20.");
  expect(screen.getByRole("img").querySelectorAll("text")).toHaveLength(0);
  fireEvent.focus(screen.getByRole("img"));
  expect(screen.getByRole("status")).toHaveTextContent("255 W");
});

it("keeps the explicit FTP readout mounted and unchanged by hover/focus while retaining keyboard record selection", () => {
  renderWithProviders(<FtpProgressionCard stableSelection points={[
    { period: "2026-05", ftpW: 245, source: "20m" },
    { period: "2026-06", ftpW: 252, source: "20m" },
  ]} history={[]} currentFtpW={250} breakthrough={null} embedded compact />);
  const chart = screen.getByRole("img");
  const readout = screen.getByRole("status");
  const before = readout.textContent;
  fireEvent.pointerMove(chart, { clientX: 0, pointerType: "mouse" });
  fireEvent.focus(chart);
  expect(readout.textContent).toBe(before);
  fireEvent.keyDown(chart, { key: "ArrowLeft" });
  expect(readout).toHaveTextContent("245 W");
  fireEvent.blur(chart);
  fireEvent.pointerLeave(chart, { pointerType: "mouse" });
  expect(screen.getByRole("status")).toBe(readout);
  expect(readout).toHaveTextContent("245 W");
  expect(screen.getByRole("combobox", { name: "FTP 기록 선택" })).toHaveTextContent("245 W");
});
