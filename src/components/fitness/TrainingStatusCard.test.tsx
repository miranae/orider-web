import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { FORM_BAND_KEYS } from "@shared/training/formBand";
import type { CanonicalDisplay } from "@shared/types/canonicalDisplay";
import ko from "../../i18n/resources/ko/fitness.json";
import type { TrainingDecisionEnvelope } from "../../services/trainingDecisionCanonicalContract";
import TrainingStatusCard from "./TrainingStatusCard";

function decision(bandKey: string, status: TrainingDecisionEnvelope["status"]): TrainingDecisionEnvelope {
  return {
    schemaVersion: 1,
    algorithmVersion: "training-decision@1",
    status,
    computedAt: 1_756_000_100_000,
    inputRevision: "r1",
    inputDigest: "d1",
    period: null,
    data: {
      inputs: { asOfDay: 1, timezone: "Asia/Seoul", discipline: "bike", fitnessRevision: "f", trainingSummaryRevision: "s",
        goalUpdatedAt: null, planUpdatedAt: null, readinessObservedAt: null, pendingActivityCount: 0 },
      recommendation: { type: "endurance", zone: 2, durationMin: [60, 90],
        inputSnapshot: { tsb: -8, ctl: 60, atl: 68, recent7dTss: 400, discipline: "bike" } },
      form: { tsb: -8, ctl: 60, atl: 68, ctlRampPerWeek: null, band: { key: bandKey, index: 2, drivenByRamp: false } },
      goal: null, readiness: null, decisionRevision: "rev1",
    },
    error: null,
  };
}

function emptyEnvelope(status: TrainingDecisionEnvelope["status"]): TrainingDecisionEnvelope {
  return { ...decision("productive", status), data: null, computedAt: null,
    error: status === "failed" ? { code: "call_failed", retryable: true } : null };
}

describe("TrainingStatusCard", () => {
  it("i18n 라벨이 서버 구간 5개를 모두 덮는다", () => {
    for (const key of FORM_BAND_KEYS) {
      expect(ko[`trainingStatus.${key}.label` as keyof typeof ko]).toBeTruthy();
      expect(ko[`trainingStatus.${key}.advice` as keyof typeof ko]).toBeTruthy();
      expect(ko[`trainingStatus.${key}.adviceRamp` as keyof typeof ko]).toBeTruthy();
    }
  });

  it("canonical 이면 서버 구간을 그리고 갱신 칩은 없다", () => {
    // TSB -8 은 로컬 판정으로도 '순항' 이므로, 서버가 다른 구간을 줄 때로 구분한다.
    render(<TrainingStatusCard tsb={-8} decision={decision("overload", "canonical")} decisionDisplay="value" />);
    expect(screen.getAllByText("과부하 주의").length).toBeGreaterThan(0);
    expect(screen.queryByText("갱신 대기")).not.toBeInTheDocument();
  });

  it("stale 이면 값과 함께 갱신 칩을 보인다", () => {
    render(<TrainingStatusCard tsb={-8} decision={decision("fresh", "stale")} decisionDisplay="value_with_stale_hint" />);
    expect(screen.getAllByText("회복 완료").length).toBeGreaterThan(0);
    expect(screen.getByText("갱신 대기")).toBeInTheDocument();
  });

  it.each([
    ["processing", "loading" as CanonicalDisplay, "훈련 상태를 계산하고 있습니다."],
    ["failed", "error" as CanonicalDisplay, "훈련 상태를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요."],
    ["unavailable", "empty" as CanonicalDisplay, "훈련 상태를 계산할 활동이 아직 없습니다."],
  ])("%s 는 구간 대신 상태를 밝힌다", (status, display, message) => {
    render(<TrainingStatusCard tsb={-45} decision={emptyEnvelope(status as TrainingDecisionEnvelope["status"])} decisionDisplay={display} />);
    expect(screen.getByText(message)).toBeInTheDocument();
    // TSB -45 는 로컬 판정이면 '과부하 주의' 다. 값 없는 상태에서 로컬 구간이 새면 안 된다.
    expect(screen.queryByText("과부하 주의")).not.toBeInTheDocument();
  });

  it("서버가 모르는 구간을 주면 로컬 판정으로 대체하지 않는다", () => {
    render(<TrainingStatusCard tsb={-45} decision={decision("sharpening", "canonical")} decisionDisplay="value" />);
    expect(screen.queryByText("과부하 주의")).not.toBeInTheDocument();
  });

  it("봉투가 없으면(전환 꺼짐) 기존 로컬 표시가 남는다", () => {
    render(<TrainingStatusCard tsb={-45} />);
    expect(screen.getAllByText("과부하 주의").length).toBeGreaterThan(0);
  });

  it("서버가 화면을 껐으면 중단을 밝히고 로컬 구간을 그리지 않는다", () => {
    render(<TrainingStatusCard tsb={-45} decision={decision("productive", "canonical")} decisionDisplay="value" decisionPaused />);
    expect(screen.getByText(ko["trainingStatus.state.paused"])).toBeInTheDocument();
    expect(screen.queryByText("과부하 주의")).not.toBeInTheDocument();
  });
});
