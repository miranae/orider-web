import { act, screen, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import type { Activity } from "@shared/types";
import type { ActivityOverviewResponse } from "@shared/types/activity-overview";
import { AuthContextProvider } from "../../contexts/AuthContext";
import { createMockActivity } from "../../__tests__/fixtures/mockData";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { activityFeedSourceRevision } from "../../services/activityFeedContent";
import { CompactActivityCard } from "./MobileFeedPage";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../../services/activityOverview", () => ({ loadActivityOverview: mocks.load }));
vi.mock("../activity/ActivitySocialFooter", () => ({ default: () => null }));

const available = (id = "native"): ActivityOverviewResponse => ({
  status: "available", activityId: id, version: "activity-overview-v1", inputDigest: "d",
  presentation: { coachSentence: "개요", session: { discipline: "bike" } }, defaultMemo: "스트라바와 같은 활동 요약\n훈련 성과",
});
const native = () => createMockActivity({ id: "native", source: "orider", thumbnailTrack: "", photoCount: 0, commentCount: 0 });
function withMemo(activity: Activity, memo: string) {
  return { ...activity, feedContentV1: { version: 1 as const, sourceRevision: activityFeedSourceRevision(activity), revision: "memo", memo, memoTruncated: false, totalPhotoCount: 0, photos: [] } };
}
function card(activity: Activity, uid = "u1") {
  return <AuthContextProvider value={{ user: { uid } as User, profile: null, loading: false, profileLoading: false, signIn: vi.fn(), logout: vi.fn() }}>
    <CompactActivityCard activity={activity} />
  </AuthContextProvider>;
}

let intersections: Array<() => void>;
beforeEach(() => {
  intersections = [];
  mocks.load.mockReset().mockResolvedValue(available());
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) { intersections.push(() => this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)); }
    disconnect() {}
    unobserve() {}
  });
});
afterEach(() => vi.unstubAllGlobals());
const enterViewport = () => act(() => { intersections.splice(0).forEach(intersect => intersect()); });

describe("deterministic mobile feed default memo", () => {
  it.each(["orider", "strava"] as const)("loads a %s default only when the card enters the viewport without storing it", async source => {
    const activity = { ...native(), source };
    renderWithProviders(card(activity));
    expect(mocks.load).not.toHaveBeenCalled();
    enterViewport();
    expect(await screen.findByText(/스트라바와 같은 활동 요약/)).toBeVisible();
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(activity.feedContentV1).toBeUndefined();
  });
  it.each(["orider", "strava"] as const)("preserves an explicit %s memo and avoids the overview request", source => {
    renderWithProviders(card(withMemo({ ...native(), source }, "내가 작성한 메모")));
    enterViewport();
    expect(screen.getByText("내가 작성한 메모")).toBeVisible();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("uses the default for a blank memo and removes it when a manual memo arrives", async () => {
    const activity = native();
    const view = renderWithProviders(card(withMemo(activity, " \n ")));
    enterViewport();
    expect(await screen.findByText(/스트라바와 같은 활동 요약/)).toBeVisible();
    view.rerender(card(withMemo(activity, "수정한 메모")));
    expect(screen.getByText("수정한 메모")).toBeVisible();
    expect(screen.queryByText(/스트라바와 같은 활동 요약/)).not.toBeInTheDocument();
    expect(mocks.load).toHaveBeenCalledOnce();
  });
  it.each(["apple_health", "health_connect", undefined] as const)("does not request a native default for source %s", source => {
    renderWithProviders(card({ ...native(), source }));
    enterViewport();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it.each([
    { visibility: "private" as const }, { sourceMeta: { deviceModel: "changed" } }, { contentRevision: 2 },
  ])("removes stale defaults when privacy or provenance changes: %j", async patch => {
    const activity = native();
    const view = renderWithProviders(card(activity));
    enterViewport();
    expect(await screen.findByText(/스트라바와 같은 활동 요약/)).toBeVisible();
    mocks.load.mockReturnValue(new Promise(() => {}));
    view.rerender(card({ ...activity, ...patch }));
    expect(screen.queryByText(/스트라바와 같은 활동 요약/)).not.toBeInTheDocument();
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it("clears a native result when the viewer or source changes", async () => {
    const activity = native();
    const view = renderWithProviders(card(activity));
    enterViewport();
    expect(await screen.findByText(/스트라바와 같은 활동 요약/)).toBeVisible();
    mocks.load.mockReturnValue(new Promise(() => {}));
    view.rerender(card(activity, "u2"));
    expect(screen.queryByText(/스트라바와 같은 활동 요약/)).not.toBeInTheDocument();
    expect(mocks.load.mock.lastCall?.[1]).toBe("u2");
    view.rerender(card({ ...activity, source: "apple_health" }, "u2"));
    expect(screen.queryByText(/스트라바와 같은 활동 요약/)).not.toBeInTheDocument();
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it("keeps the card usable when optional overview data is unavailable or fails", async () => {
    mocks.load.mockRejectedValue(new Error("offline"));
    renderWithProviders(card(native()));
    enterViewport();
    await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
    expect(screen.getByTestId("H1-2-1")).toBeVisible();
    expect(screen.queryByText(/스트라바와 같은 활동 요약/)).not.toBeInTheDocument();
  });
});
