import { httpsCallable } from "firebase/functions";
import { friendSuggestionReason, listFriendSuggestions, parseFriendSuggestions, type FriendSuggestion } from "./friendSuggestions";
import { logClientError } from "./errorLogger";

vi.mock("./errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => ({}), isFunctionsGatewayRuntime: () => false, isEmulatorRuntime: () => false }));

const callable = vi.mocked(httpsCallable);
const viewer = { uid: "me", isAnonymous: false };
function services(user: { uid: string; isAnonymous: boolean } | null = viewer) {
  return {
    auth: { currentUser: user } as never,
    functions: { app: {} } as never,
    ensureAppCheckReady: vi.fn(async () => undefined),
  };
}
const item = (overrides: Partial<FriendSuggestion> = {}): FriendSuggestion =>
  ({ uid: "u1", nickname: "라이더", profileImageUrl: null, coRideCount: 0, clubNames: [], ...overrides });

beforeEach(() => { callable.mockReset(); vi.mocked(logClientError).mockReset(); });

describe("friendSuggestionReason", () => {
  it("prefers the co-ride count, then a shared club, else no reason", () => {
    expect(friendSuggestionReason(item({ coRideCount: 3, clubNames: ["한강"] }))).toEqual({ kind: "coRide", count: 3 });
    expect(friendSuggestionReason(item({ clubNames: ["한강"] }))).toEqual({ kind: "club" });
    expect(friendSuggestionReason(item())).toBeNull();
  });
});

describe("parseFriendSuggestions", () => {
  it("keeps contract-shaped items and drops malformed or duplicate ones", () => {
    expect(parseFriendSuggestions({ items: [
      { uid: "a", nickname: " 문 ", profileImageUrl: "https://x/a.png", coRideCount: 2, clubNames: ["한강", 3, ""] },
      { uid: "a", nickname: "dup", profileImageUrl: null, coRideCount: 1, clubNames: [] },
      { uid: "../b", nickname: "bad" },
      { nickname: "no uid" },
      null,
      { uid: "c", nickname: 7, profileImageUrl: "", coRideCount: -1, clubNames: "x" },
    ] })).toEqual([
      { uid: "a", nickname: "문", profileImageUrl: "https://x/a.png", coRideCount: 2, clubNames: ["한강"] },
      { uid: "c", nickname: "", profileImageUrl: null, coRideCount: 0, clubNames: [] },
    ]);
    expect(parseFriendSuggestions(null)).toEqual([]);
    expect(parseFriendSuggestions({ items: "x" })).toEqual([]);
  });
});

describe("listFriendSuggestions", () => {
  it("does not call the server for guests or anonymous users", async () => {
    expect(await listFriendSuggestions(services(null))).toEqual([]);
    expect(await listFriendSuggestions(services({ uid: "anon", isAnonymous: true }))).toEqual([]);
    expect(callable).not.toHaveBeenCalled();
  });

  it("calls listFriendSuggestions with the limit and returns parsed items", async () => {
    const call = vi.fn(async () => ({ data: { items: [item({ uid: "x", coRideCount: 4 })] } }));
    callable.mockReturnValue(call as never);
    expect(await listFriendSuggestions(services(), 8)).toEqual([item({ uid: "x", coRideCount: 4 })]);
    expect(callable).toHaveBeenCalledWith(expect.anything(), "listFriendSuggestions", expect.anything());
    expect(call).toHaveBeenCalledWith({ limit: 8 });
  });

  it.each(["functions/not-found", "functions/internal", "functions/permission-denied"])("treats %s as an empty list", async code => {
    callable.mockReturnValue(vi.fn(async () => { throw Object.assign(new Error(code), { code }); }) as never);
    expect(await listFriendSuggestions(services())).toEqual([]);
    // 미배포(not-found·internal)는 기록하지 않고, 예상 밖 오류만 남긴다.
    expect(vi.mocked(logClientError).mock.calls.length).toBe(code.endsWith("permission-denied") ? 1 : 0);
  });
});
