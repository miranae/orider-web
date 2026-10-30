import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubCafeSchedule } from "@shared/clubCafeSchedule";
import { getClubCafeSchedule } from "../../services/clubCafeSchedule";
import { getPublicCafeSchedule } from "../../services/publicClubs";
import ClubCafeSchedulePanel from "./ClubCafeSchedulePanel";
import PublicCafeSchedulePanel from "./PublicCafeSchedulePanel";
vi.mock("../../services/clubCafeSchedule", () => ({ getClubCafeSchedule: vi.fn() }));
vi.mock("../../services/publicClubs", () => ({ getPublicCafeSchedule: vi.fn() }));
vi.mock("./MeetingSchedule", () => ({ default: () => <div data-testid="schedule">schedule</div> }));
const schedule: ClubCafeSchedule = { source: "naver-cafe", cafeUrl: "https://cafe.naver.com/clublara", syncedAt: 1, entries: [], undatedCount: 0, truncated: false };
beforeEach(() => vi.clearAllMocks());
describe.each([
  { name: "public", Panel: PublicCafeSchedulePanel, load: vi.mocked(getPublicCafeSchedule) },
  { name: "member", Panel: ClubCafeSchedulePanel, load: vi.mocked(getClubCafeSchedule) },
])("$name cafe schedule panel", ({ Panel, load }) => {
  it("does not request an unsupported club", () => {
    const { container } = render(<Panel groupId="other" language="ko" />);
    expect(load).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
  it("shows a loading state and ignores a late result after changing clubs", async () => {
    let finish!: (value: ClubCafeSchedule) => void;
    load.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const { rerender, container } = render(<Panel groupId="club-lara" language="ko" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    rerender(<Panel groupId="other" language="ko" />);
    await act(async () => finish(schedule));
    expect(container).toBeEmptyDOMElement();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
