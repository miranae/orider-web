import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { fakeRun30Api } from "../../../__tests__/fixtures/run30";
import Run30EnrollCard from "./Run30EnrollCard";

const TODAY = "2026-09-30";

function preview(overrides: Record<string, unknown> = {}) {
  return {
    startDate: TODAY,
    template: "run-30-intro-v1",
    totalStages: 24,
    activeGoal: null,
    replacementRequired: false,
    safetyGuidance: "통증이나 질병 증상이 있으면 달리기를 멈추고 회복하세요.",
    startDateAdvice: null,
    ...overrides,
  };
}

function renderCard(api = fakeRun30Api(), onEnrolled = vi.fn().mockResolvedValue(undefined), variant: "intro" | "offer" = "intro") {
  render(
    <MemoryRouter>
      <Run30EnrollCard api={api} variant={variant} onEnrolled={onEnrolled} today={TODAY} />
    </MemoryRouter>,
  );
  return { api, onEnrolled };
}

describe("Run30EnrollCard", () => {
  it("previews the chosen start date and enrolls with a client enrollment key", async () => {
    const api = fakeRun30Api();
    api.previewEnrollment.mockResolvedValue(preview({ startDate: "2026-10-02" }));
    api.enroll.mockResolvedValue({ goalId: "g", template: "run-30-intro-v1", revision: 1, alreadyEnrolled: false, startDate: "2026-10-02" });
    const { onEnrolled } = renderCard(api);

    const select = screen.getByRole("combobox", { name: "시작일" });
    expect(select).toHaveDisplayValue("9월 30일 (수) (오늘)");
    expect(select.querySelectorAll("option")).toHaveLength(15);
    fireEvent.change(select, { target: { value: "2026-10-02" } });
    fireEvent.click(screen.getByRole("button", { name: "일정 확인" }));
    expect(api.previewEnrollment).toHaveBeenCalledWith("2026-10-02");
    expect(await screen.findByText("10월 2일 (금)부터 8주 동안 24개 단계를 진행합니다.")).toBeInTheDocument();
    expect(screen.queryByText(/오늘 밤 늦게 시작하면/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "30분 달리기 입문 시작" }));
    await waitFor(() => expect(api.enroll).toHaveBeenCalledWith({
      startDate: "2026-10-02",
      enrollmentKey: expect.stringMatching(/^[A-Za-z0-9_-]{8,128}$/),
    }));
    await waitFor(() => expect(onEnrolled).toHaveBeenCalled());
  });

  it("explains the late-today start date advice from the server", async () => {
    const api = fakeRun30Api();
    api.previewEnrollment.mockResolvedValue(preview({
      startDate: "2026-10-01",
      startDateAdvice: { requestedStartDate: TODAY, effectiveStartDate: "2026-10-01", reason: "late-today" },
    }));
    renderCard(api);
    fireEvent.click(screen.getByRole("button", { name: "일정 확인" }));
    expect(await screen.findByText("오늘 밤 늦게 시작하면 첫 단계는 내일로 잡혀요.")).toBeInTheDocument();
    expect(screen.getByText("첫 단계: 10월 1일 (목)")).toBeInTheDocument();
  });

  it("requires consent before replacing another running goal and sends the preview revision", async () => {
    const api = fakeRun30Api();
    api.previewEnrollment.mockResolvedValue(preview({
      activeGoal: { goalId: "goal-old", title: "하프 마라톤", revision: "rev-7" },
      replacementRequired: true,
    }));
    api.enroll.mockResolvedValue({ goalId: "g", template: "run-30-intro-v1", revision: 1, alreadyEnrolled: false, startDate: TODAY });
    renderCard(api);
    fireEvent.click(screen.getByRole("button", { name: "일정 확인" }));
    expect(await screen.findByText("현재 러닝 목표 ‘하프 마라톤’는 중단되고 이 프로그램으로 전환됩니다.")).toBeInTheDocument();
    const enroll = screen.getByRole("button", { name: "30분 달리기 입문 시작" });
    expect(enroll).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "기존 목표 전환에 동의합니다." }));
    fireEvent.click(enroll);
    await waitFor(() => expect(api.enroll).toHaveBeenCalledWith(expect.objectContaining({
      replaceGoalId: "goal-old",
      replaceGoalRevision: "rev-7",
      replacementConfirmed: true,
    })));
  });

  it("reuses the same enrollment key when retrying a failed attempt", async () => {
    const api = fakeRun30Api();
    api.previewEnrollment.mockResolvedValue(preview());
    api.enroll
      .mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "functions/unavailable" }))
      .mockResolvedValueOnce({ goalId: "g", template: "run-30-intro-v1", revision: 1, alreadyEnrolled: true, startDate: TODAY });
    renderCard(api);
    fireEvent.click(screen.getByRole("button", { name: "일정 확인" }));
    const enroll = await screen.findByRole("button", { name: "30분 달리기 입문 시작" });
    fireEvent.click(enroll);
    expect(await screen.findByRole("alert")).toHaveTextContent("요청을 처리하지 못했어요.");
    fireEvent.click(screen.getByRole("button", { name: "30분 달리기 입문 시작" }));
    await waitFor(() => expect(api.enroll).toHaveBeenCalledTimes(2));
    const [first, second] = api.enroll.mock.calls.map(([request]) => (request as { enrollmentKey: string }).enrollmentKey);
    expect(second).toBe(first);
  });

  it("offer variant stays collapsed until opened", () => {
    renderCard(fakeRun30Api(), vi.fn(), "offer");
    expect(screen.getByRole("heading", { name: "30분 달리기 입문으로 바꿀 수 있어요" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "입문 프로그램 보기" }));
    expect(screen.getByRole("combobox", { name: "시작일" })).toBeInTheDocument();
  });
});
