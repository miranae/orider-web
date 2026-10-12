import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Auth } from "firebase/auth";
import { createStageQaAppCheckSession, extractStageQaGrant, assertStageQaConfig } from "./stageQaAppCheck";
const mocks = vi.hoisted(() => ({ observer: null as null | ((value: unknown) => void), config: {} as Record<string,unknown> }));
vi.mock("./runtimeConfig",()=>({getRuntimeConfig:()=>mocks.config}));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: vi.fn((_auth, observer) => { mocks.observer = observer; observer(_auth.currentUser); return () => {}; }) }));
vi.mock("firebase/app-check", () => ({ CustomProvider: class { constructor(readonly options: { getToken: () => Promise<unknown> }) {} } }));
const handle = "A".repeat(43);
function setup() {
 let now = 2000;
 const identity = { token: "native.token.jwt", claims: { impersonated: true, impersonatedBy: "operator", auth_time: 1 } };
 const user = { uid: "owner", isAnonymous: false, getIdTokenResult: vi.fn(async () => identity) };
 const auth = { currentUser: user, authStateReady: vi.fn(async () => {}) };
 const body = { version: 1, token: "a.b.c", targetUid: "owner", delegatedBy: "operator", sessionExpiresAtMillis: 301000, tokenExpiresAtMillis: 1801000 };
 const transport = vi.fn(async (..._args: unknown[]) => ({ ok: true, json: async () => body }));
 const session = createStageQaAppCheckSession(auth as unknown as Auth, handle, transport as unknown as typeof fetch, () => now);
 const getToken = () => (session.provider as unknown as { options: { getToken: () => Promise<unknown> } }).options.getToken();
 return { identity, user, auth, body, transport, session, getToken, setNow: (value: number) => { now = value; } };
}
beforeEach(() => { mocks.observer = null; });
describe("Stage QA fragment", () => {
 it("strips grant preserving other fragments and rejects query/duplicates", () => {
  const good = extractStageQaGrant(new URL(`https://example.test/ko/#anchor&stageQaAppCheckGrant=${handle}&handoff=other`));
  expect(good.handle).toBe(handle); expect(good.url).toBe("https://example.test/ko/#anchor&handoff=other");
  for (const text of [`?stageQaAppCheckGrant=${handle}`, `#stageQaAppCheckGrant=${handle}&stageQaAppCheckGrant=${handle}`, "#stageQaAppCheckGrant=short"]) {
   const r = extractStageQaGrant(new URL(`https://example.test/${text}`)); expect(r.requested).toBe(true); expect(r.handle).toBeNull(); expect(r.url).not.toContain("stageQaAppCheckGrant");
  }
 });
});
describe("native delegated QA provider", () => {
 it("consumes exactly once using native ID token and forces first SDK refresh", async () => {
  const s = setup(); expect(s.session.forceInitialRefresh()).toBe(true); expect(s.session.forceInitialRefresh()).toBe(false);
  expect(await s.getToken()).toEqual({ token: "a.b.c", expireTimeMillis: 301000 }); expect(await s.getToken()).toEqual({ token: "a.b.c", expireTimeMillis: 301000 });
  expect(s.transport).toHaveBeenCalledTimes(1); expect(s.transport.mock.calls[0]?.[0]).toBe("https://asia-northeast3-orider-dev.cloudfunctions.net/consumeStageDelegatedQaAppCheckGrant");
 });
 it("rejects expiry even with memoized provider token", async () => {const s=setup();await s.getToken();s.setNow(301000);await expect(s.getToken()).rejects.toThrow();expect(s.transport).toHaveBeenCalledTimes(1);});
 it("rejects logout/login ABA with same user", async () => {const s=setup();await s.getToken();mocks.observer!(null);mocks.observer!(s.user);await expect(s.session.validate()).rejects.toThrow();});
 it("rejects current user change without waiting for auth observer",async()=>{const s=setup();await s.getToken();s.auth.currentUser={...s.user};await expect(s.session.validate()).rejects.toThrow();});
 it("rejects disappeared native claim despite same UID",async()=>{const s=setup();await s.getToken();s.identity.claims.impersonated=false;await expect(s.session.validate()).rejects.toThrow();});
 it("rejects changed native login epoch",async()=>{const s=setup();await s.getToken();s.identity.claims.auth_time=2;await expect(s.session.validate()).rejects.toThrow();});
 it("rejects anonymous before bootstrap",async()=>{const s=setup();s.user.isAnonymous=true;await expect(s.getToken()).rejects.toThrow();expect(s.transport).not.toHaveBeenCalled();});
 it.each([{targetUid:"foreign"},{delegatedBy:"foreign"},{sessionExpiresAtMillis:1999},{tokenExpiresAtMillis:999999999},{version:2},{token:"bad"}])("rejects malformed reply %j",async patch=>{const s=setup();Object.assign(s.body,patch);await expect(s.getToken()).rejects.toThrow();});
 it("checks auth again after network returns",async()=>{const s=setup();s.transport.mockImplementation(async()=>{s.identity.claims.impersonated=false;return {ok:true,json:async()=>s.body};});await expect(s.getToken()).rejects.toThrow();});
});

it("selects QA only for the exact Stage origin and shared-data app/config",()=>{
 const base={appEnvironment:"stage",firebaseProjectId:"miranae-orider-g1",firebaseAppId:"1:289663940841:web:ba08cdae154286e6499878",firebaseFunctionsBase:"https://asia-northeast3-orider-dev.cloudfunctions.net"};
 try {
  vi.stubGlobal("window",{location:{origin:"https://orider-dev.web.app"}});mocks.config=base;expect(()=>assertStageQaConfig()).not.toThrow();
  for(const patch of [{appEnvironment:"production"},{firebaseProjectId:"orider-dev"},{firebaseAppId:"foreign"},{firebaseFunctionsBase:"https://asia-northeast3-miranae-orider-g1.cloudfunctions.net"}]){mocks.config={...base,...patch};expect(()=>assertStageQaConfig()).toThrow();}
  mocks.config=base;for(const origin of ["https://orider.co.kr","https://miranae-orider-g1-stage.web.app"]){vi.stubGlobal("window",{location:{origin}});expect(()=>assertStageQaConfig()).toThrow();}
 } finally {vi.unstubAllGlobals();}
});
