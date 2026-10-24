import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicClub, listPublicClubs, PublicClubUnavailable } from "./publicClubs";
const config = vi.hoisted(() => ({ publicClubApiUrl: "https://clubs.example/publicClubs" }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => config }));
const club = { id: "club", name: "Public club", description: "Introduction", approval: "auto", badge: "CL", sports: ["bike"], city: "용인" };
const request = vi.fn();
beforeEach(() => { request.mockReset(); vi.stubGlobal("fetch", request); config.publicClubApiUrl = "https://clubs.example/publicClubs"; });
afterEach(() => vi.unstubAllGlobals());
describe("public club HTTP boundary", () => {
  it("uses a bounded anonymous no-store request and retains pagination", async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ clubs: [club], nextCursor: "next" }), { status: 200 }));
    const page = await listPublicClubs({ searchText: " Public ", city: "용인", discipline: "bike" }, null);
    expect(page.items[0]?.name).toBe("Public club"); expect(page.cursor).toBe("next");
    const [url, options] = request.mock.calls[0];
    expect(url.searchParams.get("search")).toBe("Public"); expect(url.searchParams.get("size")).toBe("12");
    expect(options).toMatchObject({ cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
  });
  it("rejects extra private source fields rather than consuming a root document", async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ club: { ...club, creatorId: "PRIVATE_OWNER" } })));
    await expect(getPublicClub("club")).rejects.toThrow("Invalid public club response");
  });
  it("distinguishes withdrawn clubs and request failures from a valid empty directory", async () => {
    request.mockResolvedValueOnce(new Response("{}", { status: 404 }));
    await expect(getPublicClub("club")).rejects.toBeInstanceOf(PublicClubUnavailable);
    request.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    await expect(listPublicClubs({}, null)).rejects.toThrow("Public club request failed");
    request.mockResolvedValueOnce(new Response(JSON.stringify({ clubs: [], nextCursor: null })));
    expect((await listPublicClubs({}, null)).items).toEqual([]);
  });
  it("fails closed without an explicitly configured public API", async () => {
    config.publicClubApiUrl = "";
    await expect(getPublicClub("club")).rejects.toThrow("not configured");
    expect(request).not.toHaveBeenCalled();
  });
});
