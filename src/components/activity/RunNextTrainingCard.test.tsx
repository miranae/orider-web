import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ko from "../../i18n/resources/ko/activity.json";
import en from "../../i18n/resources/en/activity.json";
import koTraining from "../../i18n/resources/ko/training.json";
import enTraining from "../../i18n/resources/en/training.json";
import RunNextTrainingCard from "./RunNextTrainingCard";
import RunPlanPreview from "./RunPlanPreview";
import type { RunNextTrainingSession } from "../../hooks/useRunNextTraining";
const state = vi.hoisted(() => ({ language: "ko" as "ko" | "en" }));
vi.mock("react-i18next", () => ({ useTranslation: (namespace: string) => ({ t: (key: string, values?: Record<string, unknown>) => {
  const resource = namespace === "training" ? state.language === "ko" ? koTraining : enTraining : state.language === "ko" ? ko : en;
  const text = key.split(".").reduce<unknown>((node, part) => node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined, resource);
  return typeof text === "string" ? text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? "")) : key;
} }) }));
vi.mock("../../hooks/useLocalizedNavigate", () => ({ useLocalizedPath: (path: string) => `/${state.language}${path}` }));
const session: RunNextTrainingSession = { goalId: "goal exact", weekId: "week-02", dayIndex: 3, localDate: "2026-10-01", date: 1, workout: "easyRun", title: "합성 이지 러닝", durationMin: 30, steps: [{ label: "WU", durationMin: 5 }, { label: "Z2", durationMin: 20 }, { label: "CD", durationMin: 5 }], source: "persisted-plan" };
describe("next planned running card", () => {
  it.each(["ko", "en"] as const)("shows measured plan facts and exact read-only destination %s", language => {
    state.language = language;
    render(<MemoryRouter><RunNextTrainingCard state={{ status: "ready", session }} /></MemoryRouter>);
    const card = screen.getByTestId("run-next-training-card");
    expect(card).toHaveTextContent("합성 이지 러닝");
    expect(card).toHaveTextContent("2026-10-01");
    expect(card).toHaveTextContent(language === "ko" ? "30분" : "30 min");
    expect(within(card).getAllByRole("listitem")).toHaveLength(3);
    const target = new URL(within(card).getByRole("link").getAttribute("href")!, "https://example.test");
    expect(target.pathname).toBe(`/${language}/plan`);
    expect(Object.fromEntries(target.searchParams)).toEqual({ sport: "run", goalId: "goal exact", weekId: "week-02", dayIndex: "3", date: "2026-10-01" });
    expect(card).not.toHaveTextContent(/FTP|\bW\b|km\/h|\/km|\/mi|170|185|analysis\.|today\.|workouts\./);
  });
  it.each(["loading", "none", "error"] as const)("keeps %s honest and only links to plan", status => {
    state.language = "ko";
    render(<MemoryRouter><RunNextTrainingCard state={{ status, session: null }} /></MemoryRouter>);
    expect(screen.queryByTestId("run-training-facts")).not.toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/ko/plan?sport=run");
    expect(screen.getByTestId("run-next-training-card")).toHaveTextContent(ko.analysis.run.nextPlan[status]);
  });
  it("does not synthesize blocks when server composition is unavailable", () => {
    render(<MemoryRouter><RunNextTrainingCard state={{ status: "ready", session: { ...session, title: null, steps: null } }} /></MemoryRouter>);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText(koTraining.workouts.easyRun)).toBeInTheDocument();
  });
  it("preview has one close action and no editing or execution commands", () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const { unmount } = render(<RunPlanPreview session={session} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("button")).toHaveLength(1);
    const close = within(dialog).getByRole("button");
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(close).toHaveFocus();
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(close, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
