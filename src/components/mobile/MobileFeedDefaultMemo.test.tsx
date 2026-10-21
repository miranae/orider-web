import { act, screen } from "@testing-library/react";
import type { User } from "firebase/auth";
import type { Activity } from "@shared/types";
import { AuthContextProvider } from "../../contexts/AuthContext";
import { createMockActivity } from "../../__tests__/fixtures/mockData";
import { withStoredSummary, STORED_ACTIVITY_SUMMARY } from "../../__tests__/fixtures/activityDefaultSummary";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { activityFeedSourceRevision } from "../../services/activityFeedContent";
import { CompactActivityCard } from "./MobileFeedPage";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../../services/activityOverview", () => ({ loadActivityOverview: mocks.load }));
vi.mock("../activity/ActivitySocialFooter", () => ({ default: () => null }));
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
  intersections = []; mocks.load.mockReset();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) { intersections.push(() => this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)); }
    disconnect() {}
    unobserve() {}
  });
});
afterEach(() => vi.unstubAllGlobals());
const enterViewport = () => act(() => { intersections.splice(0).forEach(intersect => intersect()); });

describe("stored mobile feed default memo", () => {
  it.each(["orider", "strava"] as const)("shows the stored %s summary immediately without a viewport or overview request", source => {
    const activity = withStoredSummary({ ...native(), source });
    const snapshot = structuredClone(activity);
    renderWithProviders(card(activity));
    expect(screen.getByText(/저장된 활동 요약/)).toBeVisible();
    expect(intersections).toHaveLength(0);
    enterViewport();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(activity).toEqual(snapshot);
    expect(activity.feedContentV1).toBeUndefined();
  });
  it.each(["orider", "strava"] as const)("preserves an explicit %s memo ahead of stored summary and makes no generation request", source => {
    renderWithProviders(card(withMemo(withStoredSummary({ ...native(), source }), "내가 작성한 메모")));
    enterViewport();
    expect(screen.getByText("내가 작성한 메모")).toBeVisible();
    expect(screen.queryByText(/저장된 활동 요약/)).not.toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("uses stored text for whitespace, replaces it with a manual memo, and restores it after clearing", () => {
    const activity = withStoredSummary(native());
    const view = renderWithProviders(card(withMemo(activity, " \n ")));
    expect(screen.getByText(/저장된 활동 요약/)).toBeVisible();
    view.rerender(card(withMemo(activity, "수정한 메모")));
    expect(screen.getByText("수정한 메모")).toBeVisible();
    expect(screen.queryByText(/저장된 활동 요약/)).not.toBeInTheDocument();
    view.rerender(card(withMemo(activity, "")));
    expect(screen.getByText(/저장된 활동 요약/)).toBeVisible();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it.each(["pending", "processing", "failed"] as const)("keeps a %s summary hidden without falling back to view-time generation", state => {
    const activity = withStoredSummary(native());
    renderWithProviders(card({ ...activity, defaultSummaryV1: { ...activity.defaultSummaryV1!, state } }));
    enterViewport();
    expect(screen.getByTestId("H1-2-1")).toBeVisible();
    expect(screen.queryByText(/저장된 활동 요약/)).not.toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it.each(["apple_health", "health_connect", undefined] as const)("does not use a stored native/Strava default for source %s", source => {
    renderWithProviders(card(withStoredSummary({ ...native(), source })));
    enterViewport();
    expect(screen.queryByText(/저장된 활동 요약/)).not.toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it.each([{ id: "other" }, { userId: "other-owner" }, { contentRevision: 2 }])("hides a summary bound to another activity identity: %j", patch => {
    const activity = withStoredSummary(native());
    const view = renderWithProviders(card(activity));
    expect(screen.getByText(/저장된 활동 요약/)).toBeVisible();
    view.rerender(card({ ...activity, ...patch }));
    expect(screen.queryByText(/저장된 활동 요약/)).not.toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("uses incoming authorized activity snapshots across viewer/privacy changes and hides unsupported sources", () => {
    const activity = withStoredSummary({ ...native(), userId: "u1" });
    const view = renderWithProviders(card(activity));
    view.rerender(card({ ...activity, visibility: "private" }));
    expect(screen.getByText(/저장된 활동 요약/)).toBeVisible();
    const next = withStoredSummary({ ...native(), id: "next-account", userId: "u2" }, "새 계정의 저장 요약");
    view.rerender(card(next, "u2"));
    expect(screen.queryByText(/저장된 활동 요약/)).not.toBeInTheDocument();
    expect(screen.getByText("새 계정의 저장 요약")).toBeVisible();
    view.rerender(card({ ...next, source: "apple_health" }, "u2"));
    expect(screen.queryByText("새 계정의 저장 요약")).not.toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("keeps a card with no stored summary usable and never starts optional summary generation", () => {
    renderWithProviders(card(native())); enterViewport();
    expect(screen.getByTestId("H1-2-1")).toBeVisible();
    expect(screen.queryByText(STORED_ACTIVITY_SUMMARY)).not.toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
