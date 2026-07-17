import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HeroCard, type HeroCardOpts } from "./TodaysWorkoutPresentation";

function makeOptions(overrides: Partial<HeroCardOpts> = {}): HeroCardOpts {
  return {
    tone: "lime",
    eyebrow: "오늘의 운동",
    sessionName: "지구력",
    headerChips: [],
    factChips: [],
    narrativeText: "기본 가이드를 표시합니다.",
    isLLM: false,
    llmLoading: false,
    revalidating: false,
    justRecomputed: false,
    revalidatingMsg: "업데이트 중",
    revalidatedMsg: "완료",
    llmPreparingMsg: "준비 중",
    llmCallingMsg: "분석 중",
    ...overrides,
  };
}

describe("HeroCard narrative recovery", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ko");
  });

  it("keeps fallback copy visible and exposes an explicit retry after failure", () => {
    const retry = vi.fn();
    render(<HeroCard {...makeOptions({
      llmCacheMiss: true,
      llmError: true,
      onRequestAnalysis: retry,
    })} />);

    expect(screen.getByText("기본 가이드를 표시합니다.")).toBeVisible();
    expect(screen.getByText("AI 연결을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("uses the restored collapse state and reports the next state", () => {
    const onExpandedChange = vi.fn();
    render(<HeroCard {...makeOptions({
      narrativeText: "첫 문단\n\n둘째 문단\n\n셋째 문단",
      narrativeExpanded: false,
      onNarrativeExpandedChange: onExpandedChange,
    })} />);

    expect(screen.getByText("첫 문단")).toBeVisible();
    expect(screen.queryByText("둘째 문단")).not.toBeInTheDocument();
    const expandButton = screen.getByRole("button", { name: "자세히 보기 (2문단 더) ▼" });
    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expandButton);
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });

  it("renders a single paragraph safely without a fold control", () => {
    render(<HeroCard {...makeOptions({ narrativeExpanded: false })} />);
    expect(screen.getByText("기본 가이드를 표시합니다.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /자세히 보기|접기/ })).not.toBeInTheDocument();
  });
});
