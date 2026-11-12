import { installActivityQueryFake } from "../__tests__/fixtures/activityQueryFake";
import { getDocs } from "firebase/firestore";
import { auth } from "../services/firebase";
import * as activityAcceptance from "../utils/estimateTSS";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import AthletePage from "./AthletePage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { loadActivityDiscovery } from "../services/activityDiscovery";
import { setDocData, setCollectionDocs, mockCollectionData, simulateLogin, setCallableResult as setResult, setCallableImplementation as setImplementation, mockCallableInvocations } from "../__tests__/mocks/firebase";
import { createMockProfile, createMockActivity, createMockSummary } from "../__tests__/fixtures/mockData";

vi.mock("../services/activityDiscovery", () => ({ loadActivityDiscovery: vi.fn(async (_services, request) => {
  const rows = (mockCollectionData.get("activities") ?? []).filter(row => row.userId === request.targetUid && row.deletedAt == null && (request.fromInclusive === undefined || row.startTime >= request.fromInclusive) && (request.toExclusive === undefined || row.startTime < request.toExclusive) && (row.visibility ?? "everyone") === "everyone");
  const offset = Number(request.cursor ?? 0), end = offset + (request.limit ?? 20);
  return { expiresAt: Date.now() + 600000, items: rows.slice(offset, end), nextCursor: end < rows.length ? String(end) : null, exhausted: end >= rows.length };
}) }));

// Mock heavy components
vi.mock("../components/RouteMap", () => ({
  default: () => <div data-testid="route-map">Map</div>,
}));
vi.mock("../components/WeeklyChart", () => ({
  default: ({ onPeriodSelect, data }: { onPeriodSelect?: (period: string) => void; data?: Array<{tss?:number|null}> }) => <div data-testid="weekly-chart" data-known-load={data?.some(row=>typeof row.tss==="number"&&row.tss>0) ? "yes":"no"}><button onClick={() => onPeriodSelect?.("2026.09")}>Select September</button></div>,
}));

// Mock useParams
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useParams: () => ({ userId: "athlete-1" }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

const withCoverage = (value: unknown) => ({ pendingCount: 0, coverageComplete: true, retryCursor: null, ...(value as object) });
const setCallableResult = (name: string, response: { data: unknown }) => setResult(name, { data: name === "getAthleteProfilePreview" ? withCoverage(response.data) : response.data });
const setCallableImplementation = (name: string, fn: (request: unknown) => unknown) => setImplementation(name, async request => {
  const response = await fn(request) as { data: unknown };
  return name === "getAthleteProfilePreview" ? { data: withCoverage(response.data) } : response;
});
const totalsFixture = (patch = {}) => ({ schemaVersion: 1, ownerUid: "athlete-1", epoch: "profile-epoch", state: "ready", revision: 1, count: 5, distance: 5000, timeDisplayMillis: 3600000, elevation: 100, unknownDistanceCount: 0, unknownTimeCount: 0, unknownElevationCount: 0, ...patch });
let activityQueries: ReturnType<typeof installActivityQueryFake>;
beforeEach(() => {
  activityQueries = installActivityQueryFake();
  setCallableResult("getPublicSegmentMetadata", { data: { items: [], cursor: null, hasMore: false } });
  setCallableResult("ensureAthleteProfile", { data: totalsFixture() });
  setCallableResult("getAthleteProfilePreview", { data: { items: [], scope: "recent", complete: true, nextCursor: null } });
});

describe("AthletePage", () => {
  it("검색 입력만 바뀌면 전체 이력 대표를 다시 계산하지 않는다", async () => {
    const acceptance = vi.spyOn(activityAcceptance, "acceptedPhysicalActivities");
    setCollectionDocs("activities", [{id: "memo-ride", ...createMockActivity({ deletedAt: null,id: "memo-ride", userId: "athlete-1"})}]);
    renderWithProviders(<AthletePage />);
    const input = await screen.findByPlaceholderText("활동 검색... (Enter)");
    await waitFor(() => expect(screen.getByText("한강 라이더")).toBeInTheDocument());
    const count = acceptance.mock.calls.length;
    fireEvent.change(input, {target: {value: "a"}});
    fireEvent.change(input, {target: {value: "ab"}});
    expect(acceptance.mock.calls.length).toBe(count);
    acceptance.mockRestore();
  });

  it("shows shared activity feed cards on the own profile while preserving full-history totals and a log destination", async () => {
    setCollectionDocs("activities", Array.from({length: 5}, (_, index) => ({id: `preview-${index}`, ...createMockActivity({ deletedAt: null,
      id: `preview-${index}`, userId: "athlete-1", description: `Overview activity ${index}`, startTime: Date.UTC(2026, 8, index + 1), endTime: Date.UTC(2026, 8, index + 1, 1),
    })})));
    renderWithProviders(<AthletePage />, {authenticated: true, user: {uid: "athlete-1"}});
    await waitFor(() => expect(screen.getAllByTestId("H1-2-1")).toHaveLength(5));
    expect(screen.getByText("5회")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("활동 검색... (Enter)")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("P0-2-1")).getByRole("link", {name: "전체보기"})).toHaveAttribute("href", "/ko/athlete/me/activities");
    expect(within(screen.getAllByTestId("H1-2-1")[0]!).getByRole("link", {name: "Overview activity 4"})).toHaveAttribute("href", "/ko/activity/preview-4");
  });

  it("filters the feed by the selected chart period and restores recent activities", async () => {
    setCollectionDocs("activities", [
      { id: "sep", ...createMockActivity({ deletedAt: null, id: "sep", userId: "athlete-1", description: "September ride", startTime: new Date(2026, 8, 15).getTime(), endTime: new Date(2026, 8, 15, 2).getTime() }) },
      { id: "oct", ...createMockActivity({ deletedAt: null, id: "oct", userId: "athlete-1", description: "October ride", startTime: new Date(2026, 9, 15).getTime(), endTime: new Date(2026, 9, 15, 2).getTime() }) },
    ]);
    renderWithProviders(<AthletePage />, {authenticated: true, user: {uid: "athlete-1"}});
    await screen.findByRole("button", { name: "Select September" });
    fireEvent.click(screen.getByRole("button", { name: "Select September" }));
    await waitFor(() => expect(screen.getAllByTestId("H1-2-1")).toHaveLength(1));
    expect(screen.getByRole("link", { name: "September ride" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "October ride" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전체 최근 활동으로 돌아가기" }));
    await waitFor(() => expect(screen.getAllByTestId("H1-2-1")).toHaveLength(2));
  });

  it("finds older sport and source matches beyond the first activity page", async () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({ id: `bike-${index}`, ...createMockActivity({ deletedAt: null, id: `bike-${index}`, userId: "athlete-1", type: "Ride", source: "orider", startTime: new Date(2026, 8, index + 1).getTime(), endTime: new Date(2026, 8, index + 1, 2).getTime() }) }));
    rows.push({ id: "older-run", ...createMockActivity({ deletedAt: null, id: "older-run", userId: "athlete-1", type: "Run", source: "strava", description: "Older run", startTime: new Date(2026, 7, 1).getTime(), endTime: new Date(2026, 7, 1, 2).getTime() }) });
    setCollectionDocs("activities", rows);
    renderWithProviders(<AthletePage />);
    await screen.findByLabelText("종목");
    fireEvent.click(await screen.findByRole("button", { name: "통계 불러오기" }));
    await waitFor(() => expect(screen.queryByRole("button", {name: "통계 불러오기"})).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("종목"), { target: { value: "run" } });
    expect(await screen.findByRole("link", { name: "Older run" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("종목"), { target: { value: "all" } });
    fireEvent.click(within(screen.getByTestId("P0-2-1")).getByRole("button", { name: "Strava" }));
    await waitFor(() => expect(screen.getAllByTestId("H1-2-1")).toHaveLength(1));
    expect(screen.getByRole("link", { name: "Older run" })).toBeInTheDocument();
  });

  it("clears source and search draft when moving from another athlete to the own profile", async () => {
    setDocData("users_public/current-user", createMockProfile({ nickname: "Current rider" }));
    setCollectionDocs("activities", [{ id: "mine", ...createMockActivity({ deletedAt: null, id: "mine", userId: "current-user", source: "orider", description: "My recorded ride" }) }]);
    const view = renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "current-user" } });
    fireEvent.change(await screen.findByLabelText("검색"), { target: { value: "old draft" } });
    fireEvent.click(within(screen.getByTestId("P0-2-1")).getByRole("button", { name: "Strava" }));
    view.rerender(<AthletePage meUserId="current-user" />);
    expect(await screen.findByRole("link", { name: "My recorded ride" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("old draft")).not.toBeInTheDocument();
  });

  beforeEach(() => {
    const profile = createMockProfile({ nickname: "한강 라이더" });
    setDocData("users/athlete-1", { ...profile });
    setDocData("users_public/athlete-1", { profilePublic: true, ...profile });
  });

  it("shows profile nickname", async () => {
    renderWithProviders(<AthletePage />);
    await waitFor(() => {
      expect(screen.getByText("한강 라이더")).toBeInTheDocument();
    });
  });

  it("shows avatar for the athlete", async () => {
    const profile = createMockProfile({ nickname: "라이더", photoURL: "https://example.com/p.jpg" });
    setDocData("users/athlete-1", { ...profile });
    setDocData("users_public/athlete-1", { profilePublic: true, ...profile });
    renderWithProviders(<AthletePage />);
    await waitFor(() => {
      expect(screen.getByText("라이더")).toBeInTheDocument();
    });
  });

  it("shows activities for the athlete", async () => {
    setCollectionDocs("activities", [
      { id: "a1", ...createMockActivity({ deletedAt: null, userId: "athlete-1", description: "아침 라이딩" }) },
    ]);
    renderWithProviders(<AthletePage />);
    await waitFor(() => {
      const content = document.body.textContent ?? "";
      expect(content.includes("한강 라이더") || content.includes("활동")).toBeTruthy();
    });
  });

  it("requests the athlete activity list ordered by ride time", async () => {
    // 목록 순서는 업로드 시각(createdAt)이 아니라 실제 운동 시각 기준이어야 카드에 찍힌
    // 날짜와 순서가 맞는다. 더보기(startAfter)도 같은 정렬키를 전제로 한다.
    // (같은 페이지의 세그먼트 목록은 createdAt 정렬이라 여기서 단정하지 않는다.)
    vi.mocked(loadActivityDiscovery).mockClear();
    setCollectionDocs("activities", [
      { id: "a1", ...createMockActivity({ deletedAt: null, userId: "athlete-1" }) },
    ]);

    renderWithProviders(<AthletePage />);

    await waitFor(() => expect(loadActivityDiscovery).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({scope:"athlete",targetUid:"athlete-1",limit:20})));
  });

  it("uses public activity aggregates for other athletes instead of private profile totals", async () => {
    const profile = createMockProfile({
      nickname: "한강 라이더",
      stats: {
        activityCount: 3745,
        totalDistance: 180_987_647,
        totalRidingTime: 30_911_553_000,
        totalElevationGain: 2_101_586,
      },
    });
    setDocData("users_public/athlete-1", { profilePublic: true, ...profile });
    setCollectionDocs("activities", [
      {
        id: "public-1",
        ...createMockActivity({ deletedAt: null,
          id: "public-1", startTime: Date.UTC(2026, 8, 1, 10), endTime: Date.UTC(2026, 8, 1, 12),
          userId: "athlete-1",
          visibility: "everyone",
          summary: { distance: 10_000, ridingTimeMillis: 1_000_000, elevationGain: 100 },
        }),
      },
      {
        id: "public-2",
        ...createMockActivity({ deletedAt: null,
          id: "public-2", startTime: Date.UTC(2026, 8, 2, 10), endTime: Date.UTC(2026, 8, 2, 12),
          userId: "athlete-1",
          visibility: "everyone",
          summary: { distance: 20_000, ridingTimeMillis: 2_000_000, elevationGain: 200 },
        }),
      },
      {
        id: "public-3",
        ...createMockActivity({ deletedAt: null,
          id: "public-3", startTime: Date.UTC(2026, 8, 3, 10), endTime: Date.UTC(2026, 8, 3, 12),
          userId: "athlete-1",
          visibility: "everyone",
          summary: { distance: 30_000, ridingTimeMillis: 3_000_000, elevationGain: 300 },
        }),
      },
    ]);

    renderWithProviders(<AthletePage />, {
      authenticated: true,
      user: { uid: "current-user" },
    });

    await waitFor(() => {
      expect(screen.getByText("공개 활동")).toBeInTheDocument();
      expect(screen.getByText("3회")).toBeInTheDocument();
    });
    expect(screen.queryByText("3745회")).not.toBeInTheDocument();
  });

  it("uses the authorized owner DTO display duration instead of chart or legacy profile totals", async () => {
    setCallableResult("ensureAthleteProfile", { data: totalsFixture({ count: 2, distance: 30000, timeDisplayMillis: 5400000, elevation: 300 }) });
    const profile = createMockProfile({
      nickname: "한강 라이더",
      stats: {
        activityCount: 999,
        totalDistance: 999_000_000,
        totalRidingTime: 100 * 60 * 60 * 1000,
        totalElevationGain: 999_000,
      },
    });
    setDocData("users_public/athlete-1", { profilePublic: true, ...profile });
    setCollectionDocs("activities", [
      {
        id: "own-1",
        ...createMockActivity({ deletedAt: null,
          id: "own-1", startTime: Date.UTC(2026, 8, 4, 10), endTime: Date.UTC(2026, 8, 4, 12),
          userId: "athlete-1",
          visibility: "private",
          summary: createMockSummary({
            distance: 10_000,
            ridingTimeMillis: 2 * 60 * 60 * 1000,
            movingTimeSec: 60 * 60,
            pauseTimeSec: 60 * 60,
            elevationGain: 100,
          }),
        }),
      },
      {
        id: "own-2",
        ...createMockActivity({ deletedAt: null,
          id: "own-2", startTime: Date.UTC(2026, 8, 5, 10), endTime: Date.UTC(2026, 8, 5, 12),
          userId: "athlete-1",
          visibility: "everyone",
          summary: createMockSummary({
            distance: 20_000,
            ridingTimeMillis: 30 * 60 * 1000,
            elevationGain: 200,
          }),
        }),
      },
    ]);

    renderWithProviders(<AthletePage />, {
      authenticated: true,
      user: { uid: "athlete-1", displayName: "한강 라이더" },
    });

    await waitFor(() => {
      expect(screen.getByText("2회")).toBeInTheDocument();
      expect(screen.getByText("1시간").parentElement).toHaveTextContent("1시간 30분");
    });
    expect(screen.queryByText("999회")).not.toBeInTheDocument();
    expect(screen.queryByText("100h 0m")).not.toBeInTheDocument();
  });

  it("keeps known total hours when legacy activities have no duration", async () => {
    setCollectionDocs("activities", [
      { id: "legacy", ...createMockActivity({ deletedAt: null, userId: "athlete-1", summary: { distance: 1000, elevationGain: 10 } as never }) },
      { id: "timed", ...createMockActivity({ deletedAt: null, userId: "athlete-1", summary: createMockSummary({ ridingTimeMillis: 3600000 }) }) },
    ]);
    renderWithProviders(<AthletePage />);
    await waitFor(() => expect(screen.getAllByText("1h 0m").length).toBeGreaterThan(0));
    expect(screen.queryByText("NaNm")).not.toBeInTheDocument();
  });

  it("shows friend action button for other users", async () => {
    renderWithProviders(<AthletePage />, {
      authenticated: true,
      user: { uid: "current-user" },
    });
    await waitFor(() => {
      const content = document.body.textContent ?? "";
      expect(
        content.includes("친구") ||
        content.includes("요청") ||
        content.includes("추가"),
      ).toBeTruthy();
    });
  });

  it("treats profiles without a visibility setting as public", async () => {
    const profile = createMockProfile({ nickname: "미설정 라이더" });
    delete (profile as { profilePublic?: boolean }).profilePublic;
    setDocData("users_public/athlete-1", { ...profile });

    renderWithProviders(<AthletePage />, {
      authenticated: true,
      user: { uid: "current-user" },
    });

    // 스트라바처럼 프로필 기본 공개 — 미설정 사용자는 비공개 카드가 아니라 프로필을 보여 준다
    expect(await screen.findByTestId("P0-0-1")).toHaveTextContent("미설정 라이더");
    expect(screen.queryByText("비공개 프로필입니다")).not.toBeInTheDocument();
  });

  it("restricts private profiles for non-friends", async () => {
    const profile = createMockProfile({ nickname: "비공개 라이더", profilePublic: false });
    setDocData("users_public/athlete-1", { profilePublic: true, ...profile });
    setCollectionDocs("friends/athlete-1/users", [
      { id: "friend-1", userId: "friend-1", nickname: "숨김 친구", profileImage: null },
    ]);

    renderWithProviders(<AthletePage />, {
      authenticated: true,
      user: { uid: "current-user" },
    });

    await waitFor(() => {
      expect(screen.getByText("비공개 프로필입니다")).toBeInTheDocument();
    });
    expect(screen.queryByText("숨김 친구")).not.toBeInTheDocument();
    // 사진·닉네임은 기본 공개 — 비공개 카드에도 누구인지 보인다
    expect(screen.getByTestId("P0.private-identity")).toHaveTextContent("비공개 라이더");
    expect(screen.queryByText(/친구 \(/)).not.toBeInTheDocument();
  });

  it("hides the friend request button when requests are disabled", async () => {
    const profile = createMockProfile({
      nickname: "요청 차단 라이더",
      friendRequestsAllowed: false,
    });
    setDocData("users_public/athlete-1", { profilePublic: true, ...profile });

    renderWithProviders(<AthletePage />, {
      authenticated: true,
      user: { uid: "current-user" },
    });

    await waitFor(() => {
      expect(screen.getByText("요청 차단 라이더")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "친구 요청" })).not.toBeInTheDocument();
  });

  it("does not show friend action for own profile", async () => {
    renderWithProviders(<AthletePage />, {
      authenticated: true,
      user: { uid: "athlete-1", displayName: "한강 라이더" },
    });
    await waitFor(() => {
      expect(screen.getByText("한강 라이더")).toBeInTheDocument();
    });
  });
});

it("retains distinct native references in the profile cover despite empty URL fields", async () => {
  const { activityFeedSourceRevision } = await import("../services/activityFeedContent");
  const activity = createMockActivity({ deletedAt: null,id:"native-photo-ride",userId:"athlete-1",source:"orider"});
  setCollectionDocs("activities", [{...activity,feedContentV1:{version:1,revision:"photo-rev",sourceRevision:activityFeedSourceRevision(activity),memo:null,totalPhotoCount:2,comments:[],photos:[
    {id:"one",url:"",caption:null,nativePhoto:{activityId:activity.id,photoId:"one"}},
    {id:"two",url:"",caption:null,nativePhoto:{activityId:activity.id,photoId:"two"}},
  ]}}]);
  setCallableImplementation("getAthleteProfilePreview", (request) => ({ data: { items: (request as {kind:string}).kind === "photos" ? [
    {id:"one",url:"",caption:null,activityId:activity.id,nativePhoto:{activityId:activity.id,photoId:"one"}},
    {id:"two",url:"",caption:null,activityId:activity.id,nativePhoto:{activityId:activity.id,photoId:"two"}},
  ] : [], scope: "recent", complete: true, nextCursor: null } }));
  const view = renderWithProviders(<AthletePage />, {authenticated:true,user:{uid:"athlete-1"}});
  await waitFor(() => expect(view.container.querySelectorAll(".athlete-cover .athlete-photo-trigger")).toHaveLength(2));
});
it('distinguishes bounded public inventory exhaustion from a retryable network failure',async()=>{
 setDocData('users_public/athlete-1',{nickname:'Public test rider',profilePublic:true});
 const original=vi.mocked(loadActivityDiscovery).getMockImplementation()!;let pages=0;
 vi.mocked(loadActivityDiscovery).mockImplementation(async(services,request)=>request.order==='id_asc'?{items:[],nextCursor:'ad1.'+(++pages),exhausted:false,expiresAt:Date.now()+600000} as never:original(services,request));
 try{renderWithProviders(<AthletePage/>);for(let index=0;index<9;index++){fireEvent.click(await screen.findByRole('button',{name:'통계 불러오기'}));}await screen.findAllByText(/전체 통계를 불러올 수 없습니다/);expect(pages).toBe(10);expect(screen.queryByRole('button',{name:'다시 시도',exact:true})).not.toBeInTheDocument();}
 finally{vi.mocked(loadActivityDiscovery).mockImplementation(original);}
});

it("never estimates public training load from observed duration", async()=>{
 setDocData("users_public/athlete-1",{nickname:"Public rider",profilePublic:true});
 setCollectionDocs("activities",[{...createMockActivity({ deletedAt: null,id:"public-duration",userId:"athlete-1",startTime:Date.now()-86400000,summary:createMockSummary({ridingTimeMillis:3600000,tss:null,relativeEffort:null})})}]);
 renderWithProviders(<AthletePage/>);await waitFor(()=>expect(screen.getByTestId("weekly-chart")).toHaveAttribute("data-known-load","no"));
});

it("keeps owner initial reads independent of lifetime history and never opens gear automatically", async () => {
  const current = new Date().getFullYear();
  setCallableResult("ensureAthleteProfile", { data: totalsFixture({ count: 999 }) });
  setCollectionDocs("activities", [
    ...Array.from({ length: 1000 }, (_, i) => ({ ...createMockActivity({ deletedAt: null, id: `old-${i}`, userId: "athlete-1", startTime: Date.UTC(2020, 0, 1) + i * 60000, endTime: Date.UTC(2020, 0, 1) + i * 60000 + 3600000 }) })),
    ...Array.from({ length: 3 }, (_, i) => ({ ...createMockActivity({ deletedAt: null, id: `current-${i}`, userId: "athlete-1", startTime: Date.UTC(current, 5, i + 1), endTime: Date.UTC(current, 5, i + 1, 1) }) })),
  ]);
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" } });
  await screen.findByText("999회");
  await screen.findByLabelText("연도");
  expect(activityQueries.documents).toBeLessThan(50);
  expect(activityQueries.requests.some(q => q.some(c => c.type === "limit" && c.args[0] === 50))).toBe(false);
  expect(mockCallableInvocations.filter(call => call.name === "getAthleteProfilePreview")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "장비 기록 전체 검사" })).toBeEnabled();
});
it("keeps healthy photos independent of pending numeric totals and a failed highlight page, then appends explicit More", async () => {
  setCallableResult("ensureAthleteProfile", { data: totalsFixture({ state: "pending" }) });
  let highlights = 0, photos = 0;
  setCallableImplementation("getAthleteProfilePreview", (request) => {
    const input = request as { kind: string; cursor?: unknown };
    if (input.kind === "highlights") { highlights++; throw new Error("canonical-pending"); }
    photos++;
    return { data: { items: [{ id: `photo-${photos}`, activityId: `ride-${photos}`, url: `https://images.test/${photos}.jpg`, caption: `Photo ${photos}` }], scope: "recent", complete: photos === 2, nextCursor: photos === 1 ? { epoch: "profile-epoch", order: "recent", startTime: 100, id: "legacy:한글.기록" } : null } };
  });
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" } });
  await screen.findAllByAltText("Photo 1");
  expect(screen.queryByText("5회")).not.toBeInTheDocument();
  expect(photos).toBe(1); expect(highlights).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "사진 활동 6개 더 검사" }));
  await screen.findAllByAltText("Photo 2");
  expect(screen.getAllByAltText("Photo 1").length).toBeGreaterThan(0);
  expect(photos).toBe(2); expect(highlights).toBe(1);
  fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "다시 시도" }));
  await waitFor(() => expect(highlights).toBe(2));
  expect(photos).toBe(2);
});
it("inspects sparse dated media and explicitly includes undated raw records without mixing cursors", async () => {
  setCallableImplementation("getAthleteProfilePreview", (request) => {
    const input = request as { kind: string; all?: boolean; cursor?: { id: string } };
    if (input.kind === "highlights") return { data: { items: [], scope: input.all ? "all" : "recent", complete: true, nextCursor: null } };
    if (!input.all) return { data: { items: [], scope: "recent", complete: false, nextCursor: { epoch: "profile-epoch", order: "recent", startTime: 100, id: "dated:한글.1" } } };
    return { data: { items: input.cursor ? [{ id: "p", activityId: "undated:한글.2", url: "https://images.test/undated.jpg", caption: "Undated photo" }] : [], scope: "all", complete: !!input.cursor, nextCursor: input.cursor ? null : { epoch: "profile-epoch", order: "all", startTime: null, id: "legacy:한글.1" } } };
  });
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" } });
  await screen.findByRole("button", { name: "사진 활동 6개 더 검사" });
  expect(mockCallableInvocations.filter(call => call.name === "getAthleteProfilePreview")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "전체 원본에서 사진 검사" }));
  await waitFor(() => expect(mockCallableInvocations.filter(call => call.name === "getAthleteProfilePreview")).toHaveLength(3));
  await waitFor(() => expect(screen.getByRole("button", { name: "사진 활동 6개 더 검사" })).toBeEnabled());
  expect(screen.queryByText("전체 원본 활동 검사가 완료되었습니다.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "사진 활동 6개 더 검사" }));
  await screen.findAllByAltText("Undated photo");
  const calls = mockCallableInvocations.filter(call => call.name === "getAthleteProfilePreview");
  expect(calls[2]!.data).toEqual({ kind: "photos", all: true });
  expect(calls[3]!.data).toEqual({ kind: "photos", all: true, cursor: { epoch: "profile-epoch", order: "all", startTime: null, id: "legacy:한글.1" } });
});
it("updates pending numeric totals from the existing profile listener without repeating media or ensure calls", async () => {
  const pending = totalsFixture({ state: "pending" });
  setCallableResult("ensureAthleteProfile", { data: pending });
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" }, profile: { athleteProfile: pending } });
  await waitFor(() => expect(mockCallableInvocations.filter(call => call.name === "getAthleteProfilePreview")).toHaveLength(2));
  expect(screen.queryByText("5회")).not.toBeInTheDocument();
  setDocData("users/athlete-1", { ...createMockProfile(), athleteProfile: totalsFixture({ revision: 2 }) });
  await screen.findByText("5회");
  expect(mockCallableInvocations.filter(call => call.name === "getAthleteProfilePreview")).toHaveLength(2);
  expect(mockCallableInvocations.filter(call => call.name === "ensureAthleteProfile")).toHaveLength(1);
});
it("retains healthy highlights and retries an earlier pending page after raw EOF by replacing that page", async () => {
  let firstAll = 0;
  const highlight = (activityId: string, segmentName: string) => ({ activityId, segmentId: activityId, segmentName, type: "PR", time: "1:00" });
  setCallableImplementation("getAthleteProfilePreview", request => {
    const input = request as { kind: string; all?: boolean; cursor?: unknown };
    if (input.kind === "photos" || !input.all) return { data: { items: [], scope: "recent", complete: true, nextCursor: null } };
    if (input.cursor) return { data: { items: [highlight("late", "Healthy late")], scope: "all", complete: true, nextCursor: null } };
    firstAll++;
    return { data: { items: [highlight("early", "Healthy early"), ...(firstAll > 1 ? [highlight("recovered", "Recovered pending")] : [])], scope: "all", complete: false, nextCursor: { epoch: "profile-epoch", order: "all", id: "legacy:한글.1", startTime: null }, pendingCount: firstAll === 1 ? 1 : 0, coverageComplete: firstAll > 1, retryCursor: null } };
  });
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" } });
  await waitFor(() => expect(mockCallableInvocations.filter(call => call.name === "getAthleteProfilePreview")).toHaveLength(2));
  fireEvent.click(screen.getByRole("button", { name: "전체 원본에서 하이라이트 검사" }));
  await screen.findByRole("link", { name: /Healthy early/ });
  fireEvent.click(screen.getByRole("button", { name: "하이라이트 활동 12개 더 검사" }));
  await screen.findByRole("link", { name: /Healthy late/ });
  expect(screen.queryByText("전체 원본 활동 검사가 완료되었습니다.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  await screen.findByRole("link", { name: /Recovered pending/ });
  expect(screen.getAllByRole("link", { name: /Healthy early/ })).toHaveLength(1);
  expect(screen.getByRole("link", { name: /Healthy late/ })).toBeVisible();
  expect(screen.getByText("전체 원본 활동 검사가 완료되었습니다.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "하이라이트 활동 12개 더 검사" })).not.toBeInTheDocument();
});
it("requires explicit complete gear inspection, chooses minimum remaining after per-name maxima, and caches through year changes", async () => {
  setCollectionDocs("activities", Array.from({ length: 51 }, (_, index) => createMockActivity({ deletedAt: null, id: `gear-${String(index).padStart(3, "0")}`, userId: "athlete-1", startTime: Date.UTC(2020, 0, index + 1), endTime: Date.UTC(2020, 0, index + 1, 1), gear: { name: index === 50 ? "tire" : "chain", totalDistanceKm: index === 50 ? 99 : 1, maxDistanceKm: 100 } })));
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" } });
  const first = await screen.findByRole("button", { name: "장비 기록 50개 검사" });
  expect(activityQueries.requests.filter(q => q.some(c => c.type === "limit" && c.args[0] === 50))).toHaveLength(0);
  fireEvent.click(first);
  await screen.findByText(/원본 활동 50개 검사 중/);
  expect(within(screen.getByTestId("P0-6")).queryByText(/chain/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "장비 기록 50개 검사" }));
  await screen.findByText("원본 활동 51개 검사 완료");
  expect(within(screen.getByTestId("P0-6")).getByText(/tire/)).toHaveTextContent("1");
  const years = await screen.findByLabelText("연도");
  fireEvent.change(years, { target: { value: "2020" } });
  await waitFor(() => expect(screen.getByLabelText("연도")).toHaveValue("2020"));
  expect(activityQueries.requests.filter(q => q.some(c => c.type === "limit" && c.args[0] === 50))).toHaveLength(2);
});
it("discards a delayed previous same-UID SDK session photo response", async () => {
  let release!: (value: unknown) => void; let photos = 0;
  setCallableImplementation("getAthleteProfilePreview", request => {
    const input = request as { kind: string };
    if (input.kind !== "photos") return { data: { items: [], scope: "recent", complete: true, nextCursor: null } };
    photos++;
    if (photos === 1) return new Promise(resolve => { release = resolve; });
    return { data: { items: [{ id: "new", activityId: "new", caption: "Current session photo", url: "https://images.test/new.jpg" }], scope: "recent", complete: true, nextCursor: null } };
  });
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" } });
  await waitFor(() => expect(photos).toBe(1));
  await act(async () => simulateLogin({ uid: "athlete-1" }));
  await screen.findAllByAltText("Current session photo");
  await act(async () => release({ data: { items: [{ id: "old", activityId: "old", caption: "Previous session photo", url: "https://images.test/old.jpg" }], scope: "recent", complete: true, nextCursor: null } }));
  expect(screen.queryByAltText("Previous session photo")).not.toBeInTheDocument();
});
it("preserves same-epoch media buffers and does not re-read them during an explicit numeric Continue", async () => {
  setCallableResult("ensureAthleteProfile", { data: totalsFixture({ state: "pending" }) });
  setCallableImplementation("getAthleteProfilePreview", request => ({ data: { items: (request as { kind: string }).kind === "photos" ? [{ id: "steady", activityId: "steady", url: "https://images.test/steady.jpg", caption: "Steady same-epoch photo" }] : [], scope: "recent", complete: true, nextCursor: null } }));
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" } });
  await screen.findAllByAltText("Steady same-epoch photo");
  expect(mockCallableInvocations.filter(call => call.name === "getAthleteProfilePreview")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "누적 기록 계속 확인" }));
  await waitFor(() => expect(mockCallableInvocations.filter(call => call.name === "ensureAthleteProfile")).toHaveLength(2));
  expect(screen.getAllByAltText("Steady same-epoch photo").length).toBeGreaterThan(0);
  expect(mockCallableInvocations.filter(call => call.name === "getAthleteProfilePreview")).toHaveLength(2);
});
it("does not carry an explicit owner Continue authorization into another account", async () => {
  const calls: Array<{ uid: string; retry: boolean }> = [];
  setCallableImplementation("ensureAthleteProfile", request => {
    const uid = auth.currentUser!.uid;
    calls.push({ uid, retry: (request as { retry: boolean }).retry });
    return { data: totalsFixture({ ownerUid: uid, epoch: `${uid}-epoch`, state: "failed" }) };
  });
  const view = renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" } });
  fireEvent.click(await screen.findByRole("button", { name: "누적 기록 계속 확인" }));
  await waitFor(() => expect(calls.some(call => call.uid === "athlete-1" && call.retry)).toBe(true));
  setDocData("users_public/owner-B", { ...createMockProfile(), nickname: "Owner B" });
  setDocData("users/owner-B", { ...createMockProfile(), nickname: "Owner B" });
  await act(async () => { simulateLogin({ uid: "owner-B" }); view.rerender(<AthletePage meUserId="owner-B" />); });
  await waitFor(() => expect(calls.some(call => call.uid === "owner-B")).toBe(true));
  expect(calls.filter(call => call.uid === "owner-B").every(call => call.retry === false)).toBe(true);
});
it("does not auto-continue a new integrity epoch after an earlier manual Continue", async () => {
  let epoch = "old-epoch";
  const retries: boolean[] = [];
  setCallableImplementation("ensureAthleteProfile", request => {
    retries.push((request as { retry: boolean }).retry);
    return { data: totalsFixture({ epoch, state: "failed", ...(epoch === "new-epoch" ? { integrityFailed: true } : {}) }) };
  });
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" } });
  fireEvent.click(await screen.findByRole("button", { name: "누적 기록 계속 확인" }));
  await waitFor(() => expect(retries).toEqual([false, true]));
  epoch = "new-epoch";
  setDocData("users/athlete-1", { ...createMockProfile(), athleteProfile: totalsFixture({ epoch, state: "failed", integrityFailed: true }) });
  await screen.findByRole("button", { name: "누적 기록 다시 검사" });
  expect(retries).toEqual([false, true, false]);
});
it("keeps a failed numeric job visible despite higher live pending revisions in the same epoch", async () => {
  setCallableResult("ensureAthleteProfile", { data: totalsFixture({ state: "failed", revision: 1 }) });
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" }, profile: { athleteProfile: totalsFixture({ state: "pending", revision: 2 }) } });
  await screen.findByText("누적 기록 확인이 중단되었습니다.");
  setDocData("users/athlete-1", { ...createMockProfile(), athleteProfile: totalsFixture({ state: "pending", revision: 10 }) });
  await waitFor(() => expect(screen.getByText("누적 기록 확인이 중단되었습니다.")).toBeVisible());
  expect(screen.queryByText("5회")).not.toBeInTheDocument();
  expect(mockCallableInvocations.filter(call => call.name === "ensureAthleteProfile")).toHaveLength(1);
});
it("keeps owner sport filters on loaded pages with explicit More even when an older match is already in chart metadata", async () => {
  setCollectionDocs("activities", [
    ...Array.from({ length: 20 }, (_, i) => createMockActivity({ deletedAt: null, id: `bike-${i}`, userId: "athlete-1", type: "Ride", startTime: Date.now() - i * 86400000, endTime: Date.now() - i * 86400000 + 3600000 })),
    createMockActivity({ deletedAt: null, id: "old-filter-run", userId: "athlete-1", type: "Run", description: "Older loaded-page run", startTime: Date.UTC(2020, 0, 1), endTime: Date.UTC(2020, 0, 1, 1) }),
  ]);
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" }, route: "/ko/athlete/me/activities" });
  fireEvent.change(await screen.findByLabelText("종목"), { target: { value: "run" } });
  expect(screen.queryByRole("link", { name: "Older loaded-page run" })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "더 보기", exact: true }));
  await screen.findByRole("link", { name: "Older loaded-page run" });
});
it("offers an honest retry after a failed initial owner feed page without re-reading media", async () => {
  setCollectionDocs("activities", [createMockActivity({ deletedAt: null, id: "recovery", userId: "athlete-1", description: "Recovered owner page" })]);
  const original = vi.mocked(getDocs).getMockImplementation()!;
  let attempts = 0;
  vi.mocked(getDocs).mockImplementation((async (q: { constraints?: Array<{type:string;args:unknown[]}> }) => {
    if (q.constraints?.some(c => c.type === "limit" && c.args[0] === 20) && ++attempts === 1) throw new Error("offline");
    return original(q as never);
  }) as never);
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" } });
  await screen.findByText("활동 목록을 불러오지 못했습니다. 전체 결과가 아니며 같은 위치에서 다시 시도할 수 있습니다.");
  fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "다시 시도" }));
  await screen.findByRole("link", { name: "Recovered owner page" });
  expect(attempts).toBe(2);
  expect(mockCallableInvocations.filter(call => call.name === "getAthleteProfilePreview")).toHaveLength(2);
});
it("does not reload loaded pages, friends or segments when numeric profile revisions advance", async () => {
  setCallableResult("ensureAthleteProfile", { data: totalsFixture({ state: "pending", count: 24 }) });
  setCollectionDocs("activities", Array.from({ length: 24 }, (_, i) => createMockActivity({ deletedAt: null, id: `stable-${i}`, userId: "athlete-1", startTime: Date.UTC(2020, 0, i + 1), endTime: Date.UTC(2020, 0, i + 1, 1), description: `Stable ride ${i}`, keywords: ["stable"] })));
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" }, route: "/ko/athlete/me/activities" });
  await screen.findByLabelText("연도");
  fireEvent.click(await screen.findByRole("button", { name: "더 보기", exact: true }));
  await waitFor(() => expect(screen.getAllByTestId("H1-2-1")).toHaveLength(24));
  const scopedCalls = () => mockCallableInvocations.filter(call => ["ensureAthleteProfile", "getAthleteProfilePreview", "getPublicSegmentMetadata"].includes(call.name)).map(call => JSON.stringify(call));
  const reads = vi.mocked(getDocs).mock.calls.length, functions = scopedCalls();
  await act(async () => setDocData("users/athlete-1", { ...createMockProfile(), athleteProfile: totalsFixture({ state: "ready", revision: 2, count: 24 }) }));
  await screen.findByText("24회");
  expect(screen.getAllByTestId("H1-2-1")).toHaveLength(24);
  expect(vi.mocked(getDocs).mock.calls).toHaveLength(reads);
  expect(scopedCalls()).toEqual(functions);
  await act(async () => setDocData("users/athlete-1", { ...createMockProfile(), athleteProfile: totalsFixture({ state: "ready", revision: 3, count: 24 }) }));
  expect(vi.mocked(getDocs).mock.calls).toHaveLength(reads);
  expect(scopedCalls()).toEqual(functions);
});
it("keeps an active public search stable when the viewer's own numeric profile updates", async () => {
  setDocData("users_public/athlete-1", { ...createMockProfile(), profilePublic: true });
  setCollectionDocs("activities", [createMockActivity({ deletedAt: null, id: "public-stable", userId: "athlete-1", description: "Stable public search", keywords: ["stable"] })]);
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "viewer" } });
  const input = await screen.findByPlaceholderText("활동 검색... (Enter)");
  fireEvent.change(input, { target: { value: "stable" } }); fireEvent.keyDown(input, { key: "Enter" });
  await screen.findByRole("link", { name: "Stable public search" });
  const calls = vi.mocked(loadActivityDiscovery).mock.calls.length;
  await act(async () => setDocData("users/viewer", { ...createMockProfile(), athleteProfile: totalsFixture({ ownerUid: "viewer", revision: 2 }) }));
  expect(vi.mocked(loadActivityDiscovery).mock.calls).toHaveLength(calls);
});
it("mounts only six buffered native photos initially and reveals cached items before requesting another raw page, including at EOF", async () => {
  setCallableResult("ensureAthleteProfile", { data: totalsFixture({ state: "pending" }) });
  let photoRequests = 0;
  setCallableImplementation("getAthleteProfilePreview", request => {
    if ((request as { kind: string }).kind !== "photos") return { data: { items: [], scope: "recent", complete: true, nextCursor: null } };
    const offset = photoRequests++ * 30;
    return { data: { items: Array.from({ length: 30 }, (_, index) => {
      const id = `buffered-${offset + index}`, activityId = `buffered-ride-${Math.floor((offset + index) / 5)}`;
      return { id, activityId, url: "", caption: id, nativePhoto: { activityId, photoId: id } };
    }), scope: "recent", complete: photoRequests === 2, nextCursor: photoRequests === 1 ? { epoch: "profile-epoch", order: "recent", startTime: 100, id: "legacy:한글.1" } : null } };
  });
  const view = renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" } });
  const mounted = () => view.container.querySelectorAll(".athlete-photo-strip [data-photo-state]").length;
  await waitFor(() => expect(mounted()).toBe(6));
  expect(photoRequests).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "사진 6개 더 보기" }));
  await waitFor(() => expect(mounted()).toBe(12));
  fireEvent.click(screen.getByRole("button", { name: "누적 기록 계속 확인" }));
  await waitFor(() => expect(mockCallableInvocations.filter(call => call.name === "ensureAthleteProfile")).toHaveLength(2));
  expect(mounted()).toBe(12); expect(photoRequests).toBe(1);
  await act(async () => setDocData("users/athlete-1", { ...createMockProfile(), athleteProfile: totalsFixture({ revision: 2 }) }));
  await screen.findByText("5회");
  expect(mounted()).toBe(12); expect(photoRequests).toBe(1);
  for (const count of [18, 24, 30]) {
    if (count === 30) act(() => {
      const more = screen.getByRole("button", { name: "사진 6개 더 보기" });
      fireEvent.click(more); fireEvent.click(more); fireEvent.click(more);
    });
    else fireEvent.click(screen.getByRole("button", { name: "사진 6개 더 보기" }));
    await waitFor(() => expect(mounted()).toBe(count));
    expect(photoRequests).toBe(1);
  }
  fireEvent.click(screen.getByRole("button", { name: "사진 활동 6개 더 검사" }));
  await waitFor(() => expect(mounted()).toBe(36));
  expect(photoRequests).toBe(2);
  for (const count of [42, 48, 54, 60]) {
    fireEvent.click(screen.getByRole("button", { name: "사진 6개 더 보기" }));
    await waitFor(() => expect(mounted()).toBe(count));
    expect(photoRequests).toBe(2);
  }
  expect(screen.queryByRole("button", { name: "사진 6개 더 보기" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "사진 활동 6개 더 검사" })).not.toBeInTheDocument();
});
it("shows twelve of thirty-six cached highlights and keeps all of them reachable after raw EOF without another RPC", async () => {
  let highlightRequests = 0;
  setCallableImplementation("getAthleteProfilePreview", request => {
    const kind = (request as { kind: string }).kind;
    if (kind === "highlights") highlightRequests++;
    return { data: { items: kind === "highlights" ? Array.from({ length: 36 }, (_, index) => ({ activityId: `ride-${Math.floor(index / 3)}`, segmentId: `segment-${index}`, segmentName: `Buffered highlight ${index}`, type: "PR", time: "1:00" })) : [], scope: "recent", complete: true, nextCursor: null } };
  });
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" } });
  await waitFor(() => expect(screen.getAllByRole("link", { name: /Buffered highlight/ })).toHaveLength(12));
  for (const count of [24, 36]) {
    fireEvent.click(screen.getByRole("button", { name: "하이라이트 12개 더 보기" }));
    expect(screen.getAllByRole("link", { name: /Buffered highlight/ })).toHaveLength(count);
    expect(highlightRequests).toBe(1);
  }
  expect(screen.getByRole("link", { name: /Buffered highlight 35/ })).toBeVisible();
  expect(screen.queryByRole("button", { name: "하이라이트 12개 더 보기" })).not.toBeInTheDocument();
});
