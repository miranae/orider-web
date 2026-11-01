// Synthetic fixture only. Fixed loopback demo project; no ADC or remote access.
const project = "demo-orider-onboarding";
const auth = "http://127.0.0.1:19299/identitytoolkit.googleapis.com/v1";
const email = "beginner@onboarding.local";
const password = "LocalReviewOnly1400!";
let response = await fetch(`${auth}/accounts:signUp?key=fake-local-key`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password, returnSecureToken: true }),
});
if (!response.ok) response = await fetch(`${auth}/accounts:signInWithPassword?key=fake-local-key`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
});
if (!response.ok) throw new Error(`Local auth failed: ${response.status}`);
const { localId } = await response.json();
const fields = { nickname: { stringValue: "처음 시작하는 운동" }, locale: { stringValue: "ko" },
  units: { stringValue: "metric" }, timezone: { stringValue: "Asia/Seoul" },
  onboardingStep: { stringValue: "done" }, defaultVisibility: { stringValue: "private" }, createdAt: { integerValue: String(Date.now()) } };
const saved = await fetch(`http://127.0.0.1:18280/v1/projects/${project}/databases/(default)/documents/users/${localId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" }, body: JSON.stringify({ fields }),
});
if (!saved.ok) throw new Error(`Local profile failed: ${saved.status}`);
console.log("Local synthetic beginner account is ready.");
