import {act,renderHook} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {useActivityRouteHistorySnapshot} from "./useActivityRouteHistorySnapshot";
const mocks=vi.hoisted(()=>({user:{uid:"owner",isAnonymous:false},services:{auth:{currentUser:{uid:"owner",isAnonymous:false},app:{name:"demo",options:{projectId:"demo-test"}}}},load:vi.fn(),observer:null as null|((u:{uid:string;isAnonymous:boolean})=>void)}));
vi.mock("../contexts/AuthContext",()=>({useAuth:()=>({user:mocks.user})}));
vi.mock("../contexts/FirebaseServicesContext",()=>({useFirebaseServices:()=>mocks.services}));
vi.mock("firebase/auth",()=>({onAuthStateChanged:(_:unknown,cb:typeof mocks.observer)=>{mocks.observer=cb;return vi.fn();}}));
vi.mock("../services/activityRouteEvidence",()=>({observedRouteAvailable:()=>true}));
vi.mock("../services/activityRouteHistorySnapshot",()=>({loadRouteHistorySnapshot:mocks.load}));
const page=()=>({runId:"run",version:0,state:"scanning",expiresAt:Date.now()+3000000,best:null});
beforeEach(()=>{vi.useFakeTimers();mocks.services.auth.currentUser={uid:"owner",isAnonymous:false};mocks.load.mockReset().mockResolvedValue(page());});afterEach(()=>vi.useRealTimers());
it("runs at most twenty sequential calls per click and recovers uncertain writes through status",async()=>{const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));expect(mocks.load).not.toHaveBeenCalled();await act(async()=>h.result.current.start());expect(mocks.load).toHaveBeenCalledTimes(20);expect(h.result.current.status).toBe("ready");mocks.load.mockRejectedValueOnce(Error("network"));await act(async()=>h.result.current.advance());expect(h.result.current.status).toBe("error");mocks.load.mockResolvedValueOnce({...page(),state:"complete"});await act(async()=>h.result.current.advance());expect(mocks.load.mock.calls[21][2].action).toBe("status");expect(mocks.load).toHaveBeenCalledTimes(22);});
it("finishes a small history in one action using each returned version",async()=>{mocks.load.mockResolvedValueOnce({...page(),version:0}).mockResolvedValueOnce({...page(),version:4,state:"reducing"}).mockResolvedValueOnce({...page(),version:5,state:"complete"});const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.start());expect(mocks.load).toHaveBeenCalledTimes(3);expect(mocks.load.mock.calls[2][2].expectedVersion).toBe(4);});

it("expires results and does not automatically start another scan",async()=>{const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.start());act(()=>vi.advanceTimersByTime(3000000));expect(h.result.current.status).toBe("expired");expect(h.result.current.data).toBeNull();expect(mocks.load).toHaveBeenCalledTimes(20);});
it("discards a stopped in-flight response",async()=>{let resolve!:(v:unknown)=>void;mocks.load.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));let p!:Promise<void>;act(()=>{p=h.result.current.start();});act(()=>h.result.current.stop());await act(async()=>h.result.current.start());expect(mocks.load).toHaveBeenCalledOnce();await act(async()=>{resolve(page());await p;});expect(h.result.current.status).toBe("stopped");expect(h.result.current.data).toBeNull();expect(mocks.load).toHaveBeenCalledOnce();});
it("removes rows on same uid replacement and ignores its delayed response",async()=>{let resolve!:(v:unknown)=>void;mocks.load.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));let p!:Promise<void>;act(()=>{p=h.result.current.start();});act(()=>{mocks.services.auth.currentUser={...mocks.services.auth.currentUser};mocks.observer!(mocks.services.auth.currentUser);});await act(async()=>{resolve(page());await p;});expect(h.result.current.data).toBeNull();expect(h.result.current.status).not.toBe("loading");});
it("clears cached progress after content changes or access revocation",async()=>{const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.start());act(()=>window.dispatchEvent(new Event("orider:activity-content-changed")));expect(h.result.current.data).toBeNull();await act(async()=>h.result.current.start());mocks.load.mockRejectedValueOnce({code:"functions/permission-denied"});await act(async()=>h.result.current.advance());expect(h.result.current.data).toBeNull();expect(h.result.current.status).toBe("invalidated");});

it("hides a completed winner while hidden and revalidates only once on focus",async()=>{
 let visibility="visible";Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>visibility});
 const complete={...page(),state:"complete",best:{bestElapsedSec:600}};mocks.load.mockResolvedValueOnce(complete);
 const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.start());expect(h.result.current.data?.best).not.toBeNull();
 act(()=>{visibility="hidden";document.dispatchEvent(new Event("visibilitychange"));});expect(h.result.current.data?.best).toBeNull();
 let resolve!:(v:unknown)=>void;mocks.load.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 act(()=>{visibility="visible";document.dispatchEvent(new Event("visibilitychange"));window.dispatchEvent(new Event("focus"));});
 expect(mocks.load).toHaveBeenCalledTimes(2);expect(mocks.load.mock.calls[1][2].action).toBe("status");expect(h.result.current.data?.best).toBeNull();
 await act(async()=>{resolve(complete);});expect(h.result.current.data?.best).not.toBeNull();
});
it("never keeps a visible best after focus verification fails",async()=>{
 Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});mocks.load.mockResolvedValueOnce({...page(),state:"complete",best:{bestElapsedSec:600}}).mockRejectedValueOnce(Error("network"));
 const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.start());await act(async()=>window.dispatchEvent(new Event("focus")));
 expect(h.result.current.status).toBe("error");expect(h.result.current.data?.best).toBeNull();
});

it("does not reveal a late focus response while hidden and rechecks on return",async()=>{
 let visibility="visible";Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>visibility});const complete={...page(),state:"complete",best:{bestElapsedSec:600}};mocks.load.mockResolvedValueOnce(complete);
 const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.start());let resolve!:(v:unknown)=>void;mocks.load.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));act(()=>window.dispatchEvent(new Event("focus")));
 act(()=>{visibility="hidden";document.dispatchEvent(new Event("visibilitychange"));});await act(async()=>{resolve(complete);});expect(h.result.current.data?.best).toBeNull();expect(mocks.load).toHaveBeenCalledTimes(2);
 mocks.load.mockResolvedValueOnce(complete);await act(async()=>{vi.advanceTimersByTime(501);visibility="visible";document.dispatchEvent(new Event("visibilitychange"));});expect(mocks.load).toHaveBeenCalledTimes(3);expect(h.result.current.data?.best).not.toBeNull();
});

it("keeps a first completion in the background hidden until a fresh status check",async()=>{
 let visibility="visible";Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>visibility});let resolve!:(v:unknown)=>void;mocks.load.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const complete={...page(),state:"complete",best:{bestElapsedSec:600}};
 const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));let pending!:Promise<void>;act(()=>{pending=h.result.current.start();visibility="hidden";document.dispatchEvent(new Event("visibilitychange"));});await act(async()=>{resolve(complete);await pending;});expect(h.result.current.status).toBe("hidden");expect(h.result.current.data?.best).toBeNull();
 mocks.load.mockResolvedValueOnce(complete);await act(async()=>{visibility="visible";document.dispatchEvent(new Event("visibilitychange"));window.dispatchEvent(new Event("focus"));});expect(mocks.load).toHaveBeenCalledTimes(2);expect(h.result.current.data?.best).not.toBeNull();
});
