import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { WebSocket } from "undici";

test("브라우저가 로컬 월드 이벤트를 구독하고 범위 이탈 시 마커를 제거한다", async ({ page }) => {
  test.skip(process.env.WORLD_LOCAL_WEB_POLICY === "1", "fixture authentication mode");
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:19099";
  const admin = initializeApp({ projectId: "demo-orider-world" }, "world-" + randomUUID());
  const auth = getAuth(admin);
  const eventId = "browser-" + randomUUID();
  const password = randomUUID();
  const create = async (role: "rider" | "public-viewer", publicRider = false) => {
    const email = randomUUID() + "@example.test";
    const { uid } = await auth.createUser({ email, password });
    await auth.setCustomUserClaims(uid, {
      worldKind: "app", worldVisibility: "everyone", worldEvents: { [eventId]: role },
      worldEventId: role === "rider" ? eventId : null, worldEventPublic: publicRider, worldPublicBib: publicRider ? 42 : 99,
    });
    return { email, uid };
  };
  const [rider, hidden, viewer] = await Promise.all([create("rider", true), create("rider"), create("public-viewer")]);
  const riders: WebSocket[] = [];
  try {
    await page.addInitScript(({ email, password }) => {
      Object.defineProperty(window, "__worldFixtureCredentials", {
        value: { email, password }, configurable: true,
      });
    }, { email: viewer.email, password });
    await page.goto("/e2e/fixtures/ride-world.html?event=" + eventId);
    for (const [kind, identity] of [["virtual", rider], ["outdoor", hidden]] as const) {
      const response = await page.request.post(
        "http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",
        { data: { email: identity.email, password, returnSecureToken: true } },
      );
      expect(response.ok()).toBe(true);
      const { idToken } = await response.json();
      // Use the browser-independent publisher. The viewer uses the actual Firebase
      // client SDK and React hook in Chromium.
      const socket = new WebSocket("ws://127.0.0.1:18766/world", { headers: { Authorization: "Bearer " + idToken } });
      riders.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener("error", reject, { once: true });
        socket.addEventListener("open", () => socket.send(JSON.stringify({ v: 1, type: "join", kind })), { once: true });
        socket.addEventListener("message", ({ data }) => {
          const frame = JSON.parse(String(data));
          if (frame.type !== "ready") return;
          socket.send(JSON.stringify({ v: 1, type: "fix", sessionId: frame.sessionId, seq: 1,
            lat: 37.55, lon: 126.99, speedMps: 5, status: "riding", visibility: "everyone", capturedAt: Date.now() }));
          resolve();
        });
      });
    }
    await expect(page.getByTestId("markers")).toHaveText("가상 RIDING 18 km/h");
    await expect(page.getByTestId("roster")).toHaveText("[]");
    const viewport = page.getByRole("button", { name: "구간 이동" });
    await viewport.click();
    await expect(page.getByTestId("markers")).toBeEmpty();
    const track = page.getByRole("textbox", { name: "공개 배번" });
    await track.fill("42");
    await expect(page.getByTestId("markers")).toHaveText("가상 RIDING 18 km/h");
    await track.fill("99");
    await expect(page.getByTestId("markers")).toBeEmpty();
    await viewport.click();
    await expect(page.getByTestId("markers")).toHaveText("가상 RIDING 18 km/h");
    await page.getByRole("textbox", { name: "이벤트" }).fill("unrelated");
    await expect(page.getByTestId("markers")).toBeEmpty();
  } finally {
    riders.forEach((rider) => rider.close());
    await auth.deleteUsers([rider.uid, hidden.uid, viewer.uid]);
    await deleteApp(admin);
  }
});

test("브라우저가 회원 권한으로 모임 준비와 출발·종료 신호를 받는다", async ({ page }) => {
  test.skip(process.env.WORLD_LOCAL_WEB_POLICY !== "1", "Firestore emulator policy mode");
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:19099";
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:19094";
  const admin = initializeApp({ projectId: "demo-orider-world" }, "world-prep-" + randomUUID());
  const auth = getAuth(admin);
  const db = getFirestore(admin);
  const email = randomUUID() + "@example.test";
  const password = randomUUID();
  const { uid } = await auth.createUser({ email, password });
  const eventId = "event-" + randomUUID();
  const groupId = "group-" + randomUUID();
  const event = db.doc(`events/${eventId}`);
  const preparation = event.collection("meeting_snapshot_signals").doc("latest");
  const group = db.doc(`groups/${groupId}`);
  const member = group.collection("members").doc(uid);
  const profile = db.doc(`users/${uid}`);
  try {
    await Promise.all([
      profile.set({ locationVisibility: "EVERYONE" }),
      group.set({ isActive: true }),
      member.set({ status: "active" }),
      event.set({ info: { status: "OPEN", kind: "CLUB_MEETING", groupId } }),
    ]);
    await page.addInitScript(({ email, password }) => {
      Object.defineProperty(window, "__worldFixtureCredentials", {
        value: { email, password }, configurable: true,
      });
    }, { email, password });
    await page.goto("/e2e/fixtures/ride-world.html?view=prep&event=" + eventId);
    await expect(page.getByTestId("meeting-phase")).toHaveText("OPEN");
    const updatedAt = Timestamp.now();
    await preparation.set({ updatedAt });
    await expect(page.getByTestId("meeting-version")).toHaveText(`${updatedAt.seconds}:${updatedAt.nanoseconds}`);
    await event.update({ "info.status": "LIVE" });
    await expect(page.getByTestId("meeting-phase")).toHaveText("LIVE");
    await event.update({ "info.status": "FINISHED" });
    await expect(page.getByTestId("meeting-phase")).toHaveText("FINISHED");
    await expect(page.getByTestId("markers")).toBeEmpty();
  } finally {
    await Promise.all([profile.delete(), preparation.delete(), event.delete(), member.delete(), group.delete(), auth.deleteUser(uid)]);
    await deleteApp(admin);
  }
});

test("익명 관전은 공개 이벤트의 합의된 배번만 받고 공개 철회 시 종료된다", async ({ page }) => {
  test.skip(process.env.WORLD_LOCAL_WEB_POLICY !== "1", "Firestore emulator policy mode");
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:19099";
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:19094";
  const admin = initializeApp({ projectId: "demo-orider-world" }, "world-guest-" + randomUUID());
  const auth = getAuth(admin);
  const db = getFirestore(admin);
  const eventId = "guest-" + randomUUID();
  const email = randomUUID() + "@example.test";
  const password = randomUUID();
  const { uid } = await auth.createUser({ email, password });
  const event = db.doc(`events/${eventId}`);
  const profile = db.doc(`users/${uid}`);
  const participant = event.collection("participants").doc(uid);
  const lease = event.collection("location_leases").doc(uid);
  const location = event.collection("locations").doc(uid);
  let publisher: WebSocket | undefined;
  try {
    await Promise.all([
      profile.set({ locationVisibility: "EVERYONE" }),
      event.set({ info: { status: "LIVE", type: "GRANFONDO", visibility: "PUBLIC" } }),
      participant.set({ status: "RIDING", rideClaimVersion: 3, rideSessionId: "ride-1", bibNumber: 42 }),
      lease.set({ state: "active", fenceVersion: 1, rideSessionId: "ride-1", sessionId: "device-1",
        expiresAt: Timestamp.fromMillis(Date.now() + 30000) }),
      auth.setCustomUserClaims(uid, {
        worldEventId: eventId, worldEvents: { [eventId]: "rider" }, worldEventPublic: true,
        worldRideSessionId: "ride-1", worldDeviceSessionId: "device-1",
      }),
    ]);
    await page.goto("/e2e/fixtures/ride-world.html?view=guest&event=" + eventId);
    const signIn = await page.request.post("http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",
      { data: { email, password, returnSecureToken: true } });
    const { idToken } = await signIn.json();
    const socket = new WebSocket("ws://127.0.0.1:19466/world", { headers: { Authorization: "Bearer " + idToken } });
    publisher = socket;
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("error", reject, { once: true });
      socket.addEventListener("open", () => socket.send(JSON.stringify({ v: 1, type: "join", kind: "outdoor" })));
      socket.addEventListener("message", ({ data }) => {
        const frame = JSON.parse(String(data));
        if (frame.type !== "ready") return;
        socket.send(JSON.stringify({ v: 1, type: "fix", sessionId: frame.sessionId, seq: 1, capturedAt: Date.now(),
          lat: 37.55, lon: 126.99, status: "riding", visibility: "everyone", speedMps: 5 }));
        resolve();
      });
    });
    await expect(page.getByTestId("markers")).toHaveText("실외 RIDING 18 km/h");
    await expect(page.getByTestId("roster")).toHaveText("[]");
    await event.update({ "info.visibility": "PRIVATE" });
    await expect(page.getByTestId("markers")).toBeEmpty();
  } finally {
    publisher?.close();
    await Promise.all([event.delete(), profile.delete(), participant.delete(), location.delete(), lease.delete(), auth.deleteUser(uid)]);
    await deleteApp(admin);
  }
});
