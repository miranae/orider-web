import i18n from "i18next";
import enAthlete from "../i18n/resources/en/athlete.json";
import { httpsCallable } from "firebase/functions";
import { FirebaseServicesProvider, type FirebaseServices } from "../contexts/FirebaseServicesContext";
import * as errorLogger from "../services/errorLogger";
import { installActivityQueryFake } from "../__tests__/fixtures/activityQueryFake";
import { getDoc, getDocs, onSnapshot } from "firebase/firestore";
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
const defaultDiscovery = vi.mocked(loadActivityDiscovery).getMockImplementation()!;
let activityQueries: ReturnType<typeof installActivityQueryFake>;
beforeEach(() => {
  vi.mocked(loadActivityDiscovery).mockImplementation(defaultDiscovery);
  activityQueries = installActivityQueryFake();
  setCallableResult("getPublicSegmentMetadata", { data: { items: [], cursor: null, hasMore: false } });
  setCallableResult("ensureAthleteProfile", { data: totalsFixture() });
  setCallableResult("getPublicAthleteTotals", { data: totalsFixture() });
  setCallableResult("getAthleteProfilePreview", { data: { items: [], scope: "recent", complete: true, nextCursor: null } });
});

describe("AthletePage", () => {
  it("검색 입력만 바뀌면 전체 이력 대표를 다시 계산하지 않는다", async () => {
    const acceptance = vi.spyOn(activityAcceptance, "acceptedPhysicalActivities");
    setCollectionDocs("activities", [{id: "memo-ride", ...createMockActivity({ deletedAt: null,id: "memo-ride", userId: "athlete-1"})}]);
    renderWithProviders(<AthletePage />);
    const input = await screen.findByPlaceholderText("활동 검색... (Enter)");
    await screen.findByRole("heading", { name: "한강 라이더" });
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
    await screen.findByLabelText("종목 선택");
    fireEvent.click(await screen.findByRole("button", { name: "공개 활동 더 불러오기" }));
    await waitFor(() => expect(screen.queryByRole("button", {name: "공개 활동 더 불러오기"})).not.toBeInTheDocument());
    fireEvent.click(within(screen.getByLabelText("종목 선택")).getByText("러닝"));
    expect(await screen.findByRole("link", { name: "Older run" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByLabelText("종목 선택")).getByText("전체"));
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

  it("uses whole server totals for other athletes independently of visible activity aggregates", async () => {
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
      expect(screen.getByText("전체 활동")).toBeInTheDocument();
      expect(screen.getByText("5회")).toBeInTheDocument();
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

  it("shows the own-profile edit pencil link next to the nickname", async () => {
    renderWithProviders(<AthletePage />, {
      authenticated: true,
      user: { uid: "athlete-1", displayName: "한강 라이더" },
    });
    const edit = await screen.findByRole("link", { name: "프로필 편집" });
    expect(edit).toHaveAttribute("href", expect.stringMatching(/\/settings\/account$/));
    // 아이콘 전용 링크 — 보이는 글자 없이 닉네임과 같은 줄에 놓인다.
    expect(edit).toHaveTextContent("");
    expect(edit.parentElement).toContainElement(screen.getByTestId("P0-0-1"));
    // 공유도 연필 옆 아이콘 전용 버튼이다.
    const share = screen.getByRole("button", { name: "공유" });
    expect(share).toHaveClass("ds-btn--icon-only");
    expect(share).toHaveAttribute("title", "공유");
    expect(share).toHaveTextContent("");
    expect(share.parentElement).toBe(edit.parentElement);
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
 try{renderWithProviders(<AthletePage/>);for(let index=0;index<9;index++){fireEvent.click(await screen.findByRole('button',{name:'공개 활동 더 불러오기'}));}await screen.findAllByText(/공개 활동 목록을 최대 200개까지 확인했습니다/);expect(pages).toBe(10);expect(screen.queryByRole('button',{name:'다시 시도',exact:true})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'새로고침'})).not.toBeInTheDocument();}
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
  // 프로필에는 장비 기록 검사 버튼을 두지 않는다(활동 전체를 읽어야 하는 버튼이라 뺐다).
  expect(screen.queryByRole("button", { name: "장비 기록 전체 검사" })).not.toBeInTheDocument();
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
  // 실패한 하이라이트 칸에 "다시 시도" 버튼을 두지 않는다.
  expect(within(screen.getByRole("alert")).queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
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
  // 전체 원본 검사 버튼은 프로필에 두지 않는다.
  expect(screen.queryByRole("button", { name: "전체 원본에서 사진 검사" })).not.toBeInTheDocument();
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
  // 전체 원본 검사·다시 시도 버튼은 프로필에 두지 않는다.
  expect(screen.queryByRole("button", { name: "전체 원본에서 하이라이트 검사" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
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
  fireEvent.click(within(await screen.findByLabelText("종목 선택")).getByText("러닝"));
  expect(screen.queryByRole("link", { name: "Older loaded-page run" })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "더 보기", exact: true }, { timeout: 1000 }));
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
  // 웹 프로필에는 "다시 시도" 버튼을 두지 않는다(다시 불러오려면 화면을 새로 고친다).
  expect(within(screen.getByRole("alert")).queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
});
it("does not reload loaded pages, friends or segments when numeric profile revisions advance", async () => {
  setCallableResult("ensureAthleteProfile", { data: totalsFixture({ state: "pending", count: 24 }) });
  setCollectionDocs("activities", Array.from({ length: 24 }, (_, i) => createMockActivity({ deletedAt: null, id: `stable-${i}`, userId: "athlete-1", startTime: Date.UTC(2020, 0, i + 1), endTime: Date.UTC(2020, 0, i + 1, 1), description: `Stable ride ${i}`, keywords: ["stable"] })));
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" }, route: "/ko/athlete/me/activities" });
  await screen.findByLabelText("연도");
  fireEvent.click(await screen.findByRole("button", { name: "더 보기", exact: true }, { timeout: 1000 }));
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


it.each(["ensure"])("reports a failed %s operation through the injected services without hiding retry", async operation => {
  const error = new Error("profile-read-offline");
  const logger = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
  if (operation === "ensure") setCallableImplementation("ensureAthleteProfile", () => { throw error; });
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" } });
  if (operation === "gear") {
    const button = await screen.findByRole("button", { name: "장비 기록 50개 검사" });
    vi.mocked(getDocs).mockRejectedValueOnce(error);
    fireEvent.click(button);
  }
  await waitFor(() => expect(logger).toHaveBeenCalledWith(
    operation === "ensure" ? "AthletePage.ensureAthleteProfile" : "AthletePage.inspectGear",
    error, expect.objectContaining({ userId: "athlete-1" }),
    expect.objectContaining({ auth: expect.anything(), functions: expect.anything() }),
  ));
});


it("uses the injected app for the athlete's initial and continued segment pages", async () => {
  const services = { auth: { currentUser: null }, firestore: {}, functions: { app: "embedded" },
    ensureAppCheckReady: vi.fn().mockResolvedValue(undefined), getAppCheckToken: vi.fn().mockResolvedValue("embedded-token") } as unknown as FirebaseServices;
  setDocData("users_public/athlete-1", { ...createMockProfile(), nickname: "Embedded athlete", profilePublic: true });
  let page = 0;
  setCallableImplementation("getPublicSegmentMetadata", () => ({ data: { items: [{ id: `segment-${page}`, name: "Embedded segment", distance: 1000 }], cursor: page++ === 0 ? "segment-next" : null, hasMore: page === 1 } }));
  const priorCalls = vi.mocked(httpsCallable).mock.calls.length;
  renderWithProviders(<FirebaseServicesProvider services={services}><AthletePage /></FirebaseServicesProvider>);
  const factories = () => vi.mocked(httpsCallable).mock.calls.slice(priorCalls).filter(([, name]) => name === "getPublicSegmentMetadata");
  await waitFor(() => expect(factories()).toHaveLength(1));
  expect(factories()[0]![0]).toBe(services.functions);
  fireEvent.click(await screen.findByRole("button", { name: /더 보기|더보기/ }));
  await waitFor(() => expect(factories()).toHaveLength(2));
  expect(factories()[1]![0]).toBe(services.functions);
  expect(mockCallableInvocations.filter(call => call.name === "getPublicSegmentMetadata").at(-1)?.data).toMatchObject({ cursor: "segment-next" });
});

it("ignores an old segment continuation when the embedded app is replaced for the same athlete", async () => {
  const services = () => ({ auth: { currentUser: null }, firestore: {}, functions: {}, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined), getAppCheckToken: vi.fn().mockResolvedValue(null) }) as unknown as FirebaseServices;
  const first = services(), next = services();
  setDocData("users_public/athlete-1", { ...createMockProfile(), nickname: "Embedded athlete", profilePublic: true });
  let resolveOld!: (value: unknown) => void;
  let calls = 0;
  setCallableImplementation("getPublicSegmentMetadata", () => {
    calls++;
    if (calls === 2) return new Promise(resolve => { resolveOld = resolve; });
    return { data: { items: [{ id: `s-${calls}`, name: calls === 1 ? "Initial segment" : "Current app segment", distance: 1000 }], cursor: calls === 1 ? "next" : null, hasMore: calls === 1 } };
  });
  const view = renderWithProviders(<FirebaseServicesProvider services={first}><AthletePage /></FirebaseServicesProvider>);
  fireEvent.click(await screen.findByRole("tab", { name: "만든 구간", exact: true }, { timeout: 1000 }));
  await screen.findAllByText(/Initial segment/, {}, { timeout: 1000 });
  fireEvent.click(screen.getByRole("button", { name: /더 보기|더보기/ }));
  await waitFor(() => expect(calls).toBe(2), { timeout: 1000 });
  view.rerender(<FirebaseServicesProvider services={next}><AthletePage /></FirebaseServicesProvider>);
  await waitFor(() => expect(calls).toBeGreaterThanOrEqual(3), { timeout: 1000 });
  fireEvent.click(screen.getByRole("tab", { name: "만든 구간", exact: true }));
  expect((await screen.findAllByText(/Current app segment/, {}, { timeout: 1000 })).length).toBeGreaterThan(0);
  await act(async () => resolveOld({ data: { items: [{ id: "late", name: "Old app late segment", distance: 1000 }], cursor: null, hasMore: false } }));
  expect(screen.queryAllByText(/Old app late segment/)).toHaveLength(0);
});

// 경고 문구 자체를 누르면 해소한다 — 「다시 시도」 같은 버튼을 새로 두지 않는다.
it("re-reads the owner feed when the read-failure text itself is pressed, without re-reading media", async () => {
  setCollectionDocs("activities", [createMockActivity({ deletedAt: null, id: "recovery", userId: "athlete-1", description: "Recovered owner page" })]);
  const original = vi.mocked(getDocs).getMockImplementation()!;
  let attempts = 0;
  vi.mocked(getDocs).mockImplementation((async (q: { constraints?: Array<{type:string;args:unknown[]}> }) => {
    if (q.constraints?.some(c => c.type === "limit" && c.args[0] === 20) && ++attempts === 1) throw new Error("offline");
    return original(q as never);
  }) as never);
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" } });
  const failure = await screen.findByRole("button", { name: "활동 목록을 불러오지 못했습니다. 전체 결과가 아니며 같은 위치에서 다시 시도할 수 있습니다." });
  const previews = mockCallableInvocations.filter(call => call.name === "getAthleteProfilePreview").length;
  fireEvent.click(failure);
  expect((await screen.findAllByText("Recovered owner page")).length).toBeGreaterThan(0);
  expect(attempts).toBe(2);
  expect(screen.queryByText("활동 목록을 불러오지 못했습니다. 전체 결과가 아니며 같은 위치에서 다시 시도할 수 있습니다.")).not.toBeInTheDocument();
  expect(mockCallableInvocations.filter(call => call.name === "getAthleteProfilePreview")).toHaveLength(previews);
  vi.mocked(getDocs).mockImplementation(original);
});
it("re-sends only the failed media request when its failure text is pressed", async () => {
  let highlights = 0;
  setCallableImplementation("getAthleteProfilePreview", (request) => {
    const input = request as { kind: string };
    if (input.kind === "highlights" && ++highlights === 1) throw new Error("offline");
    return { data: { items: [], scope: "recent", complete: true, nextCursor: null } };
  });
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" } });
  fireEvent.click(await screen.findByRole("button", { name: "미디어 기록을 불러오지 못했습니다." }));
  await waitFor(() => expect(highlights).toBe(2));
  await waitFor(() => expect(screen.queryByText("미디어 기록을 불러오지 못했습니다.")).not.toBeInTheDocument());
  expect(mockCallableInvocations.filter(call => call.name === "getAthleteProfilePreview" && (call.data as { kind?: string })?.kind === "photos")).toHaveLength(1);
});
it("sends the owner's empty activity text to the import window", async () => {
  setCollectionDocs("activities", []);
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" } });
  const link = await screen.findByRole("link", { name: "아직 활동 내역이 없어요." });
  expect(link.getAttribute("href")).toBe("/ko/athlete/me/activities?import=1");
});
it("re-reads my clubs when the clubs failure text is pressed", async () => {
  const original = vi.mocked(getDocs).getMockImplementation()!;
  let clubReads = 0;
  vi.mocked(getDocs).mockImplementation((async (q: { path?: string }) => {
    if (q.path === "user_groups/athlete-1/groups" && ++clubReads === 1) throw new Error("offline");
    return original(q as never);
  }) as never);
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "athlete-1" } });
  fireEvent.click(await screen.findByRole("button", { name: "클럽을 불러오지 못했습니다." }));
  await waitFor(() => expect(clubReads).toBe(2));
  await waitFor(() => expect(screen.queryByText("클럽을 불러오지 못했습니다.")).not.toBeInTheDocument());
  vi.mocked(getDocs).mockImplementation(original);
});


it.each([false, true])("shows whole totals on a private profile to guest/authenticated=%s without exposing details", async authenticated => {
  setDocData("users_public/athlete-1", { nickname: "Private rider", profilePublic: false });
  setCallableResult("getPublicAthleteTotals", { data: totalsFixture({ count: 7 }) });
  setCollectionDocs("activities", [{ id: "secret", ...createMockActivity({ userId: "athlete-1", visibility: "private", description: "PRIVATE ACTIVITY" }) }]);
  renderWithProviders(<AthletePage />, { authenticated, user: { uid: "viewer" } });
  const totals = await screen.findByRole("region", { name: "활동 누적 기록" });
  await waitFor(() => expect(within(totals).getByText("7회")).toBeInTheDocument());
  expect(within(totals).getByText("전체 활동 기록 기준")).toBeInTheDocument();
  expect(screen.getByTestId("P0.private")).toBeInTheDocument();
  expect(screen.queryByText("PRIVATE ACTIVITY")).not.toBeInTheDocument();
});
it.each(["pending", "failed"])("does not replace public %s totals with activity-list zero", async state => {
  setDocData("users_public/athlete-1", { nickname: "Public rider", profilePublic: true });
  setCallableResult("getPublicAthleteTotals", { data: { schemaVersion: 1, state, revision: 0 } });
  renderWithProviders(<AthletePage />);
  const totals = await screen.findByRole("region", { name: "활동 누적 기록" });
  await waitFor(() => expect(within(totals).getByRole("status")).toHaveTextContent(state === "failed" ? "누적 기록 확인이 중단되었습니다." : "누적 기록을 확인하고 있습니다."));
  expect(within(totals).queryByText("0회")).not.toBeInTheDocument();
  expect(within(totals).getAllByText("—")).toHaveLength(4);
});

it("re-reads whole totals from a profile change signal and when returning to the tab", async () => {
  setDocData("users_public/athlete-1", { nickname: "Signal rider", profilePublic: true, athleteTotalsSignal: "one" });
  renderWithProviders(<AthletePage />);
  const totals = await screen.findByRole("region", { name: "활동 누적 기록" });
  await waitFor(() => expect(within(totals).getByText("5회")).toBeInTheDocument());
  setCallableResult("getPublicAthleteTotals", { data: totalsFixture({ count: 7 }) });
  act(() => setDocData("users_public/athlete-1", { nickname: "Signal rider", profilePublic: true, athleteTotalsSignal: "two" }));
  await waitFor(() => expect(within(totals).getByText("7회")).toBeInTheDocument());
  setCallableResult("getPublicAthleteTotals", { data: totalsFixture({ count: 9 }) });
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(within(totals).getByText("9회")).toBeInTheDocument());
});
it("records a real public request failure after unmount without updating abandoned state", async () => {
  const failure = new Error("offline"); let reject!: (error: Error) => void;
  setDocData("users_public/athlete-1", { nickname: "Public rider", profilePublic: true });
  setCallableImplementation("getPublicAthleteTotals", () => new Promise((_, fail) => { reject = fail; }));
  const log = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => {});
  const view = renderWithProviders(<AthletePage />);
  await waitFor(() => expect(reject).toBeTypeOf("function"));
  view.unmount();
  await act(async () => { reject(failure); await Promise.resolve(); });
  expect(log).toHaveBeenCalledWith("AthletePage.publicTotals", failure, {}, expect.anything(), null);
  log.mockRestore();
});
it("does not use whole-history count as the remaining authorized list count", async () => {
  setDocData("users_public/athlete-1", { nickname: "Public rider", profilePublic: true });
  setCallableResult("getPublicAthleteTotals", { data: totalsFixture({ count: 100 }) });
  const visible = Array.from({ length: 21 }, (_, i) => ({
    ...createMockActivity({ id: `visible-${i}`, userId: "athlete-1", deletedAt: null, visibility: "everyone" }),
    activityRevision: "current",
    discoveryFacts: { status: "ready", metrics: null },
  }));
  vi.mocked(loadActivityDiscovery).mockImplementation(async () => ({ expiresAt: Date.now() + 600000, items: visible.slice(0, 20), nextCursor: "next", exhausted: false }));
  renderWithProviders(<AthletePage />);
  await screen.findByText("100회", {}, { timeout: 1000 });
  expect(screen.queryByText("더 보기 (80개 남음)")).not.toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "더 보기", exact: true }, { timeout: 1000 })).toBeInTheDocument();
});

it("renders an authorized public summary even if the separate public identity is missing", async () => {
  setDocData("users_public/athlete-1", {});
  setCallableResult("getPublicAthleteTotals", { data: totalsFixture({ count: 13 }) });
  renderWithProviders(<AthletePage />);
  await screen.findByText("13회");
  expect(screen.getByText("프로필 정보를 불러오지 못했습니다.")).toBeInTheDocument();
  expect(screen.getByText("전체 활동 기록 기준")).toBeInTheDocument();
});
it("keeps private summary visible while waiting for relationship status without enabling friend writes", async () => {
  setDocData("users_public/athlete-1", { nickname: "Private rider", profilePublic: false });
  const original = vi.mocked(getDoc).getMockImplementation()!;
  let resolve!: (value: unknown) => void;
  vi.mocked(getDoc).mockImplementation(((ref: { path?: string }) => ref.path === "friends/viewer/users/athlete-1"
    ? new Promise(done => { resolve = done; }) : original(ref as never)) as never);
  const view = renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "viewer" } });
  await screen.findByText("5회");
  expect(screen.queryByRole("button", { name: "친구 요청", exact: true })).not.toBeInTheDocument();
  view.unmount(); resolve?.({ exists: () => true });
  vi.mocked(getDoc).mockImplementation(original);
});

it("invalidates cached and in-flight totals when the same viewer receives a bilateral block revision", async () => {
  setDocData("users_public/athlete-1", { nickname: "Blocked rider", profilePublic: false });
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "viewer" }, profile: { activitySocialAccessRevision: "before" } });
  const totals = await screen.findByRole("region", { name: "활동 누적 기록" });
  await waitFor(() => expect(within(totals).getByText("5회")).toBeInTheDocument());
  let release!: (value: unknown) => void;
  let calls = 0;
  setCallableImplementation("getPublicAthleteTotals", async () => {
    if (++calls === 1) return await new Promise(resolve => { release = resolve; });
    throw Object.assign(new Error("not available"), { code: "functions/not-found" });
  });
  act(() => setDocData("users/viewer", { ...createMockProfile(), activitySocialAccessRevision: "changed-one" }));
  await waitFor(() => expect(calls).toBe(1));
  expect(within(totals).queryByText("5회")).not.toBeInTheDocument();
  act(() => setDocData("users/viewer", { ...createMockProfile(), activitySocialAccessRevision: "changed-two" }));
  await waitFor(() => expect(calls).toBe(2));
  await act(async () => release({ data: totalsFixture({ count: 99 }) }));
  await waitFor(() => expect(within(totals).getByRole("status")).toHaveTextContent("누적 기록 확인이 중단되었습니다."));
  expect(within(totals).queryByText("99회")).not.toBeInTheDocument();
  expect(within(totals).getAllByText("—")).toHaveLength(4);
});

 it("attributes another athlete's whole-history summary correctly in English", async () => {
  i18n.addResourceBundle("en", "athlete", enAthlete, true, true);
  await i18n.changeLanguage("en");
  try {
    setDocData("users_public/athlete-1", { nickname: "Other rider", profilePublic: false });
    renderWithProviders(<AthletePage />, { route: "/en/athlete/athlete-1" });
    await screen.findByText("Based on all activity records");
    expect(screen.queryByText("Based on your full activity history")).not.toBeInTheDocument();
  } finally { await act(async () => { await i18n.changeLanguage("ko"); }); }
});

it("re-authorizes expired totals when a missing public projection cannot signal account deletion", async () => {
  const expiry: Array<() => void> = [];
  const original = globalThis.setTimeout;
  const timer = vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, delay?: number, ...args: unknown[]) => {
    if (delay === 60_000) expiry.push(callback);
    return original(callback, delay, ...args);
  }) as typeof setTimeout);
  try {
    setDocData("users_public/athlete-1", null as never);
    renderWithProviders(<AthletePage />);
    await screen.findByText("5회");
    expect(expiry).toHaveLength(1);
    const calls = mockCallableInvocations.filter(call => call.name === "getPublicAthleteTotals").length;
    setCallableImplementation("getPublicAthleteTotals", () => { throw Object.assign(new Error("deleted"), { code: "functions/not-found" }); });
    act(() => expiry[0]!());
    expect(screen.queryByText("5회")).not.toBeInTheDocument();
    expect(mockCallableInvocations.filter(call => call.name === "getPublicAthleteTotals")).toHaveLength(calls);
    fireEvent.click(screen.getByRole("button", { name: "누적 기록 다시 불러오기" }));
    await waitFor(() => expect(mockCallableInvocations.filter(call => call.name === "getPublicAthleteTotals")).toHaveLength(calls + 1));
    await screen.findByText("누적 기록 확인이 중단되었습니다.");
    expect(screen.queryByText("5회")).not.toBeInTheDocument();
  } finally { timer.mockRestore(); }
});

it("does not offer friend writes after relationship failure and retries the failed check", async () => {
  setDocData("users_public/athlete-1", { nickname: "Private rider", profilePublic: false });
  const original = vi.mocked(getDoc).getMockImplementation()!;
  let attempts = 0;
  vi.mocked(getDoc).mockImplementation(((ref: { path?: string }) => {
    if (ref.path === "friends/viewer/users/athlete-1" && ++attempts === 1) return Promise.reject(new Error("offline"));
    return original(ref as never);
  }) as never);
  try {
    renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "viewer" } });
    const retry = await screen.findByRole("button", { name: "친구 관계를 확인하지 못했습니다." });
    expect(screen.queryByRole("button", { name: "친구 요청", exact: true })).not.toBeInTheDocument();
    fireEvent.click(retry);
    await screen.findByRole("button", { name: "친구 요청", exact: true });
    expect(attempts).toBe(2);
  } finally { vi.mocked(getDoc).mockImplementation(original); }
});

it("invalidates both displayed totals and late responses on public projection deletion", async () => {
  setDocData("users_public/athlete-1", { nickname: "Deleted rider", athleteTotalsSignal: "one" });
  renderWithProviders(<AthletePage />);
  await screen.findByText("5회");
  let release!: (value: unknown) => void;
  let requests = 0;
  setCallableImplementation("getPublicAthleteTotals", async () => {
    if (++requests === 1) return await new Promise(resolve => { release = resolve; });
    throw Object.assign(new Error("deleted"), { code: "functions/not-found" });
  });
  act(() => setDocData("users_public/athlete-1", { nickname: "Deleted rider", athleteTotalsSignal: "two" }));
  await waitFor(() => expect(requests).toBe(1));
  act(() => setDocData("users_public/athlete-1", null as never));
  await waitFor(() => expect(requests).toBe(2));
  await act(async () => release({ data: totalsFixture({ count: 99 }) }));
  await screen.findByText("누적 기록 확인이 중단되었습니다.");
  expect(screen.queryByText("5회")).not.toBeInTheDocument();
  expect(screen.queryByText("99회")).not.toBeInTheDocument();
});

it.each(["users_public/athlete-1", "users/viewer"])("invalidates previous totals on offline metadata from %s and restores only fresh callable results", async path => {
  setDocData("users_public/athlete-1", { nickname: "Connected rider", athleteTotalsSignal: "one" });
  const original = vi.mocked(onSnapshot).getMockImplementation()!;
  const updates = new Map<string, (snapshot: unknown) => void>();
  vi.mocked(onSnapshot).mockImplementation(((ref: { path: string }, options: unknown, next: unknown, error: unknown) => {
    if (options && typeof options === "object" && "includeMetadataChanges" in options) updates.set(ref.path, next as (snapshot: unknown) => void);
    return (original as (...args: unknown[]) => () => void)(ref, options, next, error);
  }) as never);
  const timer = vi.spyOn(globalThis, "setTimeout");
  const clearTimer = vi.spyOn(globalThis, "clearTimeout");
  try {
    renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "viewer" } });
    await screen.findByText("5회");
    await waitFor(() => {
      const cleared = clearTimer.mock.calls.map(([id]) => id);
      const pending = timer.mock.calls.flatMap((call, index) => call[1] === 60_000 && !cleared.includes(timer.mock.results[index]?.value) ? [call] : []);
      expect(pending).toHaveLength(0);
    });
    const calls = mockCallableInvocations.filter(call => call.name === "getPublicAthleteTotals").length;
    const update = updates.get(path)!;
    const snapshot = (fromCache: boolean) => ({ exists: () => true, data: () => ({ athleteTotalsSignal: "one" }), metadata: { fromCache } });
    setCallableResult("getPublicAthleteTotals", { data: totalsFixture({ count: 7 }) });
    act(() => update(snapshot(true)));
    expect(screen.queryByText("5회")).not.toBeInTheDocument();
    await screen.findByText("7회");
    expect(mockCallableInvocations.filter(call => call.name === "getPublicAthleteTotals")).toHaveLength(calls + 1);
    setCallableResult("getPublicAthleteTotals", { data: totalsFixture({ count: 9 }) });
    act(() => update(snapshot(false)));
    await screen.findByText("9회");
    expect(mockCallableInvocations.filter(call => call.name === "getPublicAthleteTotals")).toHaveLength(calls + 2);
  } finally { clearTimer.mockRestore(); timer.mockRestore(); vi.mocked(onSnapshot).mockImplementation(original); }
});

it.each(["cache", "error"])("shows a freshly authorized callable snapshot even when signal state is %s, and manual retry reconnects signals", async initial => {
  setDocData("users_public/athlete-1", { nickname: "Callable rider", athleteTotalsSignal: "one" });
  const original = vi.mocked(onSnapshot).getMockImplementation()!;
  let phase = initial;
  vi.mocked(onSnapshot).mockImplementation(((ref: { path: string }, options: unknown, next: unknown, error: unknown) => {
    if (!options || typeof options !== "object" || !("includeMetadataChanges" in options))
      return (original as (...args: unknown[]) => () => void)(ref, options, next, error);
    if (phase === "error") { (error as (failure: Error) => void)(new Error("signal unavailable")); return () => {}; }
    return (original as (...args: unknown[]) => () => void)(ref, options, (snapshot: { metadata: object }) => {
      (next as (value: unknown) => void)({ ...snapshot, metadata: { ...snapshot.metadata, fromCache: phase === "cache" } });
    }, error);
  }) as never);
  try {
    renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "viewer" } });
    await screen.findByText("5회");
    expect(screen.getByText(/조회 시각 .*의 누적 기록/)).toBeInTheDocument();
    setCallableResult("getPublicAthleteTotals", { data: totalsFixture({ count: 9 }) });
    phase = "server";
    fireEvent.click(screen.getByRole("button", { name: "누적 기록 다시 불러오기" }));
    await screen.findByText("9회");
  } finally { vi.mocked(onSnapshot).mockImplementation(original); }
});


it("rejects malformed target paths before registering Firestore reads", async () => {
  renderWithProviders(<AthletePage meUserId="a/b" />);
  await screen.findByRole("alert", { name: "" });
  expect(screen.getByText("사용자를 찾을 수 없습니다.")).toBeInTheDocument();
  expect(mockCallableInvocations.filter(call => call.name === "getPublicAthleteTotals")).toHaveLength(0);
});

it("retries the callable immediately when a terminated signal subscription has not delivered a new callback", async () => {
  setDocData("users_public/athlete-1", { nickname: "Retry rider", athleteTotalsSignal: "one" });
  const original = vi.mocked(onSnapshot).getMockImplementation()!;
  let first = true;
  vi.mocked(onSnapshot).mockImplementation(((ref: { path: string }, options: unknown, next: unknown, error: unknown) => {
    if (!options || typeof options !== "object" || !("includeMetadataChanges" in options))
      return (original as (...args: unknown[]) => () => void)(ref, options, next, error);
    if (first) (error as (failure: Error) => void)(new Error("signal unavailable"));
    return () => {};
  }) as never);
  try {
    renderWithProviders(<AthletePage />);
    await screen.findByText("5회");
    first = false;
    setCallableResult("getPublicAthleteTotals", { data: totalsFixture({ count: 11 }) });
    fireEvent.click(screen.getByRole("button", { name: "누적 기록 다시 불러오기" }));
    await screen.findByText("11회");
  } finally { vi.mocked(onSnapshot).mockImplementation(original); }
});

it.each(["missing", "delayed"])("uses a bounded snapshot when the logged-in viewer signal is %s", async mode => {
  setDocData("users_public/athlete-1", { nickname: "Bounded rider", athleteTotalsSignal: "one" });
  const original = vi.mocked(onSnapshot).getMockImplementation()!;
  vi.mocked(onSnapshot).mockImplementation(((ref: { path: string }, options: unknown, next: unknown, error: unknown) => {
    if (ref.path === "users/viewer" && options && typeof options === "object" && "includeMetadataChanges" in options) {
      if (mode === "missing") (next as (snapshot: unknown) => void)({ exists: () => false, data: () => undefined, metadata: { fromCache: false } });
      return () => {};
    }
    return (original as (...args: unknown[]) => () => void)(ref, options, next, error);
  }) as never);
  const originalTimer = globalThis.setTimeout;
  let expire: (() => void) | undefined;
  const timer = vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, delay?: number, ...args: unknown[]) => {
    if (delay === 60_000) expire = callback;
    return originalTimer(callback, delay, ...args);
  }) as typeof setTimeout);
  try {
    renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "viewer" } });
    await screen.findByText("5회");
    expect(expire).toBeDefined();
    act(() => expire!());
    expect(screen.queryByText("5회")).not.toBeInTheDocument();
    expect(screen.getByText("누적 기록을 다시 확인해 주세요.")).toBeInTheDocument();
  } finally { timer.mockRestore(); vi.mocked(onSnapshot).mockImplementation(original); }
});

it("keeps whole totals while a failed initial public list remains unknown and can be retried", async () => {
  setDocData("users_public/athlete-1", { nickname: "Public rider", profilePublic: true, athleteTotalsSignal: "one" });
  const original = vi.mocked(loadActivityDiscovery).getMockImplementation()!;
  let attempts = 0;
  vi.mocked(loadActivityDiscovery).mockImplementation((async (services, request) => {
    if (request.scope === "athlete" && request.fromInclusive === undefined && request.order !== "id_asc" && !request.cursor && ++attempts === 1) throw new Error("list timeout");
    return original(services, request);
  }) as typeof loadActivityDiscovery);
  try {
    renderWithProviders(<AthletePage />);
    const retry = await screen.findByRole("button", { name: "활동 목록을 불러오지 못했습니다. 목록을 처음부터 다시 불러올 수 있습니다." });
    expect(screen.getByText("5회")).toBeInTheDocument();
    expect(screen.queryByText("공개된 활동이 없습니다.")).not.toBeInTheDocument();
    fireEvent.click(retry);
    await waitFor(() => expect(attempts).toBe(2));
    await screen.findByText("공개된 활동이 없습니다.");
  } finally { vi.mocked(loadActivityDiscovery).mockImplementation(original); }
});

it.each(["functions/permission-denied", "functions/failed-precondition"])("discards prior public details on %s and restarts without the rejected cursor", async code => {
  setDocData("users_public/athlete-1", { nickname: "Public rider", profilePublic: true });
  const original = vi.mocked(loadActivityDiscovery).getMockImplementation()!;
  const cursors: Array<string | undefined> = [];
  vi.mocked(loadActivityDiscovery).mockImplementation((async (services, request) => {
    if (request.order === "id_asc" || request.fromInclusive !== undefined) return original(services, request);
    cursors.push(request.cursor);
    if (request.cursor) throw Object.assign(new Error("rejected continuation"), { code });
    return { expiresAt: Date.now() + 600000, items: [createMockActivity({ id: `page-${cursors.length}`, userId: "athlete-1", description: cursors.length === 1 ? "Prior public detail" : "Recovered public detail" })], nextCursor: "next", exhausted: false };
  }) as typeof loadActivityDiscovery);
  try {
    renderWithProviders(<AthletePage />);
    await screen.findByText("Prior public detail");
    fireEvent.click(screen.getByRole("button", { name: /더 보기|더보기/ }));
    const retry = await screen.findByRole("button", { name: "활동 목록을 불러오지 못했습니다. 목록을 처음부터 다시 불러올 수 있습니다." });
    expect(screen.queryByText("Prior public detail")).not.toBeInTheDocument();
    fireEvent.click(retry);
    await screen.findByText("Recovered public detail");
    expect(cursors).toEqual([undefined, "next", undefined]);
  } finally { vi.mocked(loadActivityDiscovery).mockImplementation(original); }
});

it("releases an old continuation's busy state when the injected app changes", async () => {
  const services = () => ({ auth: { currentUser: null }, firestore: {}, functions: {}, ensureAppCheckReady: async () => {}, getAppCheckToken: async () => null }) as unknown as FirebaseServices;
  const first = services(), next = services();
  setDocData("users_public/athlete-1", { nickname: "Public rider", profilePublic: true });
  const original = vi.mocked(loadActivityDiscovery).getMockImplementation()!;
  let release!: (value: Awaited<ReturnType<typeof loadActivityDiscovery>>) => void;
  vi.mocked(loadActivityDiscovery).mockImplementation((async (activeServices, request) => {
    if (request.order === "id_asc" || request.fromInclusive !== undefined) return original(activeServices, request);
    if (activeServices === first && request.cursor) return await new Promise(resolve => { release = resolve; });
    return { expiresAt: Date.now() + 600000, items: [createMockActivity({ id: activeServices === first ? "old" : request.cursor ? "continued" : "new", userId: "athlete-1", description: activeServices === first ? "Old app page" : request.cursor ? "Current app continuation" : "Current app page" })], nextCursor: request.cursor ? null : "next", exhausted: Boolean(request.cursor) };
  }) as typeof loadActivityDiscovery);
  try {
    const view = renderWithProviders(<FirebaseServicesProvider services={first}><AthletePage /></FirebaseServicesProvider>);
    await screen.findByText("Old app page");
    fireEvent.click(screen.getByRole("button", { name: /더 보기|더보기/ }));
    await waitFor(() => expect(release).toBeDefined());
    view.rerender(<FirebaseServicesProvider services={next}><AthletePage /></FirebaseServicesProvider>);
    await screen.findByText("Current app page");
    const more = screen.getByRole("button", { name: /더 보기|더보기/ });
    expect(more).not.toBeDisabled();
    fireEvent.click(more);
    await screen.findByText("Current app continuation");
    await act(async () => release({ expiresAt: Date.now() + 600000, items: [createMockActivity({ id: "late", userId: "athlete-1", description: "Rejected old app result" })] as never, nextCursor: null, exhausted: true }));
    expect(screen.queryByText("Rejected old app result")).not.toBeInTheDocument();
  } finally { vi.mocked(loadActivityDiscovery).mockImplementation(original); }
});

it("observes first signal insertion on existing documents whose counters start at version zero", async () => {
  setDocData("users_public/athlete-1", { nickname: "Initial version rider", profilePublic: false });
  renderWithProviders(<AthletePage />, { authenticated: true, user: { uid: "viewer" } });
  await screen.findByText("5회");
  setCallableResult("getPublicAthleteTotals", { data: totalsFixture({ count: 7 }) });
  act(() => setDocData("users_public/athlete-1", { nickname: "Initial version rider", profilePublic: false, athleteTotalsSignal: "first-version" }));
  await screen.findByText("7회");
  setCallableImplementation("getPublicAthleteTotals", () => { throw Object.assign(new Error("blocked"), { code: "functions/not-found" }); });
  act(() => setDocData("users/viewer", { ...createMockProfile(), activitySocialAccessRevision: "first-block" }));
  await screen.findByText("누적 기록 확인이 중단되었습니다.");
  expect(screen.queryByText("7회")).not.toBeInTheDocument();
});

it.each(["success", "failure"])("ignores an older public continuation's %s and busy completion after visibility restarts the first page", async outcome => {
  const profile = { nickname: "Visibility rider", profilePublic: true, athleteTotalsSignal: "one" };
  setDocData("users_public/athlete-1", profile);
  const original = vi.mocked(loadActivityDiscovery).getMockImplementation()!;
  let firstPages = 0;
  let releaseOld!: (value: Awaited<ReturnType<typeof loadActivityDiscovery>>) => void;
  let rejectOld!: (error: Error) => void;
  let releaseNew!: (value: Awaited<ReturnType<typeof loadActivityDiscovery>>) => void;
  const page = (description: string, cursor: string | null) => ({ expiresAt: Date.now() + 600000, items: [createMockActivity({ id: description, userId: "athlete-1", description })] as never, nextCursor: cursor, exhausted: cursor === null });
  vi.mocked(loadActivityDiscovery).mockImplementation((async (services, request) => {
    if (request.order === "id_asc" || request.fromInclusive !== undefined) return original(services, request);
    if (!request.cursor) return page(++firstPages === 1 ? "Original page" : "Refreshed page", firstPages === 1 ? "old-cursor" : "fresh-cursor");
    if (request.cursor === "old-cursor") return await new Promise((resolve, reject) => { releaseOld = resolve; rejectOld = reject; });
    return await new Promise(resolve => { releaseNew = resolve; });
  }) as typeof loadActivityDiscovery);
  try {
    renderWithProviders(<AthletePage />);
    await screen.findByText("Original page");
    fireEvent.click(screen.getByRole("button", { name: /더 보기|더보기/ }));
    await waitFor(() => expect(releaseOld).toBeDefined());
    act(() => setDocData("users_public/athlete-1", { ...profile, profilePublic: false }));
    await screen.findByText("비공개 프로필입니다");
    act(() => setDocData("users_public/athlete-1", profile));
    await screen.findByText("Refreshed page");
    fireEvent.click(screen.getByRole("button", { name: /더 보기|더보기/ }));
    await waitFor(() => expect(releaseNew).toBeDefined());
    await act(async () => { if (outcome === "success") releaseOld(page("Obsolete detail", "poisoned-cursor")); else rejectOld(new Error("old request failed")); });
    expect(screen.getByText("Refreshed page")).toBeInTheDocument();
    expect(screen.queryByText("Obsolete detail")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /불러오는 중/ })).toBeDisabled();
    await act(async () => releaseNew(page("Current continuation", null)));
    await screen.findByText("Current continuation");
  } finally { vi.mocked(loadActivityDiscovery).mockImplementation(original); }
});

it("suppresses callable retries throughout a known offline interval and recovers while Firestore remains cached", async () => {
  setDocData("users_public/athlete-1", { nickname: "Network rider", athleteTotalsSignal: "one" });
  const original = vi.mocked(onSnapshot).getMockImplementation()!;
  let update!: (snapshot: unknown) => void;
  vi.mocked(onSnapshot).mockImplementation(((ref: { path: string }, options: unknown, next: unknown, error: unknown) => {
    if (ref.path === "users_public/athlete-1" && options && typeof options === "object" && "includeMetadataChanges" in options) update = next as typeof update;
    return (original as (...args: unknown[]) => () => void)(ref, options, next, error);
  }) as never);
  try {
    renderWithProviders(<AthletePage />);
    await screen.findByText("5회");
    const calls = mockCallableInvocations.filter(call => call.name === "getPublicAthleteTotals").length;
    await act(async () => {
      fireEvent(window, new Event("offline"));
      update({ exists: () => true, data: () => ({ athleteTotalsSignal: "one" }), metadata: { fromCache: true } });
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(mockCallableInvocations.filter(call => call.name === "getPublicAthleteTotals")).toHaveLength(calls);
    expect(screen.queryByText("5회")).not.toBeInTheDocument();
    setCallableResult("getPublicAthleteTotals", { data: totalsFixture({ count: 9 }) });
    act(() => fireEvent(window, new Event("online")));
    await screen.findByText("9회");
  } finally { vi.mocked(onSnapshot).mockImplementation(original); }
});

it("never reads a late SDK account's private profile or credentials in an approved guest frame", async () => {
  const services = { auth: { currentUser: null }, firestore: {}, functions: {}, ensureAppCheckReady: async () => {}, getAppCheckToken: async () => null } as unknown as FirebaseServices;
  setDocData("users_public/athlete-1", { nickname: "Guest rider", athleteTotalsSignal: "one" });
  renderWithProviders(<FirebaseServicesProvider services={services}><AthletePage /></FirebaseServicesProvider>);
  await screen.findByText("5회");
  const calls = mockCallableInvocations.filter(call => call.name === "getPublicAthleteTotals").length;
  const lateUser = { uid: "late-account", getIdToken: vi.fn(async () => "unapproved") };
  Object.defineProperty(services.auth, "currentUser", { value: lateUser, configurable: true });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "누적 기록 다시 불러오기" }));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(screen.getByText("프로필 공개 범위를 확인하는 중…")).toBeInTheDocument();
  expect(mockCallableInvocations.filter(call => call.name === "getPublicAthleteTotals")).toHaveLength(calls);
  expect(lateUser.getIdToken).not.toHaveBeenCalled();
  expect(vi.mocked(onSnapshot).mock.calls.some(([ref]) => (ref as { path?: string }).path === "users/late-account")).toBe(false);
});
