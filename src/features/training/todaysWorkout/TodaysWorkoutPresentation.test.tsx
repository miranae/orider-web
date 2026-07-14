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
});
