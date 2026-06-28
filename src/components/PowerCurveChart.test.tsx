import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import PowerCurveChart from "./PowerCurveChart";

describe("PowerCurveChart", () => {
  it("explains why the chart is empty without changing layout height", () => {
    renderWithProviders(<PowerCurveChart points={[]} />);

    const emptyState = screen.getByText("파워 커브를 만들 수 없어요").closest("div");

    expect(screen.getByText("파워 커브를 만들 수 없어요")).toBeInTheDocument();
    expect(screen.getByText(/파워미터나 가상 파워가 포함된 활동/)).toBeInTheDocument();
    expect(emptyState?.parentElement?.parentElement).toHaveStyle({ minHeight: "200px" });
  });

  it("supports activity-specific empty copy", () => {
    renderWithProviders(
      <PowerCurveChart
        points={[]}
        emptyTitle="파워 스트림 부족"
        emptyDescription="이 활동의 파워 스트림이 충분히 길게 기록되면 표시됩니다."
      />,
    );

    expect(screen.getByText("파워 스트림 부족")).toBeInTheDocument();
    expect(screen.getByText("이 활동의 파워 스트림이 충분히 길게 기록되면 표시됩니다.")).toBeInTheDocument();
  });
});
