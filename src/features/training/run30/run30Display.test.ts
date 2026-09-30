import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import { run30Program, run30Sessions } from "../../../__tests__/fixtures/run30";
import {
  availableRun30Actions,
  buildRun30ViewModel,
  enrollmentDateOptions,
  postponeCandidates,
  run30DateLabel,
  run30Duration,
} from "./run30Display";

const t = ((key: string, values?: Record<string, unknown>) => `${key}:${JSON.stringify(values ?? {})}`) as unknown as TFunction;

describe("run30 display helpers", () => {
  it("formats server local dates without timezone shifts", () => {
    expect(run30DateLabel("2026-09-29", "ko")).toBe("9월 29일 (화)");
    expect(run30DateLabel("2026-09-29", "en")).toBe("Tue, Sep 29");
    expect(run30DateLabel("2026-02-30", "ko")).toBe("2026-02-30");
  });

  it("chooses duration keys by minutes and seconds", () => {
    expect(run30Duration(1920, t)).toBe('run30.duration.minutes:{"minutes":32}');
    expect(run30Duration(90, t)).toBe('run30.duration.minutesSeconds:{"minutes":1,"seconds":30}');
    expect(run30Duration(45, t)).toBe('run30.duration.seconds:{"seconds":45}');
  });

  it("offers 15 enrollment dates from today", () => {
    const options = enrollmentDateOptions("2026-09-30");
    expect(options).toHaveLength(15);
    expect(options[0]).toBe("2026-09-30");
    expect(options[14]).toBe("2026-10-14");
  });

  it("derives postpone candidates between the stage and the next stage only", () => {
    // 1단계 9/30, 2단계 10/2 → 10/1 만 후보
    const program = run30Program();
    expect(postponeCandidates(program, 1, "2026-09-30")).toEqual(["2026-10-01"]);
    // 3단계 10/4, 4단계 10/7 → 10/5, 10/6
    expect(postponeCandidates(program, 3, "2026-09-30")).toEqual(["2026-10-05", "2026-10-06"]);
    // 지난 회차는 오늘부터
    expect(postponeCandidates(program, 3, "2026-10-06")).toEqual(["2026-10-06"]);
  });

  it("hides actions the server would reject", () => {
    const planned = run30Program({ nextStage: 1 });
    expect(availableRun30Actions(planned, planned.next, "2026-09-30")).toMatchObject({
      retry: false, continue: false, skip: true, postpone: true,
    });

    const sessions = run30Sessions("2026-09-30", { 1: "partial" });
    const partial = run30Program({ sessions, nextStage: 1, retryDates: ["2026-10-01"], todayAction: "decide" });
    expect(availableRun30Actions(partial, partial.next, "2026-09-30")).toMatchObject({
      retry: true, continue: true, skip: false, postpone: false,
    });

    const acknowledged = run30Program({
      sessions,
      nextStage: 1,
      history: [{ revision: 2, action: "continue", stage: 1, at: 2 }],
    });
    expect(availableRun30Actions(acknowledged, acknowledged.next, "2026-09-30").continue).toBe(false);

    // 다음 회차가 아닌 단계에는 동작이 없다.
    expect(availableRun30Actions(planned, planned.sessions[5]!, "2026-09-30")).toMatchObject({
      retry: false, continue: false, skip: false, postpone: false,
    });
  });

  it("builds progress and splits past/current/upcoming stages", () => {
    const sessions = run30Sessions("2026-09-30", { 1: "completed", 2: "completed", 3: "skipped" });
    const vm = buildRun30ViewModel(run30Program({ sessions, nextStage: 4, todayAction: "rest" }));
    expect(vm.completedStages).toBe(2);
    expect(vm.progress).toBeCloseTo(2 / 24);
    expect(vm.todayKind).toBe("rest");
    expect(vm.next?.stage).toBe(4);
    expect(vm.pastSessions.map((session) => session.stage)).toEqual([1, 2, 3]);
    expect(vm.upcomingSessions).toHaveLength(20);
  });

  it("marks a program without a next stage as finished", () => {
    const vm = buildRun30ViewModel(run30Program({ nextStage: 99, todayAction: null }));
    expect(vm.todayKind).toBe("finished");
    expect(vm.pastSessions).toHaveLength(24);
  });
});
