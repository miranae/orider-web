import { collection, doc } from "firebase/firestore";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { ActivityDiscoveryItem } from "@shared/activity-discovery";
import { auth, firestore, functions, initFirebase } from "../services/firebase";
import { setDocData, setCallableImplementation, simulateLogout } from "../__tests__/mocks/firebase";
import { createMockProfile } from "../__tests__/fixtures/mockData";
import type { EmbeddedBridge, HostBridgeEnvelope } from "./bridge";
import EmbeddedBootstrapRoot from "./EmbeddedBootstrapRoot";

const isolated = vi.hoisted(() => ({
  auth: { currentUser: null, authStateReady: vi.fn().mockResolvedValue(undefined) },
  firestore: { instance: "embedded-only" }, functions: { app: { name: "embedded-only", options: { projectId: "embedded-project" } } },
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

// 앱 전체를 띄우는 통합 테스트라 단독으로도 3초 안팎 걸린다 — 게이트처럼 부하가 높을 때 기본 5초에 걸리지 않게 여유를 준다.
it("opens the real athlete surface and paginates with only the isolated Firebase app", async () => {
  simulateLogout();
  setDocData("users_public/rider-1", { ...createMockProfile(), nickname: "Isolated rider", profilePublic: true });
  const getOtherFunctions = vi.mocked(getFunctions).getMockImplementation()!;
  vi.mocked(getFunctions).mockImplementation((app, region) => app?.name === isolated.functions.app.name && region === "asia-northeast3"
    ? isolated.functions as unknown as ReturnType<typeof getFunctions>
    : getOtherFunctions(app, region));
  const discoveryItem = (id: string, description: string, source: "orider" | "strava" = "orider"): ActivityDiscoveryItem => ({
    viewerHasKudos: false, presentationRevision: "a".repeat(64),
    activity: { id, description, userId: "rider-1", nickname: "Isolated rider", profileImage: null,
      type: "Ride", discipline: "bike", source, startTime: 1, endTime: 600001, createdAt: 1, visibility: "everyone",
      photoCount: 0, kudosCount: 0, commentCount: 0, externalId: null, summary: { distance: 3000, ridingTimeMillis: 600000 },
      summarySource: "recorded", effectiveFacts: { source: "activity_metrics", status: "ready", inputRevision: "a", computedAt: 1,
        coverage: "partial_terminal", thresholdBasis: null, powerSource: null, metrics: { distanceKm: 3, durationSec: 600 } } },
    content: { status: "ready", memo: null, memoTruncated: false, photos: [], totalPhotoCount: 0, totalPhotoCountExact: true },
    mapPreview: { imageUrl: null, encodedPolyline: null },
  });
  const listCursors: (string | undefined)[] = [];
  const discovery = (request: unknown) => {
    const { cursor, order } = request as { cursor?: string; order?: string };
    if (order === "id_asc") return { data: {
      items: [discoveryItem("filter-inventory-ride", "Isolated Strava ride", "strava")],
      nextCursor: null, exhausted: true, scannedCount: 1, totalCount: null, expiresAt: Date.now() + 600_000,
      order, includesUndated: true, consistency: "current_authorized_seek_pages",
    } };
    listCursors.push(cursor);
    const next = Boolean(cursor);
    return { data: { items: [discoveryItem(next ? "second-ride" : "first-ride", next ? "Second isolated ride" : "First isolated ride")],
      nextCursor: next ? null : "ad1.signed", exhausted: next, scannedCount: 1, totalCount: null,
      expiresAt: Date.now() + 600_000, order: "startTime_desc", includesUndated: false, consistency: "current_authorized_seek_pages" } };
  };
  const requestRead = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (String(url).endsWith("/getActivityDiscovery")) {
      return Response.json({ result: discovery(JSON.parse(String(init?.body)).data).data });
    }
    return Response.json({ result: {
    schemaVersion: 1, ownerUid: "rider-1", epoch: "isolated-totals", state: "ready", revision: 1, count: 42,
    distance: 125_000, timeDisplayMillis: 3_600_000, elevation: 650,
    unknownDistanceCount: 0, unknownTimeCount: 0, unknownElevationCount: 0,
    } });
  });
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
  await screen.findByRole("heading", { name: "Isolated rider" });
  await screen.findByText("42회");
  const totalValues = [...screen.getByTestId("P0-1").querySelectorAll("strong")].map(value => value.textContent?.trim());
  expect(totalValues).toEqual(["42회", "125 km", expect.stringContaining("1"), "650 m"]);
  expect(requestRead).toHaveBeenCalledWith(expect.stringMatching(/embedded-project.*\/getPublicAthleteTotals$/), expect.objectContaining({
    credentials: "omit",
    headers: { "Content-Type": "application/json", "X-Firebase-AppCheck": "embedded-token" },
    body: JSON.stringify({ data: { userId: "rider-1" } }),
  }));
  expect(vi.mocked(httpsCallable).mock.calls.some(([, name]) => name === "getPublicAthleteTotals")).toBe(false);
  await screen.findByRole("link", { name: "First isolated ride" });
  fireEvent.click(screen.getByRole("button", { name: "더 보기", exact: true }));
  await screen.findByRole("link", { name: "Second isolated ride" });
  expect(requestRead).toHaveBeenCalledWith(expect.stringMatching(/embedded-project.*\/getActivityDiscovery$/), expect.objectContaining({
    credentials: "omit",
    headers: { "Content-Type": "application/json", "X-Firebase-AppCheck": "embedded-token" },
    body: expect.stringContaining("ad1.signed"),
  }));
  expect(listCursors[0]).toBeUndefined();
  expect(listCursors.filter(Boolean)).toEqual(["ad1.signed"]);
  expect(vi.mocked(httpsCallable).mock.calls.some(([, name]) => name === "getActivityDiscovery")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Strava", exact: true }));
  await screen.findByRole("link", { name: "Isolated Strava ride" });
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
  for (const [instance, ...segments] of reads) expect(instance, segments.join("/")).toBe(isolated.firestore);
  expect(send.mock.calls.some(([type]) => type === "surface.error")).toBe(false);
  requestRead.mockRestore();
}, 15000);
