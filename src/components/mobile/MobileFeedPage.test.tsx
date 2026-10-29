import { track } from "../../services/analytics";
import { loadPublicActivityMap } from "../../services/publicActivityMaps";
import { useState } from "react";
import { GlossaryProvider } from "../common/GlossaryProvider";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MobileFeedPage, { CompactActivityCard, MobileRouteThumbnail } from "./MobileFeedPage";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { createMockActivity, createMockSummary } from "../../__tests__/fixtures/mockData";
import { getCanonicalMapThumbnailFileName, isCanonicalMapThumbnailUrl } from "../activity/ActivityRouteThumbnail";
import { useActivitySearch } from "../../hooks/useActivities";
import { setCollectionDocs, mockCollectionData } from "../../__tests__/mocks/firebase";
import { loadActivityDiscovery } from "../../services/activityDiscovery";
import type { User } from "firebase/auth";
import { AuthContextProvider } from "../../contexts/AuthContext";
import { activityFeedSourceRevision } from "../../services/activityFeedContent";
import { signInCancelledError } from "../../utils/signInCancelled";

vi.mock("../../services/analytics", () => ({ track: vi.fn() }));
vi.mock("../../services/publicActivityMaps", () => ({ loadPublicActivityMap: vi.fn() }));
beforeEach(() => {
  vi.mocked(loadPublicActivityMap).mockImplementation(async (_services, activityId) => ({ activityId, revision: "current", privacyEnabled: false,
    contentRevision: null, contentSelectedRevision: null,
    mapPreview: { encodedPolyline: createMockActivity().thumbnailTrack!, imageUrl: "https://storage.googleapis.com/legacy/map.webp" } }));
});

vi.mock("../../services/activityDiscovery", () => ({loadActivityDiscovery: vi.fn(async (_services, request) => {
 const rows=mockCollectionData.get("activities")??[],offset=Number(request.cursor??0),end=offset+(request.limit??20);
 return {items:rows.slice(offset,end),nextCursor:end<rows.length?String(end):null,exhausted:end>=rows.length};
})}));

vi.mock("../RouteMap", () => ({
  default: ({ interactive, fallbackImageUrl }: { interactive?: boolean; fallbackImageUrl?: string | null }) => (
    <div
      data-testid="route-map"
      data-interactive={String(interactive)}
      data-fallback-image-url={fallbackImageUrl ?? ""}
    >
      Map
    </div>
  ),
}));

vi.mock("../activity/ActivitySocialFooter", () => ({
  default: () => null,
}));

let externalSearch: ReturnType<typeof useActivitySearch>;

async function searchFromMenu(keyword: string) {
  await act(async () => { externalSearch.search(keyword); });
}

describe("MobileFeedPage", () => {
  it.each([undefined, null, NaN, -1])("renders unknown elevation without invented zero or NaN (%s)", elevationGain => {
    const activity = createMockActivity({ source: "orider", summary: createMockSummary() });
    Object.assign(activity.summary, { elevationGain });
    const view = renderWithProviders(<CompactActivityCard activity={activity} />);
    expect(view.container).not.toHaveTextContent("NaN");
    expect(view.container).toHaveTextContent("—");
  });
  it.each([undefined, null, NaN, Infinity, -1])("does not invent distance, duration or speed for invalid metric inputs (%s)", missing => {
    const activity = createMockActivity({ source: "orider", summary: createMockSummary() });
    Object.assign(activity, { startTime: undefined, endTime: undefined });
    Object.assign(activity.summary, { distance: missing, ridingTimeMillis: missing, elapsedTimeMillis: undefined, movingTimeSec: undefined, pauseTimeSec: undefined });
    const view = renderWithProviders(<CompactActivityCard activity={activity} />);
    expect(view.container).not.toHaveTextContent(/NaN|Infinity/);
    const distance = screen.getByText("이동거리").parentElement!;
    expect(distance).toHaveTextContent("—");
    expect(view.container).not.toHaveTextContent(/0\.0\s*km\/h/);
  });
  it("preserves measured zero distance and elevation and zero speed over a known duration", () => {
    const activity = createMockActivity({ source: "orider", summary: createMockSummary({ distance: 0, elevationGain: 0, ridingTimeMillis: 60000 }) });
    Object.assign(activity, { endTime: undefined });
    const view = renderWithProviders(<CompactActivityCard activity={activity} />);
    expect(screen.getByText("이동거리").parentElement!).toHaveTextContent(/0\s*m/);
    expect(view.container).toHaveTextContent(/0\.0\s*km\/h/);
    expect(view.container).not.toHaveTextContent("NaN");
  });
  it.each([Infinity, NaN])("hides nonfinite running heart rate and power (%s)", invalid => {
    const activity = createMockActivity({ type: "Run", summary: createMockSummary({ averageHeartRate: invalid, averagePower: invalid }) });
    const view = renderWithProviders(<CompactActivityCard activity={activity} />);
    expect(view.container).not.toHaveTextContent(/NaN|Infinity/);
  });
  it("uses revision-bound native display metrics like public and owner detail", () => {
    const activity = { ...createMockActivity({ source: "orider", summary: createMockSummary({ distance: 6000, elevationGain: 12, ridingTimeMillis: 600000 }) }),
      activityRevision: "current", contentSelectedRevision: 1,
      activityPresentationV1: { version: 1 as const, metricsVersion: 3, computedAt: 1, activityRevision: "current", contentSelectedRevision: 1,
        sensorOriginActivityId: "native", summary: { elevationGain: 10 }, thumbnailTrack: "", mapImageUrl: null } };
    const view = renderWithProviders(<CompactActivityCard activity={activity} />);
    expect(view.container).toHaveTextContent(/10\s*m/);
    expect(view.container).not.toHaveTextContent(/12\s*m/);
    view.rerender(<CompactActivityCard activity={{ ...activity, activityRevision: "changed" }} />);
    expect(view.container).toHaveTextContent(/12\s*m/);
  });
  it("preserves provider summary semantics when the source is Strava", () => {
    const activity = { ...createMockActivity({ source: "strava", summary: createMockSummary({ elevationGain: 12 }) }),
      activityRevision: "current",
      activityPresentationV1: { version: 1 as const, metricsVersion: 3, computedAt: 1, activityRevision: "current", contentSelectedRevision: null,
        sensorOriginActivityId: "provider", summary: { elevationGain: 10 }, thumbnailTrack: "", mapImageUrl: null } };
    const view = renderWithProviders(<CompactActivityCard activity={activity} />);
    expect(view.container).toHaveTextContent(/12\s*m/);
  });
  it("consumes external search without duplicating query controls and follows its external reset", async () => {
    setCollectionDocs("activities", [{ id: "match", ...createMockActivity({ id: "match", description: "설레임 검색 결과" }) }]);
    function Feed() {
      const search = useActivitySearch(new Set());
      externalSearch = search;
      return <MobileFeedPage activities={[]} activitySearch={search} loading={false} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} feedScope="all" />;
    }
    renderWithProviders(<Feed />);
    await searchFromMenu("설레임");
    expect(await screen.findByText("설레임 검색 결과")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /필터|검색 초기화/ })).not.toBeInTheDocument();
    expect(screen.queryByText("검색: 설레임")).not.toBeInTheDocument();
    await act(async () => { externalSearch.reset(); });
    expect(screen.queryByText("설레임 검색 결과")).not.toBeInTheDocument();
  });

  it("shows the activity occurrence timestamp and its persisted device without a relative-age label", () => {
    const now = new Date(2026, 9, 20, 22, 0).getTime();
    const startTime = new Date(2026, 9, 20, 19, 16).getTime();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const view = renderWithProviders(<CompactActivityCard activity={createMockActivity({ startTime, sourceMeta: { deviceModel: "iGPSPORT iGS630S" } })} />);
      const time = view.container.querySelector("time");
      expect(time).toHaveAttribute("datetime", new Date(startTime).toISOString());
      expect(time).toHaveTextContent("오늘 오후 7:16");
      expect(time?.parentElement).toHaveTextContent(/오늘 오후 7:16·\s+iGPSPORT iGS630S/);
      expect(time?.parentElement).not.toHaveTextContent(/시간 전|분 전/);
    } finally { clock.mockRestore(); }
  });
  it("shows the stored region beside the device, including when the track is unavailable", () => {
    const view = renderWithProviders(<CompactActivityCard activity={createMockActivity({ thumbnailTrack: "", regionName: " Yeongdeungpo-gu, Seoul ", sourceMeta: { deviceModel: "Garmin Edge 840" } })} />);
    expect(view.container.querySelector("time")?.parentElement).toHaveTextContent(/Garmin Edge 840·\s+Yeongdeungpo-gu, Seoul/);
  });
  it("shows a stored region without a device and hides blank regions", () => {
    const view = renderWithProviders(<CompactActivityCard activity={createMockActivity({ regionName: "Jeju-si, Jeju-do", sourceMeta: { deviceModel: "" } })} />);
    expect(view.container.querySelector("time")?.parentElement).toHaveTextContent(/·\s+Jeju-si, Jeju-do/);
  });
  it("omits unavailable device and location metadata without leaving separators", () => {
    const view = renderWithProviders(<CompactActivityCard activity={createMockActivity({ startTime: NaN, regionName: " ", sourceMeta: { deviceModel: " " } })} />);
    const time = view.container.querySelector("time");
    expect(time).not.toHaveAttribute("datetime");
    expect(time?.parentElement).toHaveTextContent("활동 시각 미확인");
    expect(time?.parentElement).not.toHaveTextContent("·");
  });

  it("shows public feed controls for an anonymous session rather than owner-only content", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuthContextProvider value={{ user: { uid: "anonymous", isAnonymous: true } as User, profile: null, loading: false, profileLoading: false, signIn: vi.fn(), logout: vi.fn() }}>
      <MobileFeedPage activities={[]} loading={false} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} feedScope="self" sportFilter="run" runningJourney={<p>Owner running program</p>} />
    </AuthContextProvider>);
    expect(screen.getByRole("heading", { name: "공개 활동" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "로그인" })).not.toBeInTheDocument();
    expect(screen.queryByText("Owner running program")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("opens metric help without following the activity overlay or parsing an author's title", async () => {
    const user = userEvent.setup();
    const onCardClick = vi.fn();
    renderWithProviders(<GlossaryProvider><div onClick={onCardClick}><CompactActivityCard activity={createMockActivity({ description: "FTP 사용자 활동명" })} /></div></GlossaryProvider>);
    expect(screen.queryByRole("button", { name: "FTP 설명" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "획득고도 설명" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("상승");
    expect(onCardClick).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "FTP 사용자 활동명" })).toHaveAttribute("href", expect.stringContaining("/activity/"));
  });
  it("opens the data-warning explanation with the shared text tooltip", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CompactActivityCard activity={createMockActivity({ summary: createMockSummary({ maxSpeed: 300 }) })} />);
    const trigger = screen.getByRole("button", { name: "⚠ 데이터 이상" });
    expect(trigger.closest("[title]")).toBeNull();
    await user.click(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("GPS noise");
    expect(trigger).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("leaves shared activity labels plain outside the home glossary scope", () => {
    renderWithProviders(<CompactActivityCard activity={createMockActivity()} />);
    expect(screen.getByText("획득고도")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /설명/ })).not.toBeInTheDocument();
  });
  it("keeps home focused on feed results without duplicate controls or weekly totals", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MobileFeedPage activities={[]} loading={false} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} feedScope="all" sportFilter="run" />, { authenticated: true });
    expect(screen.getByRole("heading", { name: "활동 피드" })).toBeInTheDocument();
    expect(screen.queryByText(/내 최근 7일/)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "활동 종목 필터" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("applies externally controlled date and sport conditions without adding duplicate controls", () => {
    const recent = createMockActivity({ id: "run-recent", type: "run", description: "최근 러닝", startTime: Date.now() - 86400000 });
    const old = createMockActivity({ id: "run-old", type: "run", description: "이전 러닝", startTime: Date.now() - 30 * 86400000 });
    const bike = createMockActivity({ id: "bike", description: "최근 사이클" });
    const props = { activities: [recent, old, bike], loading: false, hasMore: false, loadingMore: false, onLoadMore: vi.fn(), feedScope: "all" as const, onFeedScopeChange: vi.fn() };
    const view = renderWithProviders(<MobileFeedPage {...props} sportFilter="run" datePreset="7d" />);
    expect(screen.getByText("최근 러닝")).toBeInTheDocument();
    expect(screen.queryByText("이전 러닝")).not.toBeInTheDocument();
    expect(screen.queryByText("최근 사이클")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    view.rerender(<MobileFeedPage {...props} sportFilter="all" datePreset="all" />);
    expect(screen.getByText("이전 러닝")).toBeInTheDocument();
    expect(screen.getByText("최근 사이클")).toBeInTheDocument();
  });

  it("includes this year from January 1 KST and excludes the preceding millisecond", () => {
    const year = new Date(Date.now() + 9 * 3600000).getUTCFullYear();
    const january = Date.UTC(year, 0, 1) - 9 * 3600000;
    const december = january - 1;
    const activities = [
      createMockActivity({ id: "january", description: "올해 첫 활동", startTime: january, endTime: january + 3600000 }),
      createMockActivity({ id: "december", description: "작년 마지막 활동", startTime: december, endTime: december + 3600000 }),
    ];
    renderWithProviders(<MobileFeedPage activities={activities} datePreset="year" loading={false}
      hasMore={false} loadingMore={false} onLoadMore={vi.fn()} feedScope="all" />);
    expect(screen.getByText("올해 첫 활동")).toBeInTheDocument();
    expect(screen.queryByText("작년 마지막 활동")).not.toBeInTheDocument();
  });

  it("searches the server for 설레임 even when the activity is outside the loaded feed", async () => {
    const user = userEvent.setup();
    setCollectionDocs("activities", [
      { id: "older-match", ...createMockActivity({ id: "older-match", description: "설레임 첫 라이딩" }) },
    ]);
    const searchWhere = vi.mocked(loadActivityDiscovery);
    searchWhere.mockClear();

    function SearchFeed() {
      const activitySearch = useActivitySearch(new Set());
      externalSearch = activitySearch;
      return <MobileFeedPage activities={[]} activitySearch={activitySearch} loading={false} hasMore={false}
        loadingMore={false} onLoadMore={vi.fn()} feedScope="all" />;
    }
    renderWithProviders(<SearchFeed />);

    await searchFromMenu("설레임");

    expect(await screen.findByText("설레임 첫 라이딩")).toBeInTheDocument();
    expect(searchWhere).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({keyword:"설레임",scope:"all"}));
    await act(async () => { externalSearch.reset(); });
    expect(screen.queryByText("설레임 첫 라이딩")).not.toBeInTheDocument();
  });
  it("keeps server-authorized followers and friends activities from followed authors", async () => {
    const activities = [
      createMockActivity({ id: "follow-visible", userId: "target", visibility: "followers", description: "팔로워 허용 활동" }),
      createMockActivity({ id: "friend-visible", userId: "target", visibility: "friends", description: "친구 허용 활동" }),
      createMockActivity({ id: "not-followed", userId: "other", visibility: "everyone", description: "구독하지 않은 작성자" }),
    ];
    const view = renderWithProviders(<MobileFeedPage activities={activities} loading={false} hasMore={false} loadingMore={false}
      onLoadMore={vi.fn()} feedScope="following" subscriptionIds={["target"]} />, { authenticated: true });
    expect(await screen.findByText("팔로워 허용 활동")).toBeInTheDocument();
    expect(screen.getByText("친구 허용 활동")).toBeInTheDocument();
    expect(screen.queryByText("구독하지 않은 작성자")).not.toBeInTheDocument();
    view.rerender(<MobileFeedPage activities={activities} loading={false} hasMore={false} loadingMore={false}
      onLoadMore={vi.fn()} feedScope="following" subscriptionIds={[]} />);
    expect(screen.queryByText("팔로워 허용 활동")).not.toBeInTheDocument();
    expect(screen.queryByText("친구 허용 활동")).not.toBeInTheDocument();
  });

  it("keeps the next-page action when all current subscription candidates were excluded", async () => {
    const user = userEvent.setup();
    const next = vi.fn();
    renderWithProviders(<MobileFeedPage activities={[]} loading={false} hasMore loadingMore={false}
      onLoadMore={next} feedScope="following" subscriptionIds={["target"]} />, { authenticated: true });
    await user.click(screen.getByRole("button", { name: "더 보기" }));
    expect(next).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link", { name: "Google Play" })).not.toBeInTheDocument();
  });

  it("pages already loaded all-period activities in groups of 20", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    const activities = Array.from({ length: 45 }, (_, index) => createMockActivity({ id: `loaded-${index}`, description: `기존 활동 ${index}` }));
    renderWithProviders(<MobileFeedPage activities={activities} loading={false} hasMore={false} loadingMore={false}
      onLoadMore={onLoadMore} feedScope="all" />);
    expect(screen.getByText("기존 활동 19")).toBeInTheDocument();
    expect(screen.queryByText("기존 활동 20")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "더 보기" }));
    expect(screen.getByText("기존 활동 39")).toBeInTheDocument();
    expect(screen.queryByText("기존 활동 40")).not.toBeInTheDocument();
    expect(onLoadMore).not.toHaveBeenCalled();

  });

  it("shows only 20 matching activities until more is clicked", async () => {
    const user = userEvent.setup();
    const matches = Array.from({ length: 41 }, (_, index) => {
      const activity = createMockActivity({ id: `ride-${index}`, description: `설레임 활동 ${index}`, startTime: 1_000_000 - index });
      return { id: activity.id, data: () => activity };
    });
    const reads = vi.mocked(loadActivityDiscovery).mockClear();
    reads.mockResolvedValueOnce({ items: matches.slice(0, 20).map(d=>d.data()),nextCursor:"20",exhausted:false } as never)
      .mockResolvedValueOnce({ items: matches.slice(20, 40).map(d=>d.data()),nextCursor:"40",exhausted:false } as never);

    function SearchFeed() {
      const activitySearch = useActivitySearch(new Set());
      externalSearch = activitySearch;
      return <MobileFeedPage activities={[]} activitySearch={activitySearch} loading={false} hasMore={false}
        loadingMore={false} onLoadMore={vi.fn()} feedScope="all" />;
    }
    renderWithProviders(<SearchFeed />);

    await searchFromMenu("설레임");

    expect(await screen.findByText("설레임 활동 19")).toBeInTheDocument();
    expect(screen.queryByText("설레임 활동 20")).not.toBeInTheDocument();
    expect(reads).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "더 보기" }));
    expect(await screen.findByText("설레임 활동 39")).toBeInTheDocument();
    expect(screen.queryByText("설레임 활동 40")).not.toBeInTheDocument();
    expect(reads).toHaveBeenCalledTimes(2);
  });
  it("keeps a loaded friend's nonpublic matching activity in search results", async () => {
    const user = userEvent.setup();
    setCollectionDocs("activities", []);
    const friendActivity = createMockActivity({ id: "friend-private", userId: "friend-1", visibility: "friends", description: "설레임 비공개 라이딩" });

    function SearchFeed() {
      const activitySearch = useActivitySearch(new Set(["friend-1"]));
      externalSearch = activitySearch;
      return <MobileFeedPage activities={[friendActivity]} activitySearch={activitySearch} loading={false} hasMore={false}
        loadingMore={false} onLoadMore={vi.fn()} feedScope="friends" friendIds={["friend-1"]} />;
    }
    renderWithProviders(<SearchFeed />, { authenticated: true });

    await searchFromMenu("설레임");

    expect(await screen.findByText("설레임 비공개 라이딩")).toBeInTheDocument();
  });
  it("keeps loaded matches visible on search failure and retries the same keyword", async () => {
    const user = userEvent.setup();
    const loaded = createMockActivity({ id: "loaded-match", description: "설레임 로드된 라이딩" });
    setCollectionDocs("activities", []);
    const searchRead = vi.mocked(loadActivityDiscovery);
    searchRead.mockClear().mockRejectedValueOnce(new Error("search unavailable"));

    function SearchFeed() {
      const activitySearch = useActivitySearch(new Set());
      externalSearch = activitySearch;
      return <MobileFeedPage activities={[loaded]} activitySearch={activitySearch} loading={false} hasMore={false}
        loadingMore={false} onLoadMore={vi.fn()} feedScope="all" />;
    }
    renderWithProviders(<SearchFeed />);

    await searchFromMenu("설레임");
    expect(await screen.findByRole("alert")).toHaveTextContent("추가 활동을 불러오지 못했어요");
    expect(screen.getByText("설레임 로드된 라이딩")).toBeInTheDocument();

    await act(async () => { externalSearch.retry(); });
    await waitFor(() => expect(searchRead).toHaveBeenCalledTimes(2));
    expect(screen.getByText("설레임 로드된 라이딩")).toBeInTheDocument();
  });

  it("loads the next server page when the selected sport hides the first 20 hits", async () => {
    const user = userEvent.setup();
    const firstPage = Array.from({ length: 20 }, (_, index) => {
      const activity = createMockActivity({ id: `bike-${index}`, type: "ride", description: `설레임 사이클 ${index}`, startTime: 1_000_000 - index });
      return { id: activity.id, data: () => activity };
    });
    const run = createMockActivity({ id: "later-run", type: "run", description: "설레임 나중 러닝", startTime: 1 });
    vi.mocked(loadActivityDiscovery).mockResolvedValueOnce({ items: firstPage.map(d=>d.data()),nextCursor:"20",exhausted:false } as never)
      .mockResolvedValueOnce({ items: [run],nextCursor:null,exhausted:true } as never);


    function SearchFeed() {
      const activitySearch = useActivitySearch(new Set());
      externalSearch = activitySearch;
      return <MobileFeedPage activities={[]} activitySearch={activitySearch} loading={false} hasMore={false}
        loadingMore={false} onLoadMore={vi.fn()} feedScope="all" sportFilter="run" />;
    }
    renderWithProviders(<SearchFeed />);

    await searchFromMenu("설레임");
    expect(await screen.findByText("더 많은 검색 결과가 있을 수 있어요")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "더 보기" }));

    expect(await screen.findByText("설레임 나중 러닝")).toBeInTheDocument();
    expect(loadActivityDiscovery).toHaveBeenLastCalledWith(expect.anything(),expect.objectContaining({cursor:"20"}));
  });



  it("keeps the first activity visible without a home routine control", () => {
    renderWithProviders(<MobileFeedPage
      activities={[createMockActivity({ id: "first-ride", description: "첫 활동" })]}
      loading={false} hasMore={false} loadingMore={false} onLoadMore={vi.fn()}
      feedScope="all"
    />, { authenticated: true });

    expect(screen.getByText("첫 활동")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /연속 라이딩/ })).not.toBeInTheDocument();
    expect(screen.queryByText("라이딩 루틴")).not.toBeInTheDocument();
  });

  it("keeps a filtered empty state honest until the external sport changes", () => {
    const activity = createMockActivity({ type: "ride", description: "사이클 활동" });
    const props = { activities: [activity], loading: false, hasMore: false, loadingMore: false, onLoadMore: vi.fn(), feedScope: "all" as const, onFeedScopeChange: vi.fn() };
    const view = renderWithProviders(<MobileFeedPage {...props} sportFilter="run" />, { authenticated: true });
    const empty = screen.getByText("조건에 맞는 활동이 없어요").parentElement!;
    expect(empty.querySelector('svg[data-icon="run"]')).toHaveAttribute("aria-hidden", "true");
    expect(within(empty).queryByRole("button", { name: "필터" })).not.toBeInTheDocument();
    view.rerender(<MobileFeedPage {...props} sportFilter="bike" />);
    expect(screen.getByText("사이클 활동")).toBeInTheDocument();
  });

  it("does not add routine content when a filter has no matching activities", () => {
    renderWithProviders(<MobileFeedPage
      activities={[createMockActivity({ id: "bike-ride", type: "ride" })]}
      loading={false} hasMore={false} loadingMore={false} onLoadMore={vi.fn()}
      feedScope="all" sportFilter="run"
    />, { authenticated: true });

    expect(screen.getByText("조건에 맞는 활동이 없어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /연속 라이딩/ })).not.toBeInTheDocument();
    expect(screen.queryByText("라이딩 루틴")).not.toBeInTheDocument();
  });

  it.each([
    ["the server says there is something outside the filter", true],
    ["the unfiltered check is still unknown", null],
  ] as const)("calls a server-filtered empty feed a no-match when %s, without app install prompts", (_case, hasUnfilteredActivity) => {
    renderWithProviders(<MobileFeedPage activities={[]} loading={false} hasMore={false} loadingMore={false}
      onLoadMore={vi.fn()} feedScope="self" sportFilter="swim" hasUnfilteredActivity={hasUnfilteredActivity} />, { authenticated: true });
    expect(screen.getByText("조건에 맞는 활동이 없어요")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Google Play" })).not.toBeInTheDocument();
  });

  it("keeps the first-activity prompt when the unfiltered check finds nothing at all", () => {
    renderWithProviders(<MobileFeedPage activities={[]} loading={false} hasMore={false} loadingMore={false}
      onLoadMore={vi.fn()} feedScope="self" sportFilter="bike" datePreset="30d" hasUnfilteredActivity={false} />, { authenticated: true });
    expect(screen.getByText("아직 활동이 없어요")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google Play" })).toBeInTheDocument();
  });

  it("keeps the public feed visible for a guest even with a stale personal scope", async () => {
    const user = userEvent.setup();
    const activities = [
      createMockActivity({ id: "public-one", description: "공개 라이딩" }),
      createMockActivity({ id: "public-two", description: "공개 러닝", type: "run" }),
    ];
    const view = renderWithProviders(<MobileFeedPage activities={activities} loading={false} hasMore={false}
      loadingMore={false} onLoadMore={vi.fn()} feedScope="friends" />);

    expect(screen.queryByRole("combobox", { name: "공개 범위" })).not.toBeInTheDocument();
    expect(screen.getByText("공개 라이딩")).toBeInTheDocument();
    view.rerender(<MobileFeedPage activities={activities} loading={false} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} feedScope="friends" sportFilter="run" />);
    expect(screen.getByText("공개 러닝")).toBeInTheDocument();
    expect(screen.queryByText("공개 라이딩")).not.toBeInTheDocument();
  });

  it("shows a retryable error instead of an empty feed after loading fails", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithProviders(<MobileFeedPage activities={[]} loading={false} error onRetry={onRetry} hasMore={false}
      loadingMore={false} onLoadMore={vi.fn()} feedScope="all" />);

    expect(screen.getByRole("alert")).toHaveTextContent("활동을 불러오지 못했어요");
    expect(screen.queryByText("아직 활동이 없어요")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps loaded cards visible and describes an additional-page failure accurately", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithProviders(<MobileFeedPage
      activities={[createMockActivity({ id: "loaded-ride", description: "먼저 불러온 활동" })]}
      loading={false} error onRetry={onRetry} hasMore={false}
      loadingMore={false} onLoadMore={vi.fn()} feedScope="all"
    />);

    expect(screen.getByRole("alert")).toHaveTextContent("추가 활동을 불러오지 못했어요");
    expect(screen.getByText("먼저 불러온 활동")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "목록 다시 불러오기" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not claim a card is visible when a local filter hides the partial feed", () => {
    renderWithProviders(<MobileFeedPage
      activities={[createMockActivity({ id: "loaded-bike", type: "ride", description: "로드된 사이클" })]}
      loading={false} error hasMore={false}
      loadingMore={false} onLoadMore={vi.fn()} feedScope="all"
      sportFilter="run"
    />);

    expect(screen.queryByText("로드된 사이클")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("활동 목록의 일부만 불러왔습니다");
  });

  it("offers the existing photo overview only when a real photo count exists, without needing a route", () => {
    const activity = createMockActivity({ id: "photos", thumbnailTrack: "", photoCount: 10 });
    const view = renderWithProviders(<CompactActivityCard activity={activity} />);
    expect(screen.getByRole("link", { name: "사진 10" })).toHaveAttribute("href", "/ko/activity/photos?tab=overview");
    view.rerender(<CompactActivityCard activity={{ ...activity, photoCount: 0 }} />);
    expect(screen.queryByRole("link", { name: /^사진/ })).not.toBeInTheDocument();
  });

  it("shows only stored achievement highlights with honest counts and a real segment destination", () => {
    const activity = createMockActivity({ id: "highlighted", description: "성과 라이딩", topAchievements: [
      { type: "PR", segmentId: "s1", segmentName: "첫 구간", time: "1:11" },
      { type: "KOM", segmentId: "s2", segmentName: "둘째 구간", time: "2:22" },
      { type: "2nd", segmentId: "s3", segmentName: "셋째 구간", time: "3:33" },
      { type: "3rd", segmentId: "s4", segmentName: "넷째 구간", time: "4:44" },
    ] });
    renderWithProviders(<CompactActivityCard activity={activity} />);
    const highlights = screen.getByRole("link", { name: "주요 성과 3개" });
    expect(highlights).toHaveAttribute("href", "/ko/activity/highlighted?tab=segments");
    expect(screen.getByRole("link", { name: /둘째 구간 KOM \(2:22\)/ })).toHaveAttribute("href", "/ko/activity/highlighted?tab=segments");
    expect(screen.queryByText("넷째 구간")).not.toBeInTheDocument();
    expect(screen.queryByText("주요 성과 4개")).not.toBeInTheDocument();
  });

  it("exposes the activity as a keyboard-focusable link without nesting author and social actions", () => {
    const activity = createMockActivity({ id: "keyboard-ride", description: "키보드 라이딩" });
    renderWithProviders(<MobileFeedPage activities={[activity]} loading={false} hasMore={false}
      loadingMore={false} onLoadMore={vi.fn()} feedScope="all" />);

    const activityLink = screen.getByRole("link", { name: "키보드 라이딩" });
    expect(activityLink).toHaveAttribute("href", "/ko/activity/keyboard-ride");
    expect(activityLink).not.toContainElement(screen.getByRole("link", { name: "테" }));
  });

  it("keeps the signed-in mobile Home focused on activity and summary content", () => {
    renderWithProviders(<MobileFeedPage activities={[]} loading={false} hasMore={false}
      loadingMore={false} onLoadMore={vi.fn()} feedScope="all" />, {
      authenticated: true, route: "/ko/",
    });

    expect(screen.queryByText("오늘의 계획")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "오늘 계획 보기" })).not.toBeInTheDocument();
  });

  it("shows load more when the current filtered page is empty but more pages exist", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();

    renderWithProviders(
      <MobileFeedPage
        activities={[]}
        loading={false}
        hasMore
        loadingMore={false}
        onLoadMore={onLoadMore}
        feedScope="all"
      />,
    );

    const loadMore = screen.getByRole("button", { name: "더 보기" });
    expect(loadMore).toBeInTheDocument();

    await user.click(loadMore);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("keeps sport selection scoped to feed activities without introducing summary totals", async () => {
    const user = userEvent.setup();
    const bike = createMockActivity({
      id: "bike-activity",
      type: "ride",
      description: "한강 사이클",
      summary: createMockSummary({ distance: 42000 }),
    });
    const run = createMockActivity({
      id: "run-activity",
      type: "run",
      description: "공원 러닝",
      summary: createMockSummary({ distance: 10000 }),
    });

    const view = renderWithProviders(
      <MobileFeedPage
        activities={[bike, run]}
        loading={false}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        feedScope="all"
      />,
      { authenticated: true },
    );

    expect(screen.queryByText("이번 주 요약")).not.toBeInTheDocument();
    expect(screen.queryByText("주간 거리")).not.toBeInTheDocument();
    view.rerender(<MobileFeedPage activities={[bike, run]} sportFilter="run" loading={false} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} feedScope="all" />);
    expect(screen.getByText("공원 러닝")).toBeInTheDocument();
    expect(screen.queryByText("한강 사이클")).not.toBeInTheDocument();
  });

  it.each(["all", "swim"] as const)("keeps the externally selected %s sport in public results", async (sport) => {
    const bike = createMockActivity({
      id: "guest-bike",
      type: "ride",
      description: "게스트 사이클",
    });
    const swim = createMockActivity({
      id: "guest-swim",
      type: "swim",
      description: "게스트 수영",
    });

    renderWithProviders(
      <MobileFeedPage
        activities={[bike, swim]}
        sportFilter={sport}
        loading={false}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        feedScope="all"
      />,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    expect(screen.getByText("게스트 수영")).toBeInTheDocument();
    if (sport === "all") expect(screen.getByText("게스트 사이클")).toBeInTheDocument();
    else expect(screen.queryByText("게스트 사이클")).not.toBeInTheDocument();
  });

  it.each([
    { label: "anonymous public viewer", authenticated: false, visibility: "everyone" as const },
    { label: "authenticated friend viewer", authenticated: true, visibility: "friends" as const },
  ])("uses the shared live fallback and capture path for an $label", async ({ authenticated, visibility }) => {
    const activity = createMockActivity({
      id: "legacy-thumbnail",
      visibility,
      mapImageUrl: "https://storage.googleapis.com/legacy/map.webp",
    });

    const { container } = renderWithProviders(
      <MobileFeedPage
        activities={[activity]}
        loading={false}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        feedScope="all"
      />,
      { authenticated },
    );

    await waitFor(() => expect(screen.getAllByTestId("route-map")).toHaveLength(2));
    const maps = screen.getAllByTestId("route-map");
    expect(maps.every((map) => map.getAttribute("data-interactive") === "false")).toBe(true);
    expect(maps.some((map) => map.getAttribute("data-fallback-image-url") === activity.mapImageUrl)).toBe(true);
    expect(container.querySelector(`img[src="${activity.mapImageUrl}"]`)).not.toBeInTheDocument();
  });

  it("does not render or capture a private activity when current map access is denied", async () => {
    vi.mocked(loadPublicActivityMap).mockResolvedValue(null);
    const activity = createMockActivity({
      id: "private-thumbnail",
      visibility: "private",
      mapImageUrl: null,
    });

    renderWithProviders(
      <MobileFeedPage
        activities={[activity]}
        loading={false}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        feedScope="all"
      />,
    );

    await waitFor(() => expect(loadPublicActivityMap).toHaveBeenCalled());
    expect(screen.queryByTestId("route-map")).not.toBeInTheDocument();
  });

  it("also mounts the hidden canonical capture map for the activity owner", async () => {
    const activity = createMockActivity({
      id: "owner-legacy-thumbnail",
      visibility: "private",
      mapImageUrl: "https://storage.googleapis.com/legacy/map.webp",
    });

    renderWithProviders(
      <MobileFeedPage
        activities={[activity]}
        loading={false}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        feedScope="all"
      />,
      { authenticated: true, user: { uid: activity.userId } },
    );

    await waitFor(() => expect(screen.getAllByTestId("route-map")).toHaveLength(2));
  });

  it("keeps the current canonical Firebase thumbnail on mobile", async () => {
    const activity = createMockActivity({ id: "current-thumbnail" });
    const fileName = await getCanonicalMapThumbnailFileName(activity.id, activity.thumbnailTrack!);
    const objectPath = encodeURIComponent(`map_thumbnails/${activity.userId}/${fileName}`);
    const mapImageUrl = `https://firebasestorage.googleapis.com/v0/b/test/o/${objectPath}?alt=media`;
    expect(isCanonicalMapThumbnailUrl(mapImageUrl, activity.userId, fileName, "test")).toBe(true);
    activity.mapImageUrl = mapImageUrl;
    vi.mocked(loadPublicActivityMap).mockResolvedValue({ activityId: activity.id, revision: "current", privacyEnabled: false, contentRevision: null, contentSelectedRevision: null, mapPreview: { encodedPolyline: activity.thumbnailTrack!, imageUrl: mapImageUrl } });

    const { container } = renderWithProviders(
      <MobileFeedPage
        activities={[activity]}
        loading={false}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        feedScope="all"
      />,
      { authenticated: true },
    );

    await waitFor(() => {
      const imageSources = Array.from(container.querySelectorAll("img"), (image) => image.getAttribute("src"));
      expect(imageSources).toContain(mapImageUrl);
    });
    expect(screen.queryByTestId("route-map")).not.toBeInTheDocument();
  });

  it("applies menu-controlled feed scope without a duplicate home control", async () => {
    const user = userEvent.setup();
    const ownActivity = createMockActivity({ id: "own-private", userId: "test-uid", visibility: "private", description: "내 비공개 활동" });
    const friendActivity = createMockActivity({
      id: "friend-activity",
      userId: "friend-1",
      description: "친구 활동",
    });
    const publicActivity = createMockActivity({
      id: "public-activity",
      userId: "public-1",
      description: "전체 활동",
    });

    const { rerender } = renderWithProviders(
      <MobileFeedPage
        activities={[ownActivity, friendActivity, publicActivity]}
        loading={false}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        currentUserId="test-uid"
        friendIds={["friend-1"]}
        feedScope="all"
      />,
      { authenticated: true },
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    rerender(
      <MobileFeedPage
        activities={[ownActivity, friendActivity, publicActivity]}
        loading={false}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        currentUserId="test-uid"
        friendIds={["friend-1"]}
        feedScope="friends"
      />,
    );

    expect(screen.getByText("내 비공개 활동")).toBeInTheDocument();
    expect(screen.getByText("친구 활동")).toBeInTheDocument();
    expect(screen.queryByText("전체 활동")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^필터/ })).not.toBeInTheDocument();
  });
});

it("keeps indoor cycling accessible without a separate visible indoor label", () => {
 const indoor = renderWithProviders(<CompactActivityCard activity={createMockActivity({ type: "Ride", trainer: true })} />);
 expect(screen.queryByText("실내")).not.toBeInTheDocument();
 expect(screen.getByRole("img", { name: "실내 사이클" })).toBeInTheDocument();
 indoor.unmount();
 renderWithProviders(<CompactActivityCard activity={createMockActivity({ type: "Ride", trainer: false })} />);
 expect(screen.queryByText("실내")).not.toBeInTheDocument();
});

it("gives mobile running distance, pace and time primary positions with sensors secondary", () => {
 const base = createMockActivity();
 renderWithProviders(<CompactActivityCard activity={createMockActivity({ type: "Run", summary: { ...base.summary, averagePower: 264, averageHeartRate: 150 } })} />);
 expect(screen.getByTestId("run-card-primary").children).toHaveLength(3);
 expect(screen.getByTestId("run-card-primary")).not.toHaveTextContent("264 W");
 expect(screen.getByTestId("run-card-secondary")).toHaveTextContent("264 W");
 expect(screen.getByTestId("run-card-secondary")).toHaveTextContent("150 bpm");
});

it("keeps personal running guidance available on signed-in feeds while hiding it for guests", () => {
 const props = { activities: [], loading: false, hasMore: false, loadingMore: false, onLoadMore: vi.fn(), feedScope: "all" as const, onFeedScopeChange: vi.fn(), sportFilter: "run" as const, runningJourney: <div>personal-run-program</div> };
 const guest = renderWithProviders(<MobileFeedPage {...props} />);
 expect(screen.queryByText("personal-run-program")).not.toBeInTheDocument();
 guest.unmount();
 const publicFeed = renderWithProviders(<MobileFeedPage {...props} />, { authenticated: true });
 expect(screen.getByTestId("mobile-owner-running-journey")).toHaveTextContent("personal-run-program");
 publicFeed.unmount();
 renderWithProviders(<MobileFeedPage {...props} feedScope="self" />, { authenticated: true });
 expect(screen.getByTestId("mobile-owner-running-journey")).toHaveTextContent("personal-run-program");
});

it.each([false, true])("distinguishes confirmed elapsed time from an untyped provider duration (%s)", confirmed => {
  const base = createMockActivity();
  const activity = createMockActivity({ startTime: 0, endTime: 0, summary: { ...base.summary, ridingTimeMillis: 3600000, elapsedTimeMillis: confirmed ? 3600000 : undefined, movingTimeSec: undefined, pauseTimeSec: undefined } });
  renderWithProviders(<CompactActivityCard activity={activity} />);
  expect(screen.getByText(confirmed ? "전체시간" : "활동시간")).toBeInTheDocument();
  expect(screen.queryByText(confirmed ? "활동시간" : "전체시간")).not.toBeInTheDocument();
});

describe("published mobile feed body and photos", () => {
  it.each([1, 2, 3, 4, 5, 6])("renders the available %s-photo fixture without empty tiles and preserves gallery navigation", count => {
    const activity = createMockActivity({ photoCount: count });
    activity.feedContentV1 = { version: 1, sourceRevision: activityFeedSourceRevision(activity), revision: "photos", memo: null, memoTruncated: false, totalPhotoCount: count,
      photos: Array.from({ length: count }, (_, id) => ({ id: String(id), url: `https://example.com/${id}.jpg`, caption: `사진${id}` })) };
    const view = renderWithProviders(<CompactActivityCard activity={activity} />);
    const gallery = view.container.querySelector(".mobile-feed-photos, .mobile-feed-media") as HTMLElement;
    const links = within(gallery).getAllByRole("link");
    expect(links).toHaveLength(Math.min(count, 5));
    expect(gallery.querySelectorAll("img")).toHaveLength(Math.min(count, 5));
    expect(links.every(link => link.getAttribute("href") === `/ko/activity/${activity.id}?tab=overview`)).toBe(true);
    if (count > 5) expect(within(gallery).getByText("+1")).toBeVisible();
    else expect(within(gallery).queryByText(/^\+/)).not.toBeInTheDocument();
  });
  it("uses the actual ready previews when fewer photos than the total are available", () => {
    const activity = createMockActivity({ photoCount: 11 });
    activity.feedContentV1 = { version: 1, sourceRevision: activityFeedSourceRevision(activity), revision: "partial", memo: null, memoTruncated: false, totalPhotoCount: 11,
      photos: [0, 1].map(id => ({ id: String(id), url: `https://example.com/${id}.jpg`, caption: null })) };
    const view = renderWithProviders(<CompactActivityCard activity={activity} />);
    const gallery = view.container.querySelector(".mobile-feed-photos, .mobile-feed-media") as HTMLElement;
    expect(within(gallery).getAllByRole("link")).toHaveLength(2);
    expect(within(gallery).getByText("+9")).toBeVisible();
  });

  it("shows actual memo and three photos under the map with the remaining count", async () => {
    const activity = createMockActivity({ photoCount: 10 });
    activity.feedContentV1 = { version: 1, sourceRevision: activityFeedSourceRevision(activity), revision: "r1", memo: "함께 달린 기록\n다음에도 함께해요", memoTruncated: false, totalPhotoCount: 10,
      photos: [0, 1, 2].map(id => ({ id: String(id), url: `https://example.com/${id}.jpg`, caption: `사진${id}` })) };
    const view = renderWithProviders(<CompactActivityCard activity={activity} />);
    expect(screen.getByText(/함께 달린 기록/)).toBeVisible();
    const gallery = view.container.querySelector(".mobile-feed-photos")!;
    expect(gallery.querySelectorAll("img")).toHaveLength(3);
    expect(screen.getByText("+7")).toBeVisible();
    expect(within(gallery as HTMLElement).getAllByRole("link")[0]).toHaveAttribute("href", `/ko/activity/${activity.id}?tab=overview`);
    await waitFor(() => expect(gallery.previousElementSibling?.querySelector("[data-map-thumbnail-frame]")).toBeInTheDocument());
  });
  it("omits stale memo and photos after the activity publication revision changes", () => {
    const activity = createMockActivity({ contentRevision: 2, photoCount: 0 });
    activity.feedContentV1 = { version: 1, sourceRevision: activityFeedSourceRevision({ ...activity, contentRevision: 1 }), revision: "old", memo: "이전 비공개 본문", memoTruncated: false, totalPhotoCount: 1,
      photos: [{ id: "old", url: "https://example.com/old.jpg", caption: null }] };
    const view = renderWithProviders(<CompactActivityCard activity={activity} />);
    expect(screen.queryByText("이전 비공개 본문")).not.toBeInTheDocument();
    expect(view.container.querySelector(".mobile-feed-photos")).not.toBeInTheDocument();
  });
});

describe("attachment-confirmed feed media cases", () => {
  it.each([
    { map: false, count: 6, visible: 4, remaining: 2, shared: false },
    { map: true, count: 1, visible: 1, remaining: 0, shared: true },
    { map: true, count: 2, visible: 2, remaining: 0, shared: false },
    { map: true, count: 3, visible: 3, remaining: 0, shared: false },
    { map: true, count: 4, visible: 4, remaining: 0, shared: true },
    { map: true, count: 10, visible: 5, remaining: 5, shared: false },
  ])("keeps map=$map/photos=$count media bounded and in the confirmed row groups", async ({ map, count, visible, remaining, shared }) => {
    const activity = createMockActivity({ thumbnailTrack: map ? "mock-polyline" : "", photoCount: count });
    const content = { version: 1 as const, sourceRevision: activityFeedSourceRevision(activity), revision: "cases", memo: null, memoTruncated: false, totalPhotoCount: count,
      photos: Array.from({ length: Math.min(count, 5) }, (_, id) => ({ id: String(id), url: `https://example.com/${id}.jpg`, caption: null })) };
    const view = renderWithProviders(<MobileRouteThumbnail activity={activity} content={content} />);
    const photoLinks = screen.getAllByRole("link", { name: /사진 \d/ });
    expect(photoLinks).toHaveLength(visible);
    if (remaining) expect(screen.getByText(`+${remaining}`)).toBeVisible();
    else expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
    if (map) await waitFor(() => expect(view.container.querySelector("[data-map-thumbnail-frame]")).toBeInTheDocument());
    const mapFrame = view.container.querySelector("[data-map-thumbnail-frame]");
    expect(!!mapFrame).toBe(map);
    if (mapFrame) {
      const sharedMedia = mapFrame.closest(".mobile-feed-media");
      expect(sharedMedia !== null && sharedMedia === photoLinks[0].parentElement).toBe(shared);
      expect(mapFrame).toHaveClass(shared ? "aspect-square" : "aspect-[var(--feed-thumb-aspect)]");
    }
  });
});

it("keeps an inline video poster before the next photo without navigating or downloading video on mount", () => {
  const activity = createMockActivity({ thumbnailTrack: "", photoCount: 2 });
  activity.feedContentV1 = { version: 1, sourceRevision: activityFeedSourceRevision(activity), revision: "video", memo: null, memoTruncated: false, totalPhotoCount: 2, photos: [
    { id: "video", kind: "video", url: "https://example.test/poster.jpg", videoUrl: "https://example.test/master.m3u8", caption: null },
    { id: "photo", url: "https://example.test/photo.jpg", caption: "다음 사진" },
  ] };
  const view = renderWithProviders(<CompactActivityCard activity={activity} />);
  const gallery = view.container.querySelector(".mobile-feed-photos")!;
  expect(gallery.children).toHaveLength(2);
  const video = gallery.children[0].querySelector("video")!;
  expect(video).toHaveAttribute("poster", "https://example.test/poster.jpg");
  expect(video).not.toHaveAttribute("src");
  expect(gallery.children[1]).toHaveAttribute("href", `/ko/activity/${activity.id}?tab=overview`);
  expect(gallery.children[1].querySelector("img")).toHaveAttribute("src", "https://example.test/photo.jpg");
});

it("does not reuse a cached card map when current map access is unavailable", async () => {
  vi.mocked(loadPublicActivityMap).mockResolvedValue(null);
  const activity = createMockActivity({ mapImageUrl: "https://example.test/stale-map.webp" });
  const view = renderWithProviders(<CompactActivityCard activity={activity} />);
  await waitFor(() => expect(loadPublicActivityMap).toHaveBeenCalled());
  expect(screen.queryByTestId("route-map")).not.toBeInTheDocument();
  expect(view.container.querySelector('img[src="https://example.test/stale-map.webp"]')).not.toBeInTheDocument();
});

it("reports first committed home content only after loading and preserves error/retry attempts", async () => {
  vi.mocked(track).mockClear();
  const retry = vi.fn();
  const props = { activities: [], loading: true, error: false, hasMore: false, loadingMore: false, onLoadMore: vi.fn(), onRetry: retry };
  const view = renderWithProviders(<MobileFeedPage {...props} />);
  expect(vi.mocked(track).mock.calls.filter(c => c[0] === "feed_first_content")).toHaveLength(0);
  view.rerender(<MobileFeedPage {...props} loading={false} error />);
  await waitFor(() => expect(track).toHaveBeenCalledWith("feed_first_content", expect.objectContaining({ outcome: "error" })));
  fireEvent.click(screen.getByRole("button", { name: /다시/ }));
  expect(retry).toHaveBeenCalledTimes(1);
  view.rerender(<MobileFeedPage {...props} loading={false} />);
  await waitFor(() => expect(track).toHaveBeenCalledWith("feed_first_content", expect.objectContaining({ outcome: "empty" })));
});

it("keeps Strava source metrics consistent with detail despite stale calculated summary fields", () => {
  const activity = createMockActivity({ source: "strava", stravaSummaryV1: { version: 1,
    distance: 135361, moving_time: 19046, elapsed_time: 31351, average_speed: 25.6 / 3.6,
    total_elevation_gain: 645, average_heartrate: 140.2, average_watts: 120.9,
  } });
  renderWithProviders(<CompactActivityCard activity={activity} />);
  expect(screen.getByRole("article")).toHaveTextContent(/135.36\s*km/);
  expect(screen.getByRole("article")).toHaveTextContent(/25.6\s*km\/h/);
  expect(screen.getByRole("article")).toHaveTextContent(/645\s*m/);
  expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
});
