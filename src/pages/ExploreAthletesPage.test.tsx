import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import ExploreAthletesPage from "./ExploreAthletesPage";
import { searchUsers, type SearchUserItem } from "../services/userSearch";
import { sendFriendRequest } from "../hooks/useFriends";

const flags = vi.hoisted(() => ({ subscriptions: true }));
const friendsState = vi.hoisted(() => ({
  friends: [] as { userId: string }[],
  requests: [] as { requesterId: string }[],
  sentRequests: [] as { targetId: string }[],
  acceptRequest: vi.fn(),
  cancelRequest: vi.fn(),
}));
vi.mock("../config/activitySubscriptions", () => ({ get ACTIVITY_SUBSCRIPTIONS_ENABLED() { return flags.subscriptions; } }));
vi.mock("../services/userSearch", async importOriginal => ({ ...await importOriginal<typeof import("../services/userSearch")>(), searchUsers: vi.fn() }));
vi.mock("../hooks/useFriends", () => ({ useFriends: () => friendsState, sendFriendRequest: vi.fn() }));
vi.mock("../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: async () => true, alert: async () => undefined, prompt: async () => null }) }));

const search = vi.mocked(searchUsers);
const send = vi.mocked(sendFriendRequest);

function person(id: string, overrides: Partial<SearchUserItem> = {}): SearchUserItem {
  return { id, nickname: `rider-${id}`, photoURL: null, friendCode: `CODE${id}`, friendRequestsAllowed: true, matchedBy: "nickname", profilePublic: false, ...overrides };
}
function Location() { const location = useLocation(); return <output data-testid="location">{location.search}</output>; }
const renderPage = (route = "/ko/explore/athletes", options: Parameters<typeof renderWithProviders>[1] = { authenticated: true }) =>
  renderWithProviders(<><ExploreAthletesPage /><Location /></>, { route, ...options });
const row = (nickname: string) => screen.getByRole("link", { name: nickname }).closest("li") as HTMLElement;

beforeEach(() => {
  flags.subscriptions = true;
  search.mockReset();
  send.mockReset().mockResolvedValue(undefined);
  friendsState.friends = []; friendsState.requests = []; friendsState.sentRequests = [];
  friendsState.acceptRequest = vi.fn().mockResolvedValue(undefined);
  friendsState.cancelRequest = vi.fn().mockResolvedValue(undefined);
});

it("asks guests and anonymous users to sign in without searching", async () => {
  renderPage("/ko/explore/athletes?q=moon", { authenticated: false });
  expect(await screen.findByTestId("E5.guest")).toHaveTextContent("사람을 찾으려면 로그인이 필요해요.");
  renderPage("/ko/explore/athletes?q=moon", { authenticated: true, user: { isAnonymous: true } });
  expect(screen.queryByRole("search")).not.toBeInTheDocument();
  expect(search).not.toHaveBeenCalled();
});

it("stays idle until submit, then searches and syncs the query to the URL", async () => {
  search.mockResolvedValue({ items: [], nextCursor: null });
  renderPage();
  const input = await screen.findByTestId("E5-1-1");
  expect(screen.getByTestId("E5-1-3")).toHaveTextContent("이메일, 닉네임, 친구 코드로 찾을 수 있어요");
  await userEvent.type(input, "moon@example.com");
  expect(search).not.toHaveBeenCalled();
  expect(screen.queryByTestId("E5-2")).not.toBeInTheDocument();
  await userEvent.keyboard("{Enter}");
  await waitFor(() => expect(search).toHaveBeenCalledWith("moon@example.com"));
  expect(screen.getByTestId("location")).toHaveTextContent("?q=moon%40example.com");
  expect(await screen.findByTestId("E5.empty")).toHaveTextContent("찾는 사람이 없어요");
});

it("runs the URL query on load and derives each row's friend action", async () => {
  friendsState.friends = [{ userId: "f" }];
  friendsState.sentRequests = [{ targetId: "s" }];
  friendsState.requests = [{ requesterId: "r" }];
  search.mockResolvedValue({ items: [person("f"), person("s"), person("r"), person("n"), person("d", { friendRequestsAllowed: false })], nextCursor: null });
  renderPage("/ko/explore/athletes?q=rider");
  await screen.findByRole("link", { name: "rider-f" });
  expect(search).toHaveBeenCalledWith("rider");
  expect(screen.getByTestId("E5-1-1")).toHaveValue("rider");
  expect(within(row("rider-f")).getByRole("button", { name: "친구" })).toBeDisabled();
  expect(within(row("rider-s")).getByText("요청됨")).toBeInTheDocument();
  expect(within(row("rider-s")).getByRole("button", { name: "rider-s님에게 보낸 친구 요청 취소" })).toBeEnabled();
  expect(within(row("rider-r")).getByRole("button", { name: "rider-r 친구 요청 수락" })).toBeEnabled();
  expect(within(row("rider-n")).getByRole("button", { name: "rider-n님에게 친구 요청" })).toBeEnabled();
  expect(within(row("rider-d")).queryByTestId("E5-2-2")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "rider-f" })).toHaveAttribute("href", "/ko/athlete/f");
});

it("sends a request to a private profile optimistically and shows the badge instead of details", async () => {
  search.mockResolvedValue({ items: [person("p")], nextCursor: null });
  renderPage("/ko/explore/athletes?q=CODEp", { authenticated: true, profile: { nickname: "나", photoURL: "https://example.com/me.png" } });
  await screen.findByRole("link", { name: "rider-p" });
  const item = row("rider-p");
  expect(within(item).getByTestId("E5-2-6")).toHaveTextContent("비공개 프로필");
  expect(within(item).getByText("CODEp")).toBeInTheDocument();
  expect(within(item).queryByTestId("E5-2-9")).not.toBeInTheDocument();
  await userEvent.click(within(item).getByRole("button", { name: "rider-p님에게 친구 요청" }));
  await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ uid: "test-uid" }), "p"));
  expect(within(item).getByText("요청됨")).toBeInTheDocument();
  expect(await screen.findByText("rider-p님에게 친구 요청을 보냈어요")).toBeInTheDocument();
});

it("rolls back the optimistic state and toasts when sending fails; accepts and cancels through the friends hook", async () => {
  send.mockRejectedValueOnce(new Error("permission-denied"));
  friendsState.requests = [{ requesterId: "r" }];
  friendsState.sentRequests = [{ targetId: "s" }];
  search.mockResolvedValue({ items: [person("n"), person("r"), person("s")], nextCursor: null });
  renderPage("/ko/explore/athletes?q=rider");
  await screen.findByRole("link", { name: "rider-n" });
  await userEvent.click(within(row("rider-n")).getByRole("button", { name: "rider-n님에게 친구 요청" }));
  expect(await screen.findByText("친구 요청을 보내지 못했어요")).toBeInTheDocument();
  expect(within(row("rider-n")).getByRole("button", { name: "rider-n님에게 친구 요청" })).toBeEnabled();
  await userEvent.click(within(row("rider-r")).getByRole("button", { name: "rider-r 친구 요청 수락" }));
  await waitFor(() => expect(friendsState.acceptRequest).toHaveBeenCalledWith("r"));
  expect(await within(row("rider-r")).findByRole("button", { name: "친구" })).toBeDisabled();
  await userEvent.click(within(row("rider-s")).getByRole("button", { name: "rider-s님에게 보낸 친구 요청 취소" }));
  await waitFor(() => expect(friendsState.cancelRequest).toHaveBeenCalledWith("s"));
  expect(await within(row("rider-s")).findByRole("button", { name: "rider-s님에게 친구 요청" })).toBeEnabled();
});

it("renders public details with the profile stat strip and recent activity link, omitting missing fields", async () => {
  search.mockResolvedValue({ items: [
    person("a", { profilePublic: true, details: {
      bio: "주말엔 남산", primaryDiscipline: "bike", totalDistance: 1_234_000,
      subscriptionCount: 3, subscriberCount: 4, friendCount: 5, activityCount: 6,
      lastActivity: { id: "act1", title: "아침 라이딩", startTime: Date.UTC(2026, 9, 25, 3) },
    } }),
    person("b", { profilePublic: true, details: { friendCount: 2, lastActivity: null } }),
    person("c", { profilePublic: true, details: { lastActivity: { id: "act2", title: "", type: "Run", startTime: Date.UTC(2026, 9, 26, 3) } } }),
  ], nextCursor: null });
  renderPage("/ko/explore/athletes?q=rider");
  await screen.findByRole("link", { name: "rider-a" });
  const full = row("rider-a");
  expect(within(full).getByTestId("E5-2-7")).toHaveTextContent("주말엔 남산");
  expect(within(full).getByTestId("E5-2-8")).toHaveTextContent("사이클 · 1234km");
  const stats = within(full).getByTestId("E5-2-9");
  for (const label of ["구독 중 3", "구독자 4", "친구 5", "활동 6"]) expect(within(stats).getByLabelText(label)).toBeInTheDocument();
  expect(within(full).getByRole("link", { name: /아침 라이딩/ })).toHaveAttribute("href", "/ko/activity/act1");
  expect(within(full).getByTestId("E5-2-10")).toHaveTextContent("10월 25일");
  expect(within(full).queryByTestId("E5-2-6")).not.toBeInTheDocument();
  const sparse = row("rider-b");
  expect(within(sparse).getByTestId("E5-2-9").children).toHaveLength(1);
  expect(within(sparse).getByLabelText("친구 2")).toBeInTheDocument();
  for (const id of ["E5-2-7", "E5-2-8", "E5-2-10", "E5-2-6"]) expect(within(sparse).queryByTestId(id)).not.toBeInTheDocument();

  // 제목이 비면 ActivityCard 처럼 종목 라벨로 대체 — 러닝을 라이딩으로 표시하지 않는다
  expect(within(row("rider-c")).getByRole("link", { name: /러닝/ })).toHaveAttribute("href", "/ko/activity/act2");
});

it("hides subscription stats when subscriptions are disabled", async () => {
  flags.subscriptions = false;
  search.mockResolvedValue({ items: [person("a", { profilePublic: true, details: { subscriptionCount: 3, subscriberCount: 4, friendCount: 5 } })], nextCursor: null });
  renderPage("/ko/explore/athletes?q=rider");
  await screen.findByRole("link", { name: "rider-a" });
  expect(screen.queryByLabelText("구독 중 3")).not.toBeInTheDocument();
  expect(screen.getByLabelText("친구 5")).toBeInTheDocument();
});

it("appends the next page with the server cursor", async () => {
  search.mockResolvedValueOnce({ items: [person("a")], nextCursor: "c1" }).mockResolvedValueOnce({ items: [person("b")], nextCursor: null });
  renderPage("/ko/explore/athletes?q=rider");
  await userEvent.click(await screen.findByTestId("E5-2-4"));
  expect(await screen.findByRole("link", { name: "rider-b" })).toBeInTheDocument();
  expect(search).toHaveBeenLastCalledWith("rider", "c1");
  expect(screen.getByRole("link", { name: "rider-a" })).toBeInTheDocument();
  expect(screen.queryByTestId("E5-2-4")).not.toBeInTheDocument();
});

it.each([
  ["functions/unauthenticated", "로그인한 뒤 검색할 수 있어요."],
  ["functions/invalid-argument", "검색어를 1~100자로 입력해 주세요."],
  ["functions/resource-exhausted", "검색을 너무 자주 했어요. 잠시 후 다시 시도해 주세요."],
  ["functions/internal", "검색하지 못했어요. 잠시 후 다시 시도해 주세요."],
])("shows a friendly message for %s", async (code, message) => {
  search.mockRejectedValue(Object.assign(new Error(code), { code }));
  renderPage("/ko/explore/athletes?q=rider");
  expect(await screen.findByTestId("E5.error")).toHaveTextContent(message);
});

it("toasts a rate-limit failure while loading more and keeps existing rows", async () => {
  search.mockResolvedValueOnce({ items: [person("a")], nextCursor: "c1" })
    .mockRejectedValueOnce(Object.assign(new Error("limit"), { code: "functions/resource-exhausted" }));
  renderPage("/ko/explore/athletes?q=rider");
  await userEvent.click(await screen.findByTestId("E5-2-4"));
  expect(await screen.findByText("검색을 너무 자주 했어요. 잠시 후 다시 시도해 주세요.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "rider-a" })).toBeInTheDocument();
  expect(screen.getByTestId("E5-2-4")).toBeEnabled();
});
