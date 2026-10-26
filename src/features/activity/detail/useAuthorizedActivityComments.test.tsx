import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ActivityPublicAccessState } from "./ActivityPublicAccess";
import { useAuthorizedActivityComments } from "./useAuthorizedActivityComments";
function access(id: string, client: object, comments = [{ id: "comment", text: "current" }]) {
  return { model: { activity: { id } }, session: { client, detail: { content: { comments } }, revokeAccess: vi.fn() } } as unknown as ActivityPublicAccessState;
}
describe("authorized comments controller", () => {
  it("keeps an empty intermediate page resumable and deduplicates later comments", async () => {
    const client = { comments: vi.fn().mockResolvedValueOnce({ comments: [], nextCursor: "next" }).mockResolvedValueOnce({ comments: [{ id: "c", text: "one" }, { id: "c", text: "one" }], nextCursor: null }) };
    const input = access("activity", client);
    const { result } = renderHook(() => useAuthorizedActivityComments(input));
    await act(async () => result.current.load());
    expect(result.current.canLoad).toBe(true);
    await act(async () => result.current.load());
    expect(client.comments).toHaveBeenLastCalledWith("activity", "next");
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.canLoad).toBe(false);
  });
  it("ignores a previous activity delete rejection after switching client/session", async () => {
    let reject!: (reason: unknown) => void;
    const first = access("a", { deleteComment: vi.fn(() => new Promise((_resolve, fail) => { reject = fail; })) });
    const second = access("b", { deleteComment: vi.fn() }, [{ id: "b-comment", text: "new session" }]);
    const { result, rerender } = renderHook(({ input }) => useAuthorizedActivityComments(input), { initialProps: { input: first } });
    let pending!: Promise<void>;
    act(() => { pending = result.current.mutate("delete", "comment"); });
    rerender({ input: second });
    await act(async () => { reject({ code: "permission-denied" }); await pending; });
    expect(result.current.rows.map(row => row.text)).toEqual(["new session"]);
    expect(second.session.revokeAccess).not.toHaveBeenCalled();
    expect(result.current.failed).toBe(false);
    expect(result.current.busy).toBe(false);
  });
});
