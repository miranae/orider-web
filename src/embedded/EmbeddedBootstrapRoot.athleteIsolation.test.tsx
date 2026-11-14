import { collection, doc } from "firebase/firestore";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { auth, firestore, functions, initFirebase } from "../services/firebase";
import { setDocData, setCallableImplementation, simulateLogin } from "../__tests__/mocks/firebase";
import { createMockProfile } from "../__tests__/fixtures/mockData";
import type { EmbeddedBridge, HostBridgeEnvelope } from "./bridge";
import EmbeddedBootstrapRoot from "./EmbeddedBootstrapRoot";

const isolated = vi.hoisted(() => ({
  auth: { currentUser: null, authStateReady: vi.fn().mockResolvedValue(undefined) },
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

it("opens the real athlete surface and paginates with only the isolated Firebase app", async () => {
  simulateLogin(null);
  setDocData("users_public/rider-1", { ...createMockProfile(), nickname: "Isolated rider", profilePublic: true });
  let page = 0;
  setCallableImplementation("getPublicSegmentMetadata", () => ({ data: {
    items: [{ id: `segment-${page}`, name: page === 0 ? "First isolated segment" : "Next isolated segment", distance: 1000 }],
    cursor: page++ === 0 ? "next-page" : null, hasMore: page === 1,
  } }));
  const listeners = new Set<(message: HostBridgeEnvelope) => void>();
  const send = vi.fn();
  const bridge: EmbeddedBridge = { send, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, dispose: vi.fn() };
  const emit = (type: HostBridgeEnvelope["type"], payload: unknown) => act(async () => {
    for (const listener of listeners) listener({ version: 1, type, payload });
  });
  const docCalls = vi.mocked(doc).mock.calls.length, collectionCalls = vi.mocked(collection).mock.calls.length;
  render(<MemoryRouter initialEntries={["/ko/embed/athlete/rider-1"]}><Routes>
    <Route path="/:lang/embed/athlete/:userId/*" element={<EmbeddedBootstrapRoot bridgeFactory={() => bridge} surfaceKind="athlete-profile" />} />
  </Routes></MemoryRouter>);
  await waitFor(() => expect(send.mock.calls.some(([type]) => type === "bootstrap.ready")).toBe(true));
  await emit("host.authorize", { contractVersion: 1 });
  await waitFor(() => expect(send).toHaveBeenCalledWith("auth.state", { uid: null }, undefined));
  await emit("host.sessionAccepted", { theme: { mode: "light" }, locale: "ko", safeInsets: { top: 0, bottom: 0 } });
  await screen.findByText("Isolated rider");
  fireEvent.click(await screen.findByRole("tab", { name: "만든 구간", exact: true }));
  await screen.findAllByText("First isolated segment");
  fireEvent.click(screen.getByRole("button", { name: /더 보기|더보기/ }));
  await screen.findAllByText("Next isolated segment");
  const factories = vi.mocked(httpsCallable).mock.calls.filter(([, name]) => name === "getPublicSegmentMetadata");
  expect(factories).toHaveLength(2);
  for (const [instance] of factories) expect(instance).toBe(isolated.functions);
  expect(auth).toBeUndefined(); expect(firestore).toBeUndefined(); expect(functions).toBeUndefined();
  expect(initFirebase).not.toHaveBeenCalled();
  const reads = [...vi.mocked(doc).mock.calls.slice(docCalls), ...vi.mocked(collection).mock.calls.slice(collectionCalls)];
  expect(reads.length).toBeGreaterThan(0);
  for (const [instance] of reads) expect(instance).not.toBeUndefined();
  expect(send.mock.calls.some(([type]) => type === "surface.error")).toBe(false);
});
