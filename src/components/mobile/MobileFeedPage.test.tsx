import { useState } from "react";
import { GlossaryProvider } from "../common/GlossaryProvider";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MobileFeedPage, { CompactActivityCard } from "./MobileFeedPage";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { createMockActivity, createMockSummary } from "../../__tests__/fixtures/mockData";
import { getCanonicalMapThumbnailFileName, isCanonicalMapThumbnailUrl } from "../activity/ActivityRouteThumbnail";
import { useActivitySearch } from "../../hooks/useActivities";
import HomeUpcomingEvents from "../dashboard/HomeUpcomingEvents";
import { setCallableImplementation, setCollectionDocs } from "../../__tests__/mocks/firebase";
import { getDocs, startAfter, where } from "firebase/firestore";
import type { User } from "firebase/auth";
import { AuthContextProvider } from "../../contexts/AuthContext";
import { signInCancelledError } from "../../utils/signInCancelled";

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

async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  if (!screen.queryByRole("combobox", { name: "활동 종목 필터" })) await user.click(screen.getByRole("button", { name: /^필터/, expanded: false }));
  return screen.getByRole("combobox", { name: "활동 종목 필터" });
}

async function openSearch(user: ReturnType<typeof userEvent.setup>) {
  await openFilters(user);
  return screen.getByRole("textbox", { name: "활동 검색..." });
}

async function submitSearch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("textbox", { name: "활동 검색..." }));
  await user.keyboard("{Enter}");
}

describe("MobileFeedPage", () => {
  it("opens one filter panel, keeps applied search context when closed and restores its input on reopen", async () => {
    const user = userEvent.setup();
    setCollectionDocs("activities", []);
    function Feed() {
      const search = useActivitySearch(new Set());
      return <MobileFeedPage activities={[]} activitySearch={search} loading={false} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} feedScope="all" onFeedScopeChange={vi.fn()} />;
    }
    renderWithProviders(<Feed />);
    const trigger = screen.getByRole("button", { name: "필터" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    const input = await openSearch(user);
    expect(input).toHaveFocus();
    expect(screen.getByRole("button", { name: "검색" })).toBeDisabled();
    expect(document.getElementById(trigger.getAttribute("aria-controls")!)).toContainElement(input);
    expect(screen.getByRole("combobox", { name: "활동 종목 필터" })).toHaveValue("all");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.change(await openSearch(user), { target: { value: "설레임" } });
    await user.click(screen.getByRole("button", { name: "검색" }));
    await screen.findByText("검색 결과가 없어요");
    await user.click(trigger);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("검색: 설레임", { selector: "p" })).toBeInTheDocument();
    expect(await openSearch(user)).toHaveValue("설레임");
    await user.click(screen.getByRole("button", { name: "검색 초기화" }));
    expect(screen.getByRole("textbox", { name: "활동 검색..." })).toHaveValue("");
    await user.click(trigger);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
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
  it("keeps one schedule query across first-record, filter, loading and search transitions", async () => {
    const user = userEvent.setup();
    const scheduleRead = vi.fn(() => ({ data: { events: [{ eventId: "registered", name: "참가 예정 라이딩", startTime: Date.now() + 86400000 }] } }));
    setCallableImplementation("listMyRegisteredEvents", scheduleRead);
    setCollectionDocs("activities", []);
    const first = createMockActivity({ id: "first", description: "첫 활동" });
    const second = createMockActivity({ id: "second", description: "다음 활동" });
    function Feed({ activities, loading = false, sport = "all" }: { activities: typeof first[]; loading?: boolean; sport?: "all" | "run" }) {
      const search = useActivitySearch(new Set());
      return <MobileFeedPage activities={activities} activitySearch={search} loading={loading} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} feedScope="all" onFeedScopeChange={vi.fn()} sportFilter={sport} notices={<HomeUpcomingEvents compact />} />;
    }
    const view = renderWithProviders(<Feed activities={[first, second]} />, { authenticated: true });
    const schedule = await screen.findByRole("link", { name: /참가 예정 라이딩/ });
    expect(schedule).toHaveAttribute("href", "/ko/event/registered");
    expect(screen.getByText("첫 활동").compareDocumentPosition(schedule) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(schedule.compareDocumentPosition(screen.getByText("다음 활동")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    view.rerender(<Feed activities={[second]} />);
    view.rerender(<Feed activities={[second]} sport="run" />);
    expect(screen.getByRole("link", { name: /참가 예정 라이딩/ })).toBeVisible();
    view.rerender(<Feed activities={[second]} loading />);
    expect(screen.queryByRole("link", { name: /참가 예정 라이딩/ })).not.toBeInTheDocument();
    view.rerender(<Feed activities={[second]} />);
    fireEvent.change(await openSearch(user), { target: { value: "없는검색" } });
    await submitSearch(user);
    expect(await screen.findByText("검색 결과가 없어요")).toBeInTheDocument();
    expect(scheduleRead).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /참가 예정 라이딩/ })).toBe(schedule);
  });
  it("prevents duplicate guest sign-in while pending and recovers silently after cancellation", async () => {
    const user = userEvent.setup();
    let cancelSignIn!: (reason: Error) => void;
    const signIn = vi.fn(() => new Promise<void>((_resolve, reject) => { cancelSignIn = reject; }));
    renderWithProviders(<AuthContextProvider value={{ user: null, profile: null, loading: false, profileLoading: false, signIn, logout: vi.fn() }}>
      <MobileFeedPage activities={[]} loading={false} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} feedScope="all" onFeedScopeChange={vi.fn()} />
    </AuthContextProvider>);
    const login = screen.getByRole("button", { name: "로그인" });
    await user.click(login);
    expect(login).toBeDisabled();
    expect(login).toHaveAttribute("aria-busy", "true");
    await user.click(login);
    expect(signIn).toHaveBeenCalledTimes(1);
    await act(async () => cancelSignIn(signInCancelledError()));
    expect(login).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("reports a genuine guest sign-in failure and allows another attempt", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn().mockRejectedValueOnce(new Error("network unavailable")).mockResolvedValueOnce(undefined);
    renderWithProviders(<AuthContextProvider value={{ user: null, profile: null, loading: false, profileLoading: false, signIn, logout: vi.fn() }}>
      <MobileFeedPage activities={[]} loading={false} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} feedScope="all" onFeedScopeChange={vi.fn()} />
    </AuthContextProvider>);
    const login = screen.getByRole("button", { name: "로그인" });
    await user.click(login);
    expect(await screen.findByRole("alert")).toHaveTextContent("로그인에 실패했습니다. 다시 시도해 주세요.");
    expect(login).toBeEnabled();
    await user.click(login);
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(login).toBeEnabled();
  });
  it("shows public feed controls for an anonymous session rather than owner-only content", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuthContextProvider value={{ user: { uid: "anonymous", isAnonymous: true } as User, profile: null, loading: false, profileLoading: false, signIn: vi.fn(), logout: vi.fn() }}>
      <MobileFeedPage activities={[]} loading={false} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} feedScope="self" onFeedScopeChange={vi.fn()} sportFilter="run" runningJourney={<p>Owner running program</p>} />
    </AuthContextProvider>);
    expect(screen.getByRole("heading", { name: "공개 활동" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그인" })).toBeInTheDocument();
    expect(screen.queryByText("Owner running program")).not.toBeInTheDocument();
    await openFilters(user);
    expect(screen.queryByRole("combobox", { name: "공개 범위" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "조회 기간" })).toBeInTheDocument();
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
  it("leaves shared activity labels plain outside the home glossary scope", () => {
    renderWithProviders(<CompactActivityCard activity={createMockActivity()} />);
    expect(screen.getByText("획득고도")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /설명/ })).not.toBeInTheDocument();
  });
  it("keeps home focused on feed filters without personal weekly totals", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MobileFeedPage activities={[]} loading={false} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} feedScope="all" onFeedScopeChange={vi.fn()} sportFilter="run" />, { authenticated: true });
    expect(screen.getByRole("heading", { name: "활동 피드" })).toBeInTheDocument();
    expect(screen.queryByText(/내 최근 7일/)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "활동 종목 필터" })).not.toBeInTheDocument();
    const filters = await openFilters(user);
    expect(filters).toHaveValue("run");
    expect(filters).not.toHaveTextContent(/km|건|—/);
  });
  it("resets search scope and dates while retaining running and the keyword", async () => {
    const user = userEvent.setup();
    const changeSport = vi.fn();
    setCollectionDocs("activities", []);
    function SearchFeed() {
      const activitySearch = useActivitySearch(new Set());
      const [scope, setScope] = useState<"all" | "self" | "friends">("self");
      return <MobileFeedPage activities={[]} activitySearch={activitySearch} loading={false} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} feedScope={scope} onFeedScopeChange={setScope} sportFilter="run" onSportFilterChange={changeSport} />;
    }
    renderWithProviders(<SearchFeed />, { authenticated: true });
    await user.type(await openSearch(user), "없는러닝");
    await submitSearch(user);
    await user.click(await screen.findByRole("button", { name: "범위·기간 초기화" }));
    expect(screen.getByRole("textbox", { name: "활동 검색..." })).toHaveValue("없는러닝");
    await openFilters(user);
    expect(screen.getByRole("combobox", { name: "활동 종목 필터" })).toHaveValue("run");
    expect(changeSport).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "범위·기간 초기화" })).not.toBeInTheDocument();
    await openFilters(user);
    expect(screen.getByRole("combobox", { name: "공개 범위" })).toHaveValue("all");
    expect(screen.getByRole("combobox", { name: "조회 기간" })).toHaveValue("all");
  });
  it("searches the server for 설레임 even when the activity is outside the loaded feed", async () => {
    const user = userEvent.setup();
    setCollectionDocs("activities", [
      { id: "older-match", ...createMockActivity({ id: "older-match", description: "설레임 첫 라이딩" }) },
    ]);
    const searchWhere = vi.mocked(where);
    searchWhere.mockClear();

    function SearchFeed() {
      const activitySearch = useActivitySearch(new Set());
      return <MobileFeedPage activities={[]} activitySearch={activitySearch} loading={false} hasMore={false}
        loadingMore={false} onLoadMore={vi.fn()} feedScope="all" onFeedScopeChange={vi.fn()} />;
    }
    renderWithProviders(<SearchFeed />);

    await user.type(await openSearch(user), "설레임");
    await submitSearch(user);

    expect(await screen.findByText("설레임 첫 라이딩")).toBeInTheDocument();
    expect(searchWhere).toHaveBeenCalledWith("keywords", "array-contains", "설레임");
    await user.click(screen.getByRole("button", { name: "검색 초기화" }));
    expect(screen.queryByText("설레임 첫 라이딩")).not.toBeInTheDocument();
  });
  it("pages already loaded all-period activities in groups of 20", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    const activities = Array.from({ length: 45 }, (_, index) => createMockActivity({ id: `loaded-${index}`, description: `기존 활동 ${index}` }));
    renderWithProviders(<MobileFeedPage activities={activities} loading={false} hasMore={false} loadingMore={false}
      onLoadMore={onLoadMore} feedScope="all" onFeedScopeChange={vi.fn()} />);
    expect(screen.getByText("기존 활동 19")).toBeInTheDocument();
    expect(screen.queryByText("기존 활동 20")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "더 보기" }));
    expect(screen.getByText("기존 활동 39")).toBeInTheDocument();
    expect(screen.queryByText("기존 활동 40")).not.toBeInTheDocument();
    expect(onLoadMore).not.toHaveBeenCalled();
    await openFilters(user);
    await user.selectOptions(screen.getByRole("combobox", { name: "조회 기간" }), "7d");
    await user.selectOptions(screen.getByRole("combobox", { name: "조회 기간" }), "all");
    expect(screen.getByText("기존 활동 19")).toBeInTheDocument();
    expect(screen.queryByText("기존 활동 20")).not.toBeInTheDocument();
  });

  it("shows only 20 matching activities until more is clicked", async () => {
    const user = userEvent.setup();
    const matches = Array.from({ length: 41 }, (_, index) => {
      const activity = createMockActivity({ id: `ride-${index}`, description: `설레임 활동 ${index}`, startTime: 1_000_000 - index });
      return { id: activity.id, data: () => activity };
    });
    const reads = vi.mocked(getDocs).mockClear();
    reads.mockResolvedValueOnce({ docs: matches.slice(0, 20) } as Awaited<ReturnType<typeof getDocs>>)
      .mockResolvedValueOnce({ docs: matches.slice(20, 40) } as Awaited<ReturnType<typeof getDocs>>);

    function SearchFeed() {
      const activitySearch = useActivitySearch(new Set());
      return <MobileFeedPage activities={[]} activitySearch={activitySearch} loading={false} hasMore={false}
        loadingMore={false} onLoadMore={vi.fn()} feedScope="all" onFeedScopeChange={vi.fn()} />;
    }
    renderWithProviders(<SearchFeed />);

    await user.type(await openSearch(user), "설레임");
    await submitSearch(user);

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
      return <MobileFeedPage activities={[friendActivity]} activitySearch={activitySearch} loading={false} hasMore={false}
        loadingMore={false} onLoadMore={vi.fn()} feedScope="friends" friendIds={["friend-1"]} onFeedScopeChange={vi.fn()} />;
    }
    renderWithProviders(<SearchFeed />, { authenticated: true });

    await user.type(await openSearch(user), "설레임");
    await submitSearch(user);

    expect(await screen.findByText("설레임 비공개 라이딩")).toBeInTheDocument();
  });
  it("keeps loaded matches visible on search failure and retries the same keyword", async () => {
    const user = userEvent.setup();
    const loaded = createMockActivity({ id: "loaded-match", description: "설레임 로드된 라이딩" });
    setCollectionDocs("activities", []);
    const searchRead = vi.mocked(getDocs);
    searchRead.mockClear().mockRejectedValueOnce(new Error("search unavailable"));

    function SearchFeed() {
      const activitySearch = useActivitySearch(new Set());
      return <MobileFeedPage activities={[loaded]} activitySearch={activitySearch} loading={false} hasMore={false}
        loadingMore={false} onLoadMore={vi.fn()} feedScope="all" onFeedScopeChange={vi.fn()} />;
    }
    renderWithProviders(<SearchFeed />);

    fireEvent.change(await openSearch(user), { target: { value: "설레임" } });
    await submitSearch(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("추가 활동을 불러오지 못했어요");
    expect(screen.getByText("설레임 로드된 라이딩")).toBeInTheDocument();

    await submitSearch(user);
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
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: firstPage } as Awaited<ReturnType<typeof getDocs>>)
      .mockResolvedValueOnce({ docs: [{ id: run.id, data: () => run }] } as Awaited<ReturnType<typeof getDocs>>);
    vi.mocked(startAfter).mockClear();

    function SearchFeed() {
      const activitySearch = useActivitySearch(new Set());
      return <MobileFeedPage activities={[]} activitySearch={activitySearch} loading={false} hasMore={false}
        loadingMore={false} onLoadMore={vi.fn()} feedScope="all" onFeedScopeChange={vi.fn()} sportFilter="run" />;
    }
    renderWithProviders(<SearchFeed />);

    await user.type(await openSearch(user), "설레임");
    await submitSearch(user);
    expect(await screen.findByText("더 많은 검색 결과가 있을 수 있어요")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "더 보기" }));

    expect(await screen.findByText("설레임 나중 러닝")).toBeInTheDocument();
    expect(startAfter).toHaveBeenCalled();
  });



  it("keeps the first activity visible without a home routine control", () => {
    renderWithProviders(<MobileFeedPage
      activities={[createMockActivity({ id: "first-ride", description: "첫 활동" })]}
      loading={false} hasMore={false} loadingMore={false} onLoadMore={vi.fn()}
      feedScope="all" onFeedScopeChange={vi.fn()}
    />, { authenticated: true });

    expect(screen.getByText("첫 활동")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /연속 라이딩/ })).not.toBeInTheDocument();
    expect(screen.queryByText("라이딩 루틴")).not.toBeInTheDocument();
  });

  it("opens recovery filters without dropping the selected running scope", async () => {
    const user = userEvent.setup();
    const changeSport = vi.fn();
    renderWithProviders(<MobileFeedPage activities={[createMockActivity({ type: "ride" })]} loading={false} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} feedScope="all" onFeedScopeChange={vi.fn()} sportFilter="run" onSportFilterChange={changeSport} />, { authenticated: true });
    const recovery = within(screen.getByText("조건에 맞는 활동이 없어요").parentElement!).getByRole("button", { name: "필터" });
    await user.click(recovery);
    expect(screen.getByRole("combobox", { name: "조회 기간" })).toBeVisible();
    await openFilters(user);
    expect(screen.getByRole("combobox", { name: "활동 종목 필터" })).toHaveValue("run");
    expect(changeSport).not.toHaveBeenCalled();
    const empty = screen.getByText("조건에 맞는 활동이 없어요").parentElement!;
    expect(empty.querySelector('svg[data-icon="run"]')).toHaveAttribute("aria-hidden", "true");
    expect(within(empty).queryByText("🚴")).not.toBeInTheDocument();

  });

  it("does not add routine content when a filter has no matching activities", () => {
    renderWithProviders(<MobileFeedPage
      activities={[createMockActivity({ id: "bike-ride", type: "ride" })]}
      loading={false} hasMore={false} loadingMore={false} onLoadMore={vi.fn()}
      feedScope="all" onFeedScopeChange={vi.fn()} sportFilter="run"
    />, { authenticated: true });

    expect(screen.getByText("조건에 맞는 활동이 없어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /연속 라이딩/ })).not.toBeInTheDocument();
    expect(screen.queryByText("라이딩 루틴")).not.toBeInTheDocument();
  });

  it("keeps the public feed visible for a guest even with a stale personal scope", async () => {
    const user = userEvent.setup();
    const activities = [
      createMockActivity({ id: "public-one", description: "공개 라이딩" }),
      createMockActivity({ id: "public-two", description: "공개 러닝", type: "run" }),
    ];
    renderWithProviders(<MobileFeedPage activities={activities} loading={false} hasMore={false}
      loadingMore={false} onLoadMore={vi.fn()} feedScope="friends" onFeedScopeChange={vi.fn()} />);

    expect(screen.queryByRole("combobox", { name: "공개 범위" })).not.toBeInTheDocument();
    await openFilters(user);
    const dateSelect = screen.getByRole("combobox", { name: "조회 기간" });
    expect(screen.getByText("공개 라이딩")).toBeInTheDocument();
    await openFilters(user);
    await user.selectOptions(screen.getByRole("combobox", { name: "활동 종목 필터" }), "run");
    expect(screen.getByText("공개 러닝")).toBeInTheDocument();
    expect(screen.queryByText("공개 라이딩")).not.toBeInTheDocument();
  });

  it("shows a retryable error instead of an empty feed after loading fails", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithProviders(<MobileFeedPage activities={[]} loading={false} error onRetry={onRetry} hasMore={false}
      loadingMore={false} onLoadMore={vi.fn()} feedScope="all" onFeedScopeChange={vi.fn()} />);

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
      loadingMore={false} onLoadMore={vi.fn()} feedScope="all" onFeedScopeChange={vi.fn()}
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
      loadingMore={false} onLoadMore={vi.fn()} feedScope="all" onFeedScopeChange={vi.fn()}
      sportFilter="run"
    />);

    expect(screen.queryByText("로드된 사이클")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("활동 목록의 일부만 불러왔습니다");
  });

  it("exposes the activity as a keyboard-focusable link without nesting author and social actions", () => {
    const activity = createMockActivity({ id: "keyboard-ride", description: "키보드 라이딩" });
    renderWithProviders(<MobileFeedPage activities={[activity]} loading={false} hasMore={false}
      loadingMore={false} onLoadMore={vi.fn()} feedScope="all" onFeedScopeChange={vi.fn()} />);

    const activityLink = screen.getByRole("link", { name: "키보드 라이딩" });
    expect(activityLink).toHaveAttribute("href", "/ko/activity/keyboard-ride");
    expect(activityLink).not.toContainElement(screen.getByRole("link", { name: "테" }));
  });

  it("keeps the signed-in mobile Home focused on activity and summary content", () => {
    renderWithProviders(<MobileFeedPage activities={[]} loading={false} hasMore={false}
      loadingMore={false} onLoadMore={vi.fn()} feedScope="all" onFeedScopeChange={vi.fn()} />, {
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
        onFeedScopeChange={vi.fn()}
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

    renderWithProviders(
      <MobileFeedPage
        activities={[bike, run]}
        loading={false}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        feedScope="all"
        onFeedScopeChange={vi.fn()}
      />,
      { authenticated: true },
    );

    expect(screen.queryByText("이번 주 요약")).not.toBeInTheDocument();
    expect(screen.queryByText("주간 거리")).not.toBeInTheDocument();
    const sportFilters = await openFilters(user);
    expect(within(sportFilters).getAllByRole("option")).toHaveLength(4);
    expect(sportFilters).toHaveValue("all");
    await user.selectOptions(sportFilters, "run");
    expect(sportFilters).toHaveValue("run");
    expect(screen.getByText("공원 러닝")).toBeInTheDocument();
    expect(screen.queryByText("한강 사이클")).not.toBeInTheDocument();
  });

  it.each(["all", "swim"] as const)("keeps the selected %s sport and all four filters inside search", async (sport) => {
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
        onFeedScopeChange={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    const sportFilters = await openFilters(user);
    expect(within(sportFilters).getAllByRole("option")).toHaveLength(4);
    expect(sportFilters).toHaveValue(sport);

    expect(within(sportFilters).getByRole("option", { name: "종목수영" })).toBeEnabled();

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
        onFeedScopeChange={vi.fn()}
      />,
      { authenticated },
    );

    await waitFor(() => expect(screen.getAllByTestId("route-map")).toHaveLength(2));
    const maps = screen.getAllByTestId("route-map");
    expect(maps.every((map) => map.getAttribute("data-interactive") === "false")).toBe(true);
    expect(maps.some((map) => map.getAttribute("data-fallback-image-url") === activity.mapImageUrl)).toBe(true);
    expect(container.querySelector(`img[src="${activity.mapImageUrl}"]`)).not.toBeInTheDocument();
  });

  it("does not mount an anonymous capture map for a private activity", async () => {
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
        onFeedScopeChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getAllByTestId("route-map")).toHaveLength(1));
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
        onFeedScopeChange={vi.fn()}
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

    const { container } = renderWithProviders(
      <MobileFeedPage
        activities={[activity]}
        loading={false}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        feedScope="all"
        onFeedScopeChange={vi.fn()}
      />,
      { authenticated: true },
    );

    await waitFor(() => {
      const imageSources = Array.from(container.querySelectorAll("img"), (image) => image.getAttribute("src"));
      expect(imageSources).toContain(mapImageUrl);
    });
    expect(screen.queryByTestId("route-map")).not.toBeInTheDocument();
  });

  it("filters the feed scope from the select beside the date range", async () => {
    const user = userEvent.setup();
    const onFeedScopeChange = vi.fn();
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
        onFeedScopeChange={onFeedScopeChange}
      />,
      { authenticated: true },
    );

    const filterToggle = screen.getByRole("button", { name: "필터" });
    expect(filterToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("combobox", { name: "공개 범위" })).not.toBeInTheDocument();
    await user.click(filterToggle);
    expect(filterToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("combobox", { name: "공개 범위" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "조회 기간" })).toBeVisible();
    const scopeSelect = screen.getByRole("combobox", { name: "공개 범위" });
    const dateSelect = screen.getByRole("combobox", { name: "조회 기간" });
    expect(scopeSelect.compareDocumentPosition(dateSelect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.selectOptions(scopeSelect, "friends");

    expect(onFeedScopeChange).toHaveBeenCalledWith("friends");

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
        onFeedScopeChange={onFeedScopeChange}
      />,
    );

    expect(screen.getByText("내 비공개 활동")).toBeInTheDocument();
    expect(screen.getByText("친구 활동")).toBeInTheDocument();
    expect(screen.queryByText("전체 활동")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "필터: 친구" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "필터: 친구" }));
    expect(screen.queryByRole("combobox", { name: "공개 범위" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "필터: 친구" })).toHaveAccessibleName("필터: 친구");
    expect(screen.getByText("친구", { selector: "p" })).toBeInTheDocument();
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
