import { beforeEach, describe, expect, it, vi } from "vitest";
import { doc, getDoc, type Firestore } from "firebase/firestore";
import { getPublicUserProfiles } from "./publicProfiles";

describe("getPublicUserProfiles", () => {
  beforeEach(() => {
    vi.mocked(getDoc).mockReset();
  });

  it("keeps readable profiles when one public profile read is denied", async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ nickname: "Visible Rider", photoURL: "https://example.com/visible.jpg" }),
        id: "visible-user",
      } as Awaited<ReturnType<typeof getDoc>>)
      .mockRejectedValueOnce(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));

    const profiles = await getPublicUserProfiles(["visible-user", "legacy-user"]);

    expect(profiles.get("visible-user")?.photoURL).toBe("https://example.com/visible.jpg");
    expect(profiles.has("legacy-user")).toBe(false);
  });

  it("still rejects unexpected profile read failures", async () => {
    const err = new Error("network down");
    vi.mocked(getDoc).mockRejectedValueOnce(err);

    await expect(getPublicUserProfiles(["user-1"])).rejects.toBe(err);
  });
});

it("reads profile batches from the explicitly injected Firestore instance", async () => {
  const database = { app: { name: "isolated" } } as unknown as Firestore;
  vi.mocked(getDoc).mockReset().mockResolvedValueOnce({ exists: () => true, id: "named-rider", data: () => ({ nickname: "Named rider" }) } as Awaited<ReturnType<typeof getDoc>>);
  const rows = await getPublicUserProfiles(["named-rider"], database);
  expect(rows.get("named-rider")?.nickname).toBe("Named rider");
  expect(doc).toHaveBeenLastCalledWith(database, "users_public", "named-rider");
});
