import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { OwnerDetailReadFallback } from "./OwnerDetailReadFallback";
const m = vi.hoisted(() => ({ user: { uid: "owner", isAnonymous: false }, services: { auth: { currentUser: null as unknown } }, load: vi.fn(), factory: vi.fn() }));
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ user: m.user }) }));
vi.mock("../../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => m.services }));
vi.mock("../../../services/publicActivityDetail", () => ({ createPublicActivityClient: (...args: unknown[]) => { m.factory(...args); return { load: m.load }; } }));
const detail = { activity: { id: "a", userId: "owner" }, metrics: { version: 1, avgPower: 123 } };
function view(error: unknown, id = "a") { return <OwnerDetailReadFallback activityId={id} error={error} fallback={<p>original retry</p>}>{data => <p>saved {String(data.metrics?.avgPower)}</p>}</OwnerDetailReadFallback>; }
beforeEach(() => { vi.clearAllMocks(); m.user = { uid: "owner", isAnonymous: false }; m.services.auth.currentUser = m.user; m.load.mockResolvedValue(detail); });
it.each(["unavailable", "deadline-exceeded"])("recovers %s with the unchanged saved result and a short budget", async code => {
 render(view({ code })); await screen.findByText("saved 123"); expect(m.load).toHaveBeenCalledTimes(1);
 expect(m.factory.mock.calls[0][1]).toMatchObject({ timeoutMs: 3000 });
});
it.each(["permission-denied", "not-found", "unauthenticated", "internal"])("does not fallback for %s", async code => {
 render(view({ code })); expect(screen.getByText("original retry")).toBeTruthy(); expect(m.load).not.toHaveBeenCalled();
});
it("keeps original retry when the ACL getter fails", async () => {
 m.load.mockRejectedValue({ code: "functions/permission-denied" }); render(view({ code: "unavailable" }));
 await waitFor(() => expect(m.load).toHaveBeenCalledTimes(1)); expect(screen.queryByText("saved 123")).toBeNull(); expect(screen.getByText("original retry")).toBeTruthy();
});
it("does not treat an accessible different owner's activity as owner recovery", async () => {
 m.load.mockResolvedValue({ ...detail, activity: { id: "a", userId: "other" } }); render(view({ code: "unavailable" }));
 await waitFor(() => expect(m.load).toHaveBeenCalledTimes(1)); expect(screen.queryByText("saved 123")).toBeNull();
});
it("discards a same-UID SDK replacement and aborts the old request", async () => {
 let resolve!: (value: unknown) => void; m.load.mockReturnValue(new Promise(r => { resolve = r; }));
 const error = { code: "unavailable" }; const rendered = render(view(error)); const signal = m.factory.mock.calls[0][1].signal;
 m.services.auth.currentUser = { ...m.user }; rendered.rerender(view(error));
 await act(async () => resolve(detail)); expect(signal.aborted).toBe(true); expect(screen.queryByText("saved 123")).toBeNull();
});
it("aborts on navigation and never displays the previous activity", async () => {
 let resolve!: (value: unknown) => void; m.load.mockReturnValue(new Promise(r => { resolve = r; }));
 const rendered = render(view({ code: "unavailable" })); const signal = m.factory.mock.calls[0][1].signal;
 rendered.rerender(view({ code: "permission-denied" }, "b")); await act(async () => resolve(detail));
 expect(signal.aborted).toBe(true); expect(screen.queryByText("saved 123")).toBeNull();
});
