import {act,renderHook} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {ROUTE_HISTORY_MAX_REQUESTS,useActivityRouteHistorySnapshot} from "./useActivityRouteHistorySnapshot";
const mocks=vi.hoisted(()=>({user:{uid:"owner",isAnonymous:false},services:{auth:{currentUser:{uid:"owner",isAnonymous:false},app:{name:"demo",options:{projectId:"demo-test"}}}},load:vi.fn(),history:vi.fn(),checkpoint:null as null|{runId:string;version:number;expiresAt:number},write:vi.fn(),observer:null as null|((u:{uid:string;isAnonymous:boolean})=>void)}));
vi.mock("./useRouteHistoryCheckpoint",()=>({useRouteHistoryCheckpoint:()=>({value:mocks.checkpoint,write:mocks.write})}));
vi.mock("../contexts/AuthContext",()=>({useAuth:()=>({user:mocks.user})}));
vi.mock("../contexts/FirebaseServicesContext",()=>({useFirebaseServices:()=>mocks.services}));
vi.mock("firebase/auth",()=>({onAuthStateChanged:(_:unknown,cb:typeof mocks.observer)=>{mocks.observer=cb;return vi.fn();}}));
vi.mock("../services/activityRouteEvidence",()=>({observedRouteAvailable:()=>true}));
vi.mock("../services/activityRouteHistorySnapshot",()=>({loadRouteHistorySnapshot:mocks.load,loadRouteHistorySaved:mocks.history}));
const page=()=>({runId:"run",version:0,state:"scanning",expiresAt:Date.now()+3000000,best:null});
beforeEach(()=>{vi.useFakeTimers();Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});mocks.history.mockReset();mocks.checkpoint=null;mocks.write.mockReset();mocks.services.auth.currentUser={uid:"owner",isAnonymous:false};mocks.load.mockReset().mockResolvedValue(page());});afterEach(()=>vi.useRealTimers());
it("runs at most two thousand sequential calls per click and recovers uncertain writes through status",async()=>{const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));expect(mocks.load).not.toHaveBeenCalled();await act(async()=>h.result.current.start());expect(mocks.load).toHaveBeenCalledTimes(ROUTE_HISTORY_MAX_REQUESTS);expect(h.result.current.status).toBe("ready");mocks.load.mockRejectedValueOnce(Error("network"));await act(async()=>h.result.current.advance());expect(h.result.current.status).toBe("error");mocks.load.mockResolvedValueOnce({...page(),state:"complete"});await act(async()=>h.result.current.advance());expect(mocks.load.mock.calls[ROUTE_HISTORY_MAX_REQUESTS+1][2].action).toBe("status");expect(mocks.load).toHaveBeenCalledTimes(ROUTE_HISTORY_MAX_REQUESTS+2);});
it("finishes a small history in one action using each returned version",async()=>{mocks.load.mockResolvedValueOnce({...page(),version:0}).mockResolvedValueOnce({...page(),version:4,state:"reducing"}).mockResolvedValueOnce({...page(),version:5,state:"complete"});const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.start());expect(mocks.load).toHaveBeenCalledTimes(3);expect(mocks.load.mock.calls[2][2].expectedVersion).toBe(4);});

it("expires results and does not automatically start another scan",async()=>{const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.start());act(()=>vi.advanceTimersByTime(3000000));expect(h.result.current.status).toBe("expired");expect(h.result.current.data).toBeNull();expect(mocks.load).toHaveBeenCalledTimes(ROUTE_HISTORY_MAX_REQUESTS);});
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

it("finishes 754 sequential requests with one start and never overlaps dispatch",async()=>{let calls=0,inFlight=0,maximum=0;mocks.load.mockImplementation(async()=>{calls++;maximum=Math.max(maximum,++inFlight);await Promise.resolve();inFlight--;return {...page(),version:calls,state:calls===754?"complete":"scanning"};});const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.start());expect(calls).toBe(754);expect(maximum).toBe(1);expect(h.result.current.data?.state).toBe("complete");});
it("checks server expiry before dispatching the next request",async()=>{const now=Date.now();mocks.load.mockImplementationOnce(async()=>({...page(),expiresAt:now+1})).mockImplementationOnce(async()=>{vi.setSystemTime(now+2);return {...page(),expiresAt:now+1};});const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.start());expect(h.result.current.status).toBe("expired");expect(mocks.load).toHaveBeenCalledTimes(2);});

it("restores only through status, without starting or advancing on mount",async()=>{const expiresAt=Date.now()+100000;mocks.checkpoint={runId:"run",version:8,expiresAt};mocks.load.mockResolvedValueOnce({...page(),version:11,expiresAt});const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));expect(h.result.current.canRecover).toBe(true);expect(h.result.current.data).toBeNull();expect(mocks.load).not.toHaveBeenCalled();await act(async()=>h.result.current.recover());expect(mocks.load).toHaveBeenCalledOnce();expect(mocks.load.mock.calls[0][2]).toMatchObject({action:"status",runId:"run"});expect(h.result.current.data?.version).toBe(11);mocks.load.mockResolvedValueOnce({...page(),version:12,state:"complete",expiresAt});await act(async()=>h.result.current.advance());expect(mocks.load).toHaveBeenCalledTimes(2);expect(mocks.load.mock.calls[1][2]).toMatchObject({action:"advance",expectedVersion:11});});
it("discards restored checkpoint when status no longer matches its lifetime or version",async()=>{mocks.checkpoint={runId:"run",version:8,expiresAt:Date.now()+100000};mocks.load.mockResolvedValueOnce({...page(),version:7,expiresAt:mocks.checkpoint.expiresAt});const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.recover());expect(h.result.current.status).toBe("invalidated");expect(h.result.current.data).toBeNull();expect(mocks.write).toHaveBeenLastCalledWith(null);});

const savedPage=(runId="saved",seconds=600)=>({...page(),asOf:Date.now()-1000,runId,state:"complete",retention:"saved_result",resultFreshness:"historical_as_of",currentSourceChanged:false,best:{bestElapsedSec:seconds}});
it("retains a saved result through its work TTL and a metrics head change without recalculation",async()=>{
 const old=savedPage();mocks.load.mockResolvedValueOnce(old);
 const h=renderHook(({head})=>useActivityRouteHistorySnapshot("owner","anchor","bike",head),{initialProps:{head:"old"}});
 await act(async()=>h.result.current.start());act(()=>vi.advanceTimersByTime(3000001));h.rerender({head:"new-profile-revision"});
 expect(h.result.current.data?.best?.bestElapsedSec).toBe(600);expect(h.result.current.data?.asOf).toBe(old.asOf);expect(mocks.load).toHaveBeenCalledOnce();
});
it("keeps completed A while new B fails and selects old and new successes only after status verification",async()=>{
 const old=savedPage(),next=savedPage("next",590);mocks.load.mockResolvedValueOnce(old).mockRejectedValueOnce(Error("network")).mockResolvedValueOnce(next);
 const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.start());await act(async()=>h.result.current.start());
 expect(h.result.current.data?.best?.bestElapsedSec).toBe(600);expect(h.result.current.status).toBe("error");
 await act(async()=>h.result.current.start());expect(h.result.current.data?.best?.bestElapsedSec).toBe(590);expect(h.result.current.previousResults).toHaveLength(2);
 mocks.load.mockResolvedValueOnce(old);await act(async()=>h.result.current.openSaved("saved"));expect(mocks.load.mock.calls.at(-1)[2]).toMatchObject({action:"status",runId:"saved"});expect(h.result.current.data?.best?.bestElapsedSec).toBe(600);
 mocks.load.mockResolvedValueOnce(next);await act(async()=>h.result.current.openSaved("next"));expect(h.result.current.data?.best?.bestElapsedSec).toBe(590);
});
it.each(["expired","invalidated"])("keeps A when new B is %s, with authority verification for invalidation",async(state)=>{
 const old=savedPage();mocks.load.mockResolvedValueOnce(old).mockResolvedValueOnce({...page(),state}).mockResolvedValueOnce(old);
 const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.start());await act(async()=>h.result.current.start());
 expect(h.result.current.data?.best?.bestElapsedSec).toBe(600);if(state==="invalidated")expect(mocks.load.mock.calls.at(-1)[2]).toMatchObject({action:"status",runId:"saved"});
});
it("stops new B without deleting A or accepting B's late result",async()=>{
 mocks.load.mockResolvedValueOnce(savedPage());const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.start());
 let resolve!:(v:unknown)=>void;mocks.load.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));let task!:Promise<void>;act(()=>{task=h.result.current.start();});act(()=>h.result.current.stop());expect(h.result.current.data?.best?.bestElapsedSec).toBe(600);
 await act(async()=>{resolve(savedPage("late",400));await task;});expect(h.result.current.data?.best?.bestElapsedSec).toBe(600);
});
it("retains source-failed A only after one saved status check and clears actual denied access",async()=>{
 const old=savedPage();mocks.load.mockResolvedValueOnce(old).mockRejectedValueOnce({code:"functions/failed-precondition"}).mockResolvedValueOnce({...old,currentSourceChanged:true});
 const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.start());await act(async()=>h.result.current.start());expect(h.result.current.data?.currentSourceChanged).toBe(true);expect(mocks.load).toHaveBeenCalledTimes(3);
 mocks.load.mockRejectedValueOnce({code:"permission-denied"});await act(async()=>h.result.current.start());expect(h.result.current.data).toBeNull();expect(h.result.current.previousResults).toHaveLength(0);
});
it("loads history on explicit action after remount then validates the chosen saved run",async()=>{
 mocks.history.mockResolvedValue({items:[{runId:"saved",asOf:1,scanned:4,candidateCount:3}],nextCursor:null});mocks.load.mockResolvedValueOnce(savedPage());
 const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));expect(mocks.history).not.toHaveBeenCalled();expect(mocks.load).not.toHaveBeenCalled();
 await act(async()=>h.result.current.loadHistory());expect(h.result.current.history?.items).toHaveLength(1);expect(h.result.current.data).toBeNull();
 await act(async()=>h.result.current.openSaved("saved"));expect(h.result.current.data?.best?.bestElapsedSec).toBe(600);
 mocks.services.auth.currentUser={...mocks.services.auth.currentUser};h.rerender();expect(h.result.current.data).toBeNull();expect(h.result.current.history).toBeNull();
});
it("masks saved results during hidden/focus authority verification and rejects late revocation",async()=>{
 let visibility="visible";Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>visibility});mocks.load.mockResolvedValueOnce(savedPage());
 const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.start());act(()=>{visibility="hidden";document.dispatchEvent(new Event("visibilitychange"));});expect(h.result.current.data?.best).toBeNull();
 mocks.load.mockRejectedValueOnce({code:"not-found"});await act(async()=>{visibility="visible";document.dispatchEvent(new Event("visibilitychange"));});expect(h.result.current.data).toBeNull();
});

it("keeps approved A after temporary focus or other-result selection failure",async()=>{
 mocks.load.mockResolvedValueOnce(savedPage());const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.start());
 mocks.load.mockRejectedValueOnce(Error("network"));await act(async()=>window.dispatchEvent(new Event("focus")));expect(h.result.current.data?.best?.bestElapsedSec).toBe(600);
 mocks.load.mockRejectedValueOnce(Error("network"));await act(async()=>h.result.current.openSaved("other"));expect(h.result.current.data?.runId).toBe("saved");expect(h.result.current.data?.best?.bestElapsedSec).toBe(600);
});
it("does not interpret an unavailable saved-status check as a confirmed revocation",async()=>{
 mocks.load.mockResolvedValueOnce(savedPage()).mockRejectedValueOnce({code:"failed-precondition"}).mockRejectedValueOnce(Error("network"));
 const h=renderHook(()=>useActivityRouteHistorySnapshot("owner","anchor","bike","head"));await act(async()=>h.result.current.start());await act(async()=>h.result.current.start());expect(mocks.load).toHaveBeenCalledTimes(3);expect(h.result.current.data?.best?.bestElapsedSec).toBe(600);expect(h.result.current.status).toBe("error");
});

it("does not let an interrupted focus check hide saved A after a head change",async()=>{
 mocks.load.mockResolvedValueOnce(savedPage());const h=renderHook(({head})=>useActivityRouteHistorySnapshot("owner","anchor","bike",head),{initialProps:{head:"old"}});await act(async()=>h.result.current.start());
 let resolve!:(value:unknown)=>void;mocks.load.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));act(()=>window.dispatchEvent(new Event("focus")));expect(h.result.current.data?.best).toBeNull();h.rerender({head:"new"});expect(h.result.current.data?.best?.bestElapsedSec).toBe(600);
 await act(async()=>resolve(savedPage("late",400)));expect(h.result.current.data?.best?.bestElapsedSec).toBe(600);
});
