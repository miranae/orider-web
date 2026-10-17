import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import i18n from "i18next";
import type { Run30Session } from "./run30Api";
import Run30WorkoutOutline from "./Run30WorkoutOutline";
import enTraining from "../../../i18n/resources/en/training.json";

const session = (english: boolean): Run30Session => {
  const segment = (stepId: string, label: string, durationSec: number) => ({ stepId, label, durationSec, targetType: "NONE" });
  const pair = [segment("run", english ? "Easy running" : "편하게 달리기", 60), segment("walk", english ? "Recovery walking" : "걷기 회복", 120)];
  return { stage: 1, localDate: "2026-10-09", status: "abandoned", previousAttemptSessionIds: [], durationSec: 1920,
    segments: [segment("warmup", english ? "Warm-up walk" : "5분 걷기 준비", 300), ...Array.from({ length: 7 }, (_, index) => pair.map(item => ({ ...item, stepId: `${index}-${item.stepId}` }))).flat(), { ...pair[0]!, stepId: "last-run" }, segment("cooldown", english ? "Cool-down walk" : "5분 걷기 정리", 300)] };
};
afterEach(async () => { await i18n.changeLanguage("ko"); });
it.each(["ko", "en"])("summarizes only the exact seven repetitions and preserves all 17 source steps in %s", async language => {
  i18n.addResourceBundle("en", "training", enTraining);
  await i18n.changeLanguage(language);
  const source = session(language === "en");
  const view = render(<Run30WorkoutOutline session={source} />);
  expect(screen.getByText(language === "ko" ? "7회 반복" : "Repeat 7 times")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: language === "ko" ? "준비" : "Warm-up" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: language === "ko" ? "정리" : "Cool-down" })).toBeInTheDocument();
  const repeatedSection = screen.getByRole("heading", { name: language === "ko" ? "반복 운동" : "Workout intervals" }).closest("section")!;
  expect(within(repeatedSection).getAllByText(language === "ko" ? "편하게 달리기" : "Easy running")).toHaveLength(1);
  const tailSection = screen.getByRole("heading", { name: language === "ko" ? "반복 후 구간" : "After the repetitions" }).closest("section")!;
  expect(tailSection).not.toBe(repeatedSection);
  expect(within(tailSection).getByText(language === "ko" ? "편하게 달리기" : "Easy running")).toBeInTheDocument();
  expect(within(tailSection).getByText(language === "ko" ? "1분" : "1 min")).toBeInTheDocument();
  const details = view.container.querySelector("details")!;
  expect(details).not.toHaveAttribute("open");
  fireEvent.click(within(details).getByText(language === "ko" ? "전체 순서 보기 · 17구간" : "View every step · 17 steps"));
  expect(details).toHaveAttribute("open");
  const rows = details.querySelectorAll("li");
  expect(rows).toHaveLength(17);
  source.segments.forEach((segment, index) => expect(rows[index]).toHaveTextContent(segment.label));
});
