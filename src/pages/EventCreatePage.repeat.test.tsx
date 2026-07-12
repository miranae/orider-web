import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import EventCreatePage from "./EventCreatePage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import {
  mockCallableInvocations,
  setCallableImplementation,
  setCallableResult,
  setCollectionDocs,
} from "../__tests__/mocks/firebase";

function clickToggleNear(labelText: string) {
  const label = screen.getByText(labelText);
  const toggleButton = label.parentElement!.querySelector("button");
  if (!toggleButton) throw new Error(`toggle button not found near "${labelText}"`);
  fireEvent.click(toggleButton);
}

async function openAndPickDatePreset(fieldButtonName: string, presetName: string) {
  fireEvent.click(await screen.findByRole("button", { name: fieldButtonName }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: presetName }));
}

describe("EventCreatePage recurring series", () => {
  beforeEach(() => {
    setCollectionDocs("courses", [
      { id: "course-1", name: "테스트 코스", distance: 50000, elevationGain: 500, creatorId: "test-uid", likeCount: 10 },
    ]);
    setCollectionDocs("groups", [
      { id: "group-1", name: "위클리 라이더스", creatorId: "test-uid", isActive: true, memberCount: 5 },
    ]);
    setCallableResult("createEvent", { data: { eventId: "event-base" } });
  });

  it("calls createEvent once per week, spaced 7 days apart, reusing the selected group", async () => {
    renderWithProviders(<EventCreatePage />, { authenticated: true, route: "/ko/event/create" });

    // Step 0 — basic info
    fireEvent.change(await screen.findByPlaceholderText("남한강 그란폰도 2026"), { target: { value: "위클리 정기 라이드" } });
    fireEvent.change(screen.getByPlaceholderText("010-0000-0000"), { target: { value: "010-1234-5678" } });
    fireEvent.click(screen.getByRole("button", { name: /^다음/ }));

    // Step 1 — course, schedule, host group, repeat
    fireEvent.click(await screen.findByText("테스트 코스"));
    await openAndPickDatePreset("이벤트 날짜", "+1주");
    fireEvent.change(screen.getByPlaceholderText("팔당역 1번 출구 앞 광장"), { target: { value: "테스트 집결지" } });

    const groupSelect = await screen.findByRole("combobox");
    fireEvent.change(groupSelect, { target: { value: "group-1" } });

    clickToggleNear("매주 반복");
    fireEvent.click(await screen.findByRole("button", { name: "4주" }));

    fireEvent.click(screen.getByRole("button", { name: /^다음/ }));

    // Step 2 — registration window (times default to 00:00 once a date is picked)
    await openAndPickDatePreset("모집 시작 날짜", "오늘");
    await openAndPickDatePreset("모집 마감 날짜", "+1개월");

    fireEvent.click(screen.getByRole("button", { name: /검토 후 공개하기/ }));

    await waitFor(() => {
      expect(mockCallableInvocations.filter((c) => c.name === "createEvent")).toHaveLength(4);
    });
    await screen.findByText((text) => text.includes("4주 중 4주 생성 완료"));

    const createCalls = mockCallableInvocations.filter((c) => c.name === "createEvent");
    expect(createCalls).toHaveLength(4);

    const startTimes = createCalls.map((c) => (c.data as { startTime: number }).startTime);
    for (let i = 1; i < startTimes.length; i++) {
      expect(startTimes[i]! - startTimes[i - 1]!).toBe(7 * 24 * 60 * 60 * 1000);
    }

    for (const call of createCalls) {
      const payload = call.data as { groupId?: string; createGroup?: unknown; seriesId?: string };
      expect(payload.groupId).toBe("group-1");
      expect(payload.createGroup).toBeUndefined();
      expect(payload.seriesId).toBe((createCalls[0]!.data as { seriesId: string }).seriesId);
    }
    expect(createCalls.map((call) => (call.data as { round: number }).round)).toEqual([1, 2, 3, 4]);
    expect((createCalls[0]!.data as { seriesId: string }).seriesId).toMatch(/^web_[a-z0-9]+_[a-z0-9]+$/);
  }, 15000);

  it("retries only failed rounds with original identity until the queue is empty", async () => {
    const attempts = new Map<number, number>();
    setCallableImplementation("createEvent", (raw) => {
      const round = (raw as { round?: number }).round ?? 1;
      const attempt = (attempts.get(round) ?? 0) + 1;
      attempts.set(round, attempt);
      if ((round === 2 && attempt <= 2) || (round === 3 && attempt === 1)) throw new Error("transient");
      return { data: { eventId: `event-${round}` } };
    });
    renderWithProviders(<EventCreatePage />, { authenticated: true, route: "/ko/event/create" });
    fireEvent.change(await screen.findByPlaceholderText("남한강 그란폰도 2026"), { target: { value: "위클리 정기 라이드" } });
    fireEvent.change(screen.getByPlaceholderText("010-0000-0000"), { target: { value: "010-1234-5678" } });
    fireEvent.click(screen.getByRole("button", { name: /^다음/ }));
    fireEvent.click(await screen.findByText("테스트 코스"));
    await openAndPickDatePreset("이벤트 날짜", "+1주");
    fireEvent.change(screen.getByPlaceholderText("팔당역 1번 출구 앞 광장"), { target: { value: "테스트 집결지" } });
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "group-1" } });
    clickToggleNear("매주 반복");
    fireEvent.click(await screen.findByRole("button", { name: "4주" }));
    fireEvent.click(screen.getByRole("button", { name: /^다음/ }));
    await openAndPickDatePreset("모집 시작 날짜", "오늘");
    await openAndPickDatePreset("모집 마감 날짜", "+1개월");
    fireEvent.click(screen.getByRole("button", { name: /검토 후 공개하기/ }));
    await screen.findByText((text) => text.includes("4주 중 2주 생성 완료"));

    const initial = mockCallableInvocations.filter((c) => c.name === "createEvent");
    const seriesId = (initial[0]!.data as { seriesId: string }).seriesId;
    expect(initial.map((c) => (c.data as { round: number }).round)).toEqual([1, 2, 3, 4]);

    fireEvent.click(screen.getByRole("button", { name: "실패한 회차만 다시 시도" }));
    await screen.findByText((text) => text.includes("4주 중 3주 생성 완료"));
    fireEvent.click(screen.getByRole("button", { name: "실패한 회차만 다시 시도" }));
    await screen.findByText((text) => text.includes("4주 중 4주 생성 완료"));

    const calls = mockCallableInvocations.filter((c) => c.name === "createEvent");
    expect(calls.map((c) => (c.data as { round: number }).round)).toEqual([1, 2, 3, 4, 2, 3, 2]);
    expect(calls.every((c) => (c.data as { seriesId: string }).seriesId === seriesId)).toBe(true);
    expect(screen.queryByRole("button", { name: "실패한 회차만 다시 시도" })).not.toBeInTheDocument();
  }, 15000);
});
