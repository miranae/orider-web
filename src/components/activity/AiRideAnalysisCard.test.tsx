import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { setCallableResult } from "../../__tests__/mocks/firebase";
import AiRideAnalysisCard from "./AiRideAnalysisCard";

describe("AiRideAnalysisCard", () => {
  it("shows saved AI summary instead of a fresh analysis CTA when detail cache misses", async () => {
    setCallableResult("getActivityNarrative", { data: { hit: false } });

    renderWithProviders(
      <AiRideAnalysisCard
        activityId="strava_19098693941"
        enabled
        summaryPreview="전반적으로 안정적인 페이스의 라이딩이었습니다."
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("전반적으로 안정적인 페이스의 라이딩이었습니다.")).toBeInTheDocument();
    });
    expect(screen.queryByText("분석시작")).not.toBeInTheDocument();
    expect(screen.getByText(/저장된 AI 요약/)).toBeInTheDocument();
  });

  it("keeps the saved AI summary and hides raw auth errors when detail reload is unauthenticated", async () => {
    setCallableResult("getActivityNarrative", { data: { hit: false } });

    renderWithProviders(
      <AiRideAnalysisCard
        activityId="strava_19098693941"
        enabled
        summaryPreview="저장된 요약은 계속 보여야 합니다."
      />,
      { authenticated: true },
    );

    await waitFor(() => {
      expect(screen.getByText("저장된 요약은 계속 보여야 합니다.")).toBeInTheDocument();
    });

    setCallableResult("getActivityNarrative", Promise.reject(new Error("Unauthenticated")));
    fireEvent.click(screen.getByRole("button", { name: "상세 분석 다시 불러오기" }));

    await waitFor(() => {
      expect(screen.getByText("저장된 요약은 계속 보여야 합니다.")).toBeInTheDocument();
      expect(screen.getByText(/로그인 상태를 확인/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/분석 실패/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Unauthenticated/)).not.toBeInTheDocument();
  });
});
