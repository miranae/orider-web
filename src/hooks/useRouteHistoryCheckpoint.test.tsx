import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { parseRouteHistoryCheckpoint, useRouteHistoryCheckpoint } from "./useRouteHistoryCheckpoint";
const user=()=>({uid:"owner",isAnonymous:false,metadata:{creationTime:"created",lastSignInTime:"signed-in"}});
const services=()=>({auth:{currentUser:user(),app:{name:"app",options:{projectId:"demo-test"}}}} as unknown as FirebaseServices);
const checkpoint=()=>({runId:"12345678-1234-1234-1234-123456789012",version:8,expiresAt:Date.now()+100000});
beforeEach(()=>{sessionStorage.clear();Object.defineProperty(globalThis,"crypto",{configurable:true,value:webcrypto});});
it("stores only opaque checkpoint fields under a hashed scope and restores without results",async()=>{
 const s=services(),one=renderHook(()=>useRouteHistoryCheckpoint(s,"owner","anchor-bike-revision"));const saved=checkpoint();act(()=>one.result.current.write(saved));await waitFor(()=>expect(sessionStorage.length).toBe(1));
 const key=sessionStorage.key(0)!;expect(key).not.toContain("owner");expect(key).not.toContain("anchor");expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual(saved);one.unmount();
 const two=renderHook(()=>useRouteHistoryCheckpoint(s,"owner","anchor-bike-revision"));await waitFor(()=>expect(two.result.current.value).toEqual(saved));
});
it("does not restore another source scope and invalidates same UID replacement",async()=>{
 const s=services(),one=renderHook(()=>useRouteHistoryCheckpoint(s,"owner","anchor-bike-revision"));act(()=>one.result.current.write(checkpoint()));await waitFor(()=>expect(sessionStorage.length).toBe(1));one.unmount();
 const other=renderHook(()=>useRouteHistoryCheckpoint(s,"owner","another-revision"));expect(other.result.current.value).toBeNull();other.unmount();
 s.auth.currentUser=user() as typeof s.auth.currentUser;
 const replacement=renderHook(()=>useRouteHistoryCheckpoint(s,"owner","anchor-bike-revision"));await waitFor(()=>expect(sessionStorage.length).toBe(0));expect(replacement.result.current.value).toBeNull();
});
it("rejects expired, oversized and extra result fields",()=>{
 expect(parseRouteHistoryCheckpoint(JSON.stringify({...checkpoint(),best:600}))).toBeNull();expect(parseRouteHistoryCheckpoint(JSON.stringify({...checkpoint(),expiresAt:Date.now()-1}))).toBeNull();expect(parseRouteHistoryCheckpoint("x".repeat(257))).toBeNull();expect(parseRouteHistoryCheckpoint(JSON.stringify(checkpoint()))).not.toBeNull();
});
it("preserves persisted progress through initial Firebase auth hydration",async()=>{
 const previous=services(),saved=checkpoint(),first=renderHook(()=>useRouteHistoryCheckpoint(previous,"owner","same-scope"));act(()=>first.result.current.write(saved));await waitFor(()=>expect(sessionStorage.length).toBe(1));first.unmount();
 const hydrated=services();hydrated.auth.currentUser=null;
 const next=renderHook(()=>useRouteHistoryCheckpoint(hydrated,"owner","same-scope"));expect(next.result.current.value).toBeNull();
 hydrated.auth.currentUser=user() as typeof hydrated.auth.currentUser;next.rerender();await waitFor(()=>expect(next.result.current.value).toEqual(saved));
});

it("rejects an old writer after scope changes without corrupting the new checkpoint",async()=>{
 const s=services(),h=renderHook(({scope})=>useRouteHistoryCheckpoint(s,"owner",scope),{initialProps:{scope:"first"}});const oldWrite=h.result.current.write;
 h.rerender({scope:"second"});const next={...checkpoint(),version:17};act(()=>h.result.current.write(next));await waitFor(()=>expect(sessionStorage.length).toBe(1));act(()=>oldWrite({...checkpoint(),version:99}));expect(h.result.current.value).toEqual(next);expect(JSON.parse(sessionStorage.getItem(sessionStorage.key(0)!)!).version).toBe(17);
});
