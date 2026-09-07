import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import type { TrainingDecisionEnvelope } from "../services/trainingDecisionCanonicalContract";
import { resetTrainingDecisionCacheForTests, useTrainingDecision } from "./useTrainingDecision";

const fetchTrainingDecision = vi.hoisted(() => vi.fn());
vi.mock("../services/trainingDecisionCanonicalClient", () => ({ fetchTrainingDecision }));

function envelope(revision: string, status: TrainingDecisionEnvelope["status"] = "canonical"): TrainingDecisionEnvelope {
  return {
    schemaVersion: 1, algorithmVersion: "training-decision@1", status,
    computedAt: 1, inputRevision: revision, inputDigest: "d", period: null,
    data: {
      inputs: { asOfDay: 1, timezone: "Asia/Seoul", discipline: "bike", fitnessRevision: "f",
        trainingSummaryRevision: "s", goalUpdatedAt: null, planUpdatedAt: null, readinessObservedAt: null, pendingActivityCount: 0 },
      recommendation: { type: "endurance", zone: 2, durationMin: [60, 90],
        inputSnapshot: { tsb: -8, ctl: 60, atl: 68, recent7dTss: 400, discipline: "bike" } },
      form: { tsb: -8, ctl: 60, atl: 68, ctlRampPerWeek: null, band: { key: "productive", index: 2, drivenByRamp: false } },
      goal: null, readiness: null, decisionRevision: revision,
    },
    rolloutEnabled: true,
    error: null,
  };
}

/** 목표 입력 폼과 결정 카드가 같은 화면에 있는 상황. 새로고침이 입력을 되감으면 안 된다. */
function Harness() {
  const [note, setNote] = useState("");
  const decision = useTrainingDecision("u1", "bike");
  return (
    <div>
      <input aria-label="goal-note" value={note} onChange={(event) => setNote(event.target.value)} />
      <span data-testid="revision">{decision.envelope?.data?.decisionRevision ?? "none"}</span>
      <span data-testid="display">{decision.display ?? "none"}</span>
      <span data-testid="paused">{String(decision.paused)}</span>
      <button onClick={decision.refresh}>refresh</button>
    </div>
  );
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

describe("useTrainingDecision", () => {
  beforeEach(() => {
    resetTrainingDecisionCacheForTests();
    fetchTrainingDecision.mockReset();
    resetRuntimeConfigForTests({ trainingDecisionCanonicalEnabled: true });
  });
  afterEach(() => resetRuntimeConfigForTests());

  it("전환이 꺼져 있으면 부르지 않고 봉투도 없다", async () => {
    resetRuntimeConfigForTests({});
    render(<Harness />);
    await flush();
    expect(fetchTrainingDecision).not.toHaveBeenCalled();
    expect(screen.getByTestId("revision").textContent).toBe("none");
  });

  it("canonical 봉투를 그대로 노출한다", async () => {
    fetchTrainingDecision.mockResolvedValue(envelope("rev-1"));
    render(<Harness />);
    await flush();
    expect(screen.getByTestId("revision").textContent).toBe("rev-1");
    expect(screen.getByTestId("display").textContent).toBe("value");
  });

  it("decisionRevision 이 같으면 편집 중인 입력을 되감지 않는다", async () => {
    fetchTrainingDecision.mockResolvedValue(envelope("rev-1"));
    render(<Harness />);
    await flush();
    const input = screen.getByLabelText("goal-note") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "내 목표 메모" } });
    expect(input.value).toBe("내 목표 메모");

    await act(async () => { screen.getByText("refresh").click(); });
    await flush();
    expect(fetchTrainingDecision).toHaveBeenCalledTimes(2);
    // 같은 결정이므로 값은 그대로고, 사용자 입력도 살아 있다.
    expect(screen.getByTestId("revision").textContent).toBe("rev-1");
    expect((screen.getByLabelText("goal-note") as HTMLInputElement).value).toBe("내 목표 메모");
  });

  it("revision 이 바뀌면 새 결정을 노출한다", async () => {
    fetchTrainingDecision.mockResolvedValueOnce(envelope("rev-1")).mockResolvedValueOnce(envelope("rev-2"));
    render(<Harness />);
    await flush();
    await act(async () => { screen.getByText("refresh").click(); });
    await flush();
    expect(screen.getByTestId("revision").textContent).toBe("rev-2");
  });

  it("값 없는 응답은 last-known-good 을 지우지 않고 낡음만 알린다", async () => {
    fetchTrainingDecision.mockResolvedValueOnce(envelope("rev-1"))
      .mockResolvedValueOnce({ ...envelope("rev-1", "processing"), data: null, computedAt: null });
    render(<Harness />);
    await flush();
    await act(async () => { screen.getByText("refresh").click(); });
    await flush();
    expect(screen.getByTestId("revision").textContent).toBe("rev-1");
    expect(screen.getByTestId("display").textContent).toBe("value_with_stale_hint");
  });

  it("서버가 이 화면을 끄면(rolloutEnabled false) 일시 중단이다", async () => {
    fetchTrainingDecision.mockResolvedValue({ ...envelope("rev-1"), rolloutEnabled: false });
    render(<Harness />);
    await flush();
    expect(screen.getByTestId("paused").textContent).toBe("true");
  });

  it("판정이 뒤집히면 같은 revision 이어도 중단이 화면에 도착한다", async () => {
    fetchTrainingDecision.mockResolvedValueOnce(envelope("rev-1"))
      .mockResolvedValueOnce({ ...envelope("rev-1"), rolloutEnabled: false });
    render(<Harness />);
    await flush();
    expect(screen.getByTestId("paused").textContent).toBe("false");
    await act(async () => { screen.getByText("refresh").click(); });
    await flush();
    expect(screen.getByTestId("paused").textContent).toBe("true");
  });

  it("서버가 판정을 안 내려주면(null) 중단이 아니다 — 모름과 껐음은 다르다", async () => {
    fetchTrainingDecision.mockResolvedValue({ ...envelope("rev-1"), rolloutEnabled: null });
    render(<Harness />);
    await flush();
    expect(screen.getByTestId("paused").textContent).toBe("false");
  });
});
