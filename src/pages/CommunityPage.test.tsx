import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation, useSearchParams } from "react-router-dom";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import CommunityPage from "./CommunityPage";
import { searchUsers } from "../services/userSearch";
import { listFriendSuggestions, type FriendSuggestion } from "../services/friendSuggestions";
import { sendFriendRequest } from "../hooks/useFriends";

const friendsState = vi.hoisted(() => ({
  friends: [] as { userId: string }[],
  requests: [] as { requesterId: string }[],
  sentRequests: [] as { targetId: string }[],
  acceptRequest: vi.fn(),
  cancelRequest: vi.fn(),
}));
vi.mock("../services/userSearch", async importOriginal => ({ ...await importOriginal<typeof import("../services/userSearch")>(), searchUsers: vi.fn() }));
vi.mock("../services/friendSuggestions", async importOriginal => ({ ...await importOriginal<typeof import("../services/friendSuggestions")>(), listFriendSuggestions: vi.fn() }));
vi.mock("../hooks/useFriends", () => ({ useFriends: () => friendsState, sendFriendRequest: vi.fn() }));
vi.mock("../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: async () => true, alert: async () => undefined, prompt: async () => null }) }));
vi.mock("./BoardPage", () => ({
  default: function MockBoard({ community }: { community?: boolean }) {
    const [params] = useSearchParams();
    return <div data-testid="board" data-community={String(!!community)} data-query={params.get("q") ?? ""} data-type={params.get("type") ?? ""} />;
  },
}));

const search = vi.mocked(searchUsers);
const suggestions = vi.mocked(listFriendSuggestions);
const send = vi.mocked(sendFriendRequest);
const suggestion = (uid: string, overrides: Partial<FriendSuggestion> = {}): FriendSuggestion =>
  ({ uid, nickname: `rider-${uid}`, profileImageUrl: null, coRideCount: 0, clubNames: [], ...overrides });
function Location() { const location = useLocation(); return <output data-testid="location">{location.search}</output>; }
const renderPage = (route = "/ko/embed/explore?hubPage=community", options: Parameters<typeof renderWithProviders>[1] = { authenticated: true }) =>
  renderWithProviders(<><CommunityPage /><Location /></>, { route, ...options });

beforeEach(() => {
  search.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  suggestions.mockReset().mockResolvedValue([]);
  send.mockReset().mockResolvedValue(undefined);
  friendsState.friends = []; friendsState.requests = []; friendsState.sentRequests = [];
});

it("shows one search box, the suggestion row and the community board list without a query", async () => {
  suggestions.mockResolvedValue([
    suggestion("a", { coRideCount: 12, clubNames: ["한강"] }),
    suggestion("b", { clubNames: ["한강"] }),
  ]);
  renderPage();
  expect(screen.getByPlaceholderText("라이더 · 글 검색")).toBeInTheDocument();
  const row = await screen.findByTestId("community-suggestions");
  expect(within(row).getByRole("heading", { name: "친구 찾기" })).toBeInTheDocument();
  const cards = within(row).getAllByTestId("community-suggestion");
  expect(cards[0]).toHaveTextContent("rider-a");
  expect(cards[0]).toHaveTextContent("함께 12회");
  expect(cards[1]).toHaveTextContent("같은 클럽");
  expect(screen.getByTestId("board")).toHaveAttribute("data-community", "true");
  expect(search).not.toHaveBeenCalled();
});

it("sends a friend request from a suggestion card and marks it sent", async () => {
  suggestions.mockResolvedValue([suggestion("a", { coRideCount: 2 })]);
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: "rider-a님에게 친구 요청" }));
  await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ uid: "test-uid" }), "a", expect.anything()));
  expect(within(screen.getByTestId("community-suggestion")).getByRole("button", { name: "보냄" })).toBeDisabled();
});

it.each([
  ["an empty list", () => suggestions.mockResolvedValue([])],
  ["only existing friends", () => { friendsState.friends = [{ userId: "a" }]; suggestions.mockResolvedValue([suggestion("a")]); }],
])("hides the whole suggestion row for %s", async (_label, arrange) => {
  arrange();
  renderPage();
  await waitFor(() => expect(suggestions).toHaveBeenCalled());
  expect(screen.queryByTestId("community-suggestions")).toBeNull();
  expect(screen.queryByText("친구 찾기")).toBeNull();
  expect(screen.getByTestId("board")).toBeInTheDocument();
});

it("hides the suggestion row for guests without calling the server", async () => {
  renderPage(undefined, { authenticated: false });
  expect(await screen.findByTestId("board")).toBeInTheDocument();
  expect(screen.queryByTestId("community-suggestions")).toBeNull();
});

it("shows rider and post groups for a query and keeps board queries such as type", async () => {
  renderPage("/ko/embed/explore?hubPage=community&q=moon&type=inquiry");
  expect(await screen.findByRole("heading", { name: "라이더" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "글" })).toBeInTheDocument();
  await waitFor(() => expect(search).toHaveBeenCalledWith("moon", null, expect.anything()));
  expect(screen.getByTestId("board")).toHaveAttribute("data-query", "moon");
  expect(screen.getByTestId("board")).toHaveAttribute("data-type", "inquiry");
  expect(screen.queryByTestId("community-suggestions")).toBeNull();
  expect(suggestions).not.toHaveBeenCalled();
});

it("submits the search to the URL, resets the board page and clears it with an empty query", async () => {
  renderPage("/ko/embed/explore?hubPage=community&page=3");
  const input = screen.getByPlaceholderText("라이더 · 글 검색");
  await userEvent.type(input, "kim{Enter}");
  expect(screen.getByTestId("location")).toHaveTextContent("?hubPage=community&q=kim");
  await userEvent.clear(input);
  await userEvent.keyboard("{Enter}");
  expect(screen.getByTestId("location")).toHaveTextContent(/^\?hubPage=community$/);
});

it("shows only the post group to guests searching", async () => {
  renderPage("/ko/embed/explore?hubPage=community&q=moon", { authenticated: false });
  expect(await screen.findByRole("heading", { name: "글" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "라이더" })).toBeNull();
  expect(search).not.toHaveBeenCalled();
});
