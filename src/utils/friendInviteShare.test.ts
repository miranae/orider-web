import { describe, expect, it, vi } from "vitest";
import { buildFriendInviteUrl, shareFriendInvite } from "./friendInviteShare";

describe("friendInviteShare", () => {
  it("builds an absolute localized invite URL", () => {
    expect(buildFriendInviteUrl("https://orider.app/", "en", "AB C")).toBe("https://orider.app/en/friend/AB%20C");
  });

  it("uses Web Share with a privacy-minimal payload", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const clipboard = { writeText: vi.fn() } as unknown as Clipboard;
    const payload = { title: "Invite", text: "Join", url: "https://orider.app/ko/friend/code" };
    await expect(shareFriendInvite(payload, { share, clipboard })).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith(payload);
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard when Web Share is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(shareFriendInvite({ text: "Join", url: "https://example.test/invite" }, { share: undefined, clipboard: { writeText } as unknown as Clipboard })).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("Join\nhttps://example.test/invite");
  });

  it("treats AbortError as a quiet cancellation", async () => {
    const share = vi.fn().mockRejectedValue({ name: "AbortError" });
    await expect(shareFriendInvite({}, { share, clipboard: { writeText: vi.fn() } as unknown as Clipboard })).resolves.toBe("cancelled");
  });
});
