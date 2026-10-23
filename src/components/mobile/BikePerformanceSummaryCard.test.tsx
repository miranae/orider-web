import GlossaryProvider from "../common/GlossaryProvider";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import BikePerformanceSummaryCard from "./BikePerformanceSummaryCard";

const completeDecision = {
  activeFtpW: 250,
  automaticCandidateW: 265,
  cpW: 270,
  recentTwentyMinuteW: 279,
  latestMonthlyEstimate: { period: "2026-07", ftpW: 265 },
  tteMin: 45,
  activityCount: 14,
};

describe("BikePerformanceSummaryCard", () => {
  it("shows a validated v6 final rider summary", () => {
    renderWithProviders(<BikePerformanceSummaryCard pdc={{ riderType: { type: "Climber", confidence: 0.9 },
      abilityScore: 82, vo2maxEst: 58, activityCount: 14, weightKgSnapshot: 70,
      version: 6, provenanceVersion: 2, measuredPower: true }} />);
    expect(screen.getByText("클라이머")).toBeInTheDocument();
  });
  it("keeps the personal PDC hierarchy and shows one simple ability score", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <BikePerformanceSummaryCard
        decision={completeDecision}
        pdc={{ riderType: { type: "Climber", confidence: 0.8 }, abilityScore: 82, vo2maxEst: 58.4, activityCount: 14,
          weightKgSnapshot: 70, version: 5, provenanceVersion: 2, measuredPower: true }}
        weightKg={70}
        progression={[{ period: "2026-06", ftpW: 255, source: "20m" }, { period: "2026-07", ftpW: 265, source: "20m" }]}
      />,
    );

    expect(screen.getByRole("heading", { name: "사이클링 퍼포먼스" })).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.getByText("3.57 W/kg")).toBeInTheDocument();
    expect(screen.getByText("클라이머")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "종합 사이클링 역량 점수" })).toHaveAttribute("aria-valuetext", "역량 점수 82/100, 최상 단계");
    expect(screen.getByText("역량 점수 82/100")).toBeInTheDocument();
    expect(within(container.querySelector('[data-performance-metric="tte"]')!).getByText("45")).toBeInTheDocument();
    const vo2Tile = container.querySelector('[data-performance-metric="vo2max"]')!;
    expect(within(vo2Tile).getByText("58")).toBeVisible();
    expect(within(vo2Tile).getByText("ml/kg/min")).toBeVisible();
    expect(within(vo2Tile).queryByRole("meter")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/상위 \d+%|O-Rider 전체|밀도|표본/);

    expect(screen.queryByRole("button", { name: "이 후보 적용" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "산출 근거 보기" }));
    expect(screen.getByText("최근 20분 최고 평균")).toBeVisible();
    expect(screen.getByText("279 W")).toBeVisible();
    expect(screen.getByText(/라이더 유형 신뢰도/)).toBeVisible();
    expect(screen.getByRole("link", { name: "PDC와 3축 산출 근거 보기" })).toHaveAttribute("href", "/web-manual/ch06-advanced.html#s6-3");
  });

  it("preserves distinct condition estimates and the full rider summary with their evidence open", () => {
    const { container } = renderWithProviders(<BikePerformanceSummaryCard part="condition" decision={completeDecision}
      pdc={{ riderType: { type: "Climber", confidence: 0.9 }, abilityScore: 82, vo2maxEst: 58.4, activityCount: 14, weightKgSnapshot: 70, version: 6, provenanceVersion: 2, measuredPower: true }} weightKg={70} />);
    expect(screen.getByText("클라이머")).toBeVisible();
    expect(screen.getByRole("meter", { name: "종합 사이클링 역량 점수" })).toHaveAttribute("aria-valuenow", "82");
    for (const [key, value] of [["eftp", "265"], ["cp", "270"], ["tte", "45"]]) expect(within(container.querySelector(`[data-performance-metric="${key}"]`)!).getByText(value)).toBeVisible();
    expect(screen.getByText("279 W")).toBeVisible();
    expect(screen.getByText(/라이더 유형 신뢰도/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "산출 근거 보기" })).not.toBeInTheDocument();
    expect(container.querySelector('[data-performance-metric="vo2max"]')).toBeNull();
  });

  it("keeps the FTP-and-weight VO2 estimate when no PDC VO2 value can represent it", () => {
    const { container } = renderWithProviders(<BikePerformanceSummaryCard part="condition" decision={completeDecision} weightKg={70} />);
    expect(within(container.querySelector('[data-performance-metric="vo2max"]')!).getByText("60")).toBeVisible();
    expect(screen.getByText(/프로필 FTP와 체중 기반 단순 근사/)).toBeVisible();
  });

  it("shows a stable empty state without inventing scores", () => {
    const { container } = renderWithProviders(<BikePerformanceSummaryCard />);
    expect(screen.getByText("라이더 유형 근거 부족")).toBeInTheDocument();
    expect(screen.getByText("역량 점수 근거 부족")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-performance-metric]")).toHaveLength(4);
  });

  it.each([
    ["low confidence", { riderType: { type: "Climber", confidence: 0.74 }, activityCount: 14, weightKgSnapshot: 70, version: 5, provenanceVersion: 2, measuredPower: true }],
    ["missing weight", { riderType: { type: "Climber", confidence: 0.9 }, activityCount: 14, weightKgSnapshot: null, version: 5, provenanceVersion: 2, measuredPower: true }],
    ["too few activities", { riderType: { type: "Climber", confidence: 0.9 }, activityCount: 4, weightKgSnapshot: 70, version: 5, provenanceVersion: 2, measuredPower: true }],
    ["legacy version", { riderType: { type: "Climber", confidence: 0.9 }, activityCount: 14, weightKgSnapshot: 70, version: 4, provenanceVersion: 2, measuredPower: true }],
  ])("does not expose a definitive RiderType for %s", (_label, gate) => {
    renderWithProviders(<BikePerformanceSummaryCard pdc={{ ...gate, abilityScore: null, vo2maxEst: null }} />);
    expect(screen.queryByText("클라이머")).not.toBeInTheDocument();
    expect(screen.getByText("라이더 유형 근거 부족")).toBeInTheDocument();
  });

  it("keeps VO2max as an estimate without a comparison meter", () => {
    const { container } = renderWithProviders(
      <BikePerformanceSummaryCard
        decision={{ ...completeDecision, automaticCandidateW: null, latestMonthlyEstimate: null, tteMin: null, cpW: 245 }}
        pdc={{ riderType: null, abilityScore: null, vo2maxEst: 52.2, activityCount: 4,
          weightKgSnapshot: null, version: 5, provenanceVersion: 2, measuredPower: true }}
      />,
    );
    const vo2Tile = container.querySelector('[data-performance-metric="vo2max"]')!;
    expect(within(vo2Tile).getByText("52")).toBeInTheDocument();
    expect(within(vo2Tile).queryByRole("meter")).not.toBeInTheDocument();
  });
});


it('explains repeated metric and evidence terms without nesting tooltip buttons in actions', async () => {
  const { container } = renderWithProviders(<GlossaryProvider><BikePerformanceSummaryCard part="analysis" decision={completeDecision} weightKg={70} /></GlossaryProvider>);
  for (const term of ['eftp', 'cp', 'tte']) {
    expect(container.querySelector(`[data-performance-metric="${term}"] [data-glossary-term="${term}"] button`)).not.toBeNull();
  }
  const trigger = container.querySelector<HTMLButtonElement>('[data-glossary-term="eftp"] button')!;
  fireEvent.focus(trigger);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.click(trigger);
  expect(screen.getByRole('tooltip')).toHaveTextContent('활동 기록과 파워 모델로 추정한 FTP');
  fireEvent.keyDown(trigger, { key: 'Escape' });
  await userEvent.click(screen.getByRole('button', { name: '산출 근거 보기' }));
  expect(container.querySelector('[data-glossary-term="pdc"] button')).not.toBeNull();
  expect(container.querySelectorAll('[data-glossary-term="eftp"] button').length).toBeGreaterThan(1);
  expect(container.querySelector('button button, a button, svg button')).toBeNull();
});


it("summarizes missing mobile estimates once while retaining valid zero and partial estimates", () => {
  const view = renderWithProviders(<BikePerformanceSummaryCard compact part="analysis" />);
  expect(view.container.querySelectorAll("[data-performance-metric]")).toHaveLength(0);
  expect(screen.getByText(/추정 근거 부족:/)).toHaveTextContent(/eFTP.*CP.*TTE/);
  view.rerender(<BikePerformanceSummaryCard compact part="analysis" decision={{ ...completeDecision, cpW: 0, tteMin: null, latestMonthlyEstimate: null }} />);
  expect(view.container.querySelectorAll("[data-performance-metric]")).toHaveLength(1);
  expect(view.container.querySelector('[data-performance-metric="cp"]')).toHaveTextContent("0");
  expect(screen.getByText(/추정 근거 부족:/)).not.toHaveTextContent("CP");
});
