import { vi } from "vitest";

import type { Run30Api, Run30Program, Run30Session } from "../../features/training/run30/run30Api";

/** 테스트 전용 — 1단계가 startDate 이고 월·수·금 간격(2일/2일/3일)으로 24단계를 만든다. */
export function run30Sessions(startDate: string, statuses: Record<number, string> = {}): Run30Session[] {
  const offsets = [0, 2, 4];
  const [year, month, day] = startDate.split("-").map(Number) as [number, number, number];
  return Array.from({ length: 24 }, (_, index) => {
    const stage = index + 1;
    const week = Math.floor(index / 3);
    const date = new Date(Date.UTC(year, month - 1, day + week * 7 + offsets[index % 3]!));
    return {
      stage,
      localDate: date.toISOString().slice(0, 10),
      status: statuses[stage] ?? "planned",
      scheduledSessionId: `ss_stage${String(stage).padStart(2, "0")}`,
      previousAttemptSessionIds: [],
      workoutName: `${stage}단계 걷기·달리기`,
      durationSec: 1920,
      segments: [
        { stepId: `s${stage}-wu`, label: "몸풀기 걷기", durationSec: 300, targetType: "NONE" },
        { stepId: `s${stage}-run`, label: "달리기", durationSec: 60, targetType: "NONE" },
      ],
    };
  });
}

export function run30Program(overrides: Partial<Run30Program> & { nextStage?: number } = {}): Run30Program {
  const { nextStage = 1, ...rest } = overrides;
  const sessions = rest.sessions ?? run30Sessions("2026-09-30");
  const next = sessions.find((session) => session.stage === nextStage) ?? null;
  return {
    goalId: "run30_goal_fixture",
    goalStatus: "active",
    template: "run-30-intro-v1",
    revision: 3,
    startDate: sessions[0]!.localDate,
    history: [{ revision: 1, action: "enroll", stage: null, at: 1 }],
    postponements: [],
    canRetry: true,
    retryDates: [],
    totalStages: 24,
    remainingStages: 24 - (nextStage - 1),
    next,
    sessions,
    safetyGuidance: "통증이나 질병 증상이 있으면 달리기를 멈추고 회복하세요.",
    nextWorkoutDecision: {
      status: "maintain",
      reasonCode: "program_progression",
      reason: "계획대로 진행하세요.",
      provenance: "program_v1",
    },
    todayAction: "start",
    ...rest,
  };
}

export function fakeRun30Api(): { [K in keyof Run30Api]: ReturnType<typeof vi.fn> } & Run30Api {
  return {
    getCurrentProgram: vi.fn(),
    previewEnrollment: vi.fn(),
    enroll: vi.fn(),
    previewChange: vi.fn(),
    confirmChange: vi.fn(),
  } as unknown as { [K in keyof Run30Api]: ReturnType<typeof vi.fn> } & Run30Api;
}
