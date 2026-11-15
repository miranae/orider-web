import { collection, doc } from "firebase/firestore";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { auth, firestore, functions, initFirebase } from "../services/firebase";
import { setDocData, setCallableImplementation, simulateLogin } from "../__tests__/mocks/firebase";
import type { EmbeddedBridge, HostBridgeEnvelope } from "./bridge";
import EmbeddedBootstrapRoot from "./EmbeddedBootstrapRoot";

const isolated = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null, authStateReady: vi.fn().mockResolvedValue(undefined) },
  firestore: { instance: "embedded-only" }, functions: { app: { name: "embedded-only" } },
  ordinaryInit: vi.fn(),
}));
// Keep shared SDK network fakes, but remove the ordinary app that otherwise hides missing injection.
vi.mock("../services/firebase", async importOriginal => ({
  ...await importOriginal<object>(), auth: undefined, firestore: undefined, functions: undefined,
  initFirebase: isolated.ordinaryInit,
}));
vi.mock("./embeddedFirebase", () => ({
  initEmbeddedFirebase: () => ({ app: {}, auth: isolated.auth, firestore: isolated.firestore, functions: isolated.functions }),
  ensureEmbeddedAppCheckReady: vi.fn().mockResolvedValue(undefined), getEmbeddedAppCheckToken: vi.fn().mockResolvedValue("embedded-token"),
  embeddedAccountReady: () => true, embeddedAuthPersistsSession: () => false,
  embeddedFirestoreOwnerUid: () => null, getEmbeddedFirestore: () => isolated.firestore,
  isolateEmbeddedAccount: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/appHandoff", () => ({ consumeAppHandoffCode: vi.fn().mockResolvedValue(undefined) }));


it("opens meetings, the real creation form, news and back without replacing the embedded session", async () => {
  simulateLogin({ uid: "owner-1" });
  isolated.auth.currentUser = { uid: "owner-1" };
  setDocData("groups/club-lara", { name: "One coherent club", creatorId: "another-host", memberCount: 3, description: "Club introduction", sports: ["bike"], visibility: "public" });
  setDocData("groups/club-lara/members/owner-1", { role: "member", status: "active" });
  setCallableImplementation("listVisibleEventEnvelopes", () => ({ data: { rows: [], nextCursor: null } }));
  setCallableImplementation("listClubMeetings", () => ({ data: { meetings: [], nextCursor: null } }));
  setCallableImplementation("getClubCafeSchedule", () => ({ data: { schedule: { source: "naver-cafe", cafeUrl: "https://cafe.naver.com/clublara", syncedAt: Date.now(), undatedCount: 0, truncated: false, entries: [{ id: "fixture-cafe", title: "Isolated cafe schedule", dates: ["2099-11-15"], boardId: 4, boardName: "번개", author: "Fixture author", commentCount: 0, url: "https://cafe.naver.com/clublara/123", closed: false, cancelled: false }] } } }));
  setCallableImplementation("listMyGroupSummaries", () => ({ data: { groups: [] } }));
  const listeners = new Set<(message: HostBridgeEnvelope) => void>();
  const send = vi.fn(), dispose = vi.fn();
  const bridge: EmbeddedBridge = { send, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, dispose };
  const factory = vi.fn(() => bridge);
  const emit = (type: HostBridgeEnvelope["type"], payload: unknown) => act(async () => {
    for (const listener of listeners) listener({ version: 1, type, payload });
  });
  function Back() { const navigate = useNavigate(); return <button onClick={() => navigate(-1)}>Browser back</button>; }
  const view = render(<MemoryRouter initialEntries={["/ko/embed/clubs/club-lara"]}><Back /><Routes>
    <Route path="/:lang/embed/clubs/:groupId/*" element={<EmbeddedBootstrapRoot bridgeFactory={factory} surfaceKind="club-detail" />} />
  </Routes></MemoryRouter>);
  await waitFor(() => expect(send.mock.calls.some(([type]) => type === "bootstrap.ready")).toBe(true));
  await emit("host.authorize", { expectedUid: "owner-1", contractVersion: 1 });
  await waitFor(() => expect(send).toHaveBeenCalledWith("auth.state", { uid: "owner-1" }, undefined));
  await emit("host.sessionAccepted", { theme: { mode: "light" }, locale: "ko", safeInsets: { top: 0, bottom: 0 } });
  const create = await screen.findByRole("link", { name: "모임 만들기" });
  await screen.findByText("Isolated cafe schedule");
  expect(screen.getAllByRole("link", { name: "모임 만들기" })).toHaveLength(1);
  expect(screen.getByRole("link", { name: "모임", exact: true })).toHaveAttribute("aria-current", "page");
  fireEvent.click(create);
  await screen.findByRole("heading", { name: "모임 준비하기" });
  expect(screen.queryByRole("link", { name: "모임 만들기" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "← 모임 목록" })).toHaveAttribute("href", "/ko/embed/clubs/club-lara");
  await emit("host.themeChanged", { mode: "dark" });
  expect(document.documentElement.dataset.theme).toBe("dark");
  fireEvent.click(screen.getByRole("button", { name: "닫기", exact: true }));
  await screen.findByRole("link", { name: "모임 만들기" });
  fireEvent.click(screen.getByRole("link", { name: "소식", exact: true }));
  await screen.findByText("Club introduction");
  expect(screen.getByRole("link", { name: "소식", exact: true })).toHaveAttribute("aria-current", "page");
  fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
  await screen.findByRole("link", { name: "모임 만들기" });
  expect(dispose).not.toHaveBeenCalled();
  expect(factory).toHaveBeenCalledTimes(1);
  expect(isolated.auth.currentUser?.uid).toBe("owner-1");
  expect(send.mock.calls.some(([type]) => type === "navigation.openNative" || type === "navigation.openExternal")).toBe(false);
  const factories = vi.mocked(httpsCallable).mock.calls.filter(([, name]) => ["listVisibleEventEnvelopes", "listClubMeetings", "getClubCafeSchedule"].includes(name));
  expect(factories.some(([, name]) => name === "getClubCafeSchedule")).toBe(true);
  expect(factories.length).toBeGreaterThan(0);
  for (const [instance] of factories) expect(instance).toBe(isolated.functions);
  expect(auth).toBeUndefined(); expect(firestore).toBeUndefined(); expect(functions).toBeUndefined();
  expect(initFirebase).not.toHaveBeenCalled();
  view.unmount();
  expect(dispose).toHaveBeenCalledTimes(1);
});
