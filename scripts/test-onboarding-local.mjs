import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const host = "http://127.0.0.1:5180";
const project = "demo-orider-onboarding";
assert.equal((await (await fetch(`${host}/runtime-config.json`)).json()).firebaseProjectId, project);
const identity = async () => {
  const r = await fetch("http://127.0.0.1:19299/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-local-key", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${randomUUID()}@onboarding.local`, password: "SyntheticOnly1400!", returnSecureToken: true }),
  });
  assert.equal(r.status, 200); return r.json();
};
const a = await identity(); const b = await identity();
const call = async (token, body, sport = "bike", origin) => {
  const r = await fetch(`${host}/__local/first-workout?sport=${sport}`, {
    method: body ? "POST" : "GET", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...(origin ? { Origin: origin } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, ...await r.json() };
};
const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 9 * 3600000 + 86400000).toISOString().slice(0, 10);
const reserve = { action: "reserve", date: today, key: randomUUID() };
assert.equal((await call(null)).status, 401);
assert.equal((await call(a.idToken, { ...reserve, date: "2026-02-30" })).status, 400);
assert.equal((await call(a.idToken, reserve, "swim")).status, 400);
assert.equal((await call(a.idToken, reserve, "bike", "https://example.invalid")).status, 403);
const parallel = await Promise.all([call(a.idToken, reserve), call(a.idToken, reserve)]);
assert.deepEqual(parallel.map(r => r.status), [200, 200]);
const workout = parallel[0].workout;
assert.equal(workout.id, parallel[1].workout.id);
assert.equal((await call(a.idToken, { ...reserve, key: randomUUID() })).status, 409);
assert.equal((await call(a.idToken, { ...reserve, key: randomUUID() }, "run")).error, "other-workout");
assert.equal((await call(b.idToken)).workout, null);
assert.equal((await call(a.idToken, { action: "move", id: workout.id, revision: 0, date: tomorrow })).status, 409);
const moved = await call(a.idToken, { action: "move", id: workout.id, revision: workout.revision, date: tomorrow });
assert.equal(moved.workout.date, tomorrow);
assert.equal((await call(a.idToken)).workout.date, tomorrow);
assert.equal((await call(b.idToken, { action: "cancel", id: workout.id, revision: moved.workout.revision })).status, 409);
assert.equal((await call(a.idToken, { action: "cancel", id: workout.id, revision: moved.workout.revision })).workout, null);
assert.equal((await call(a.idToken)).workout, null);
assert.equal((await call(a.idToken, { ...reserve, key: randomUUID() })).status, 200);
const goal = await fetch(`http://127.0.0.1:18280/v1/projects/${project}/databases/(default)/documents/goals/local-conflict-${randomUUID()}`, {
  method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
  body: JSON.stringify({ fields: { userId: { stringValue: b.localId }, status: { stringValue: "active" }, discipline: { stringValue: "run" } } }),
});
assert.equal(goal.status, 200);
assert.equal((await call(b.idToken, reserve)).error, "active-goal");
console.log("PASS: authentication, origin, date/sport validation, concurrent idempotency, account isolation, cross-sport/goal conflict, revision, reschedule, cancellation and rebooking.");
